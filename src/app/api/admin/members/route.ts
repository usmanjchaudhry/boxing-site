import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cashMembershipEnded } from '@/utils/membership-expiry'
import { getWaiverStatuses, type WaiverStatus } from '@/utils/waivers'
import { fetchAll } from '@/utils/supabase-paging'
import { fullName } from '@/utils/name-search'

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = getAdminSupabase()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile || !['admin', 'staff'].includes(profile.role)) return null
  return profile
}

// GET /api/admin/members — All members with subscription + waiver + household info
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = getAdminSupabase()

  // Every profile with household info. This used to stop at the newest 100, so older
  // members dropped out of the list (and its search) once the gym grew past that.
  // Supabase also caps each request at 1000 rows, so all of these queries page through.
  let profiles, subs, households, allHouseholdMembers
  try {
    ;[profiles, subs, households, allHouseholdMembers] = await Promise.all([
      fetchAll((from, to) => db
        .from('profiles')
        .select(`
          id, first_name, last_name, date_of_birth, role, created_at, auth_user_id,
          household_members(
            role,
            household_id
          )
        `)
        .order('created_at', { ascending: false })
        .order('id') // tie-breaker so paging never skips or repeats a row
        .range(from, to)),
      // All subscriptions with plan names + stripe subscription ID
      fetchAll((from, to) => db
        .from('subscriptions')
        .select('household_id, status, end_date, payment_method, stripe_subscription_id, membership_plans(name, max_dependents)')
        .order('id')
        .range(from, to)),
      // Household → stripe_customer_id mapping
      fetchAll((from, to) => db
        .from('households')
        .select('id, stripe_customer_id')
        .order('id')
        .range(from, to)),
      // All household members to build primary→dependent relationships
      fetchAll((from, to) => db
        .from('household_members')
        .select('profile_id, household_id, role')
        .order('profile_id')
        .order('household_id')
        .range(from, to)),
    ])
  } catch (e) {
    console.error('Failed to fetch members:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  // Waiver status: current version of every required document (same rule as the scanner)
  let waiverStatuses = new Map<string, WaiverStatus>()
  try {
    waiverStatuses = await getWaiverStatuses(db, profiles)
  } catch (e) {
    console.error('Failed to load waiver statuses:', e)
  }
  const waiverInfo = (id: string) => {
    const s = waiverStatuses.get(id)
    if (!s) return { hasWaiver: false, waiverState: 'unknown', waiverId: null }
    const reasons = new Set(s.missing.map(m => m.reason))
    const waiverState = s.complete ? 'signed'
      : reasons.has('expired') ? 'expired'
      : reasons.has('outdated') || reasons.has('now_adult') ? 'outdated'
      : 'missing'
    return { hasWaiver: s.complete, waiverState, waiverId: s.signedIds.liability ?? null }
  }

  // Cash memberships end on their own. They used to flip to Cancelled only when the
  // member scanned or opened their dashboard, so staff still saw "Active" here.
  // Same rule as the scanner (cashMembershipEnded); also saved so every screen agrees.
  const now = new Date()
  const expiredHouseholds = subs
    .filter(s => cashMembershipEnded(s, now))
    .map(s => s.household_id)
  if (expiredHouseholds.length > 0) {
    await db.from('subscriptions').update({ status: 'Cancelled' })
      .in('household_id', expiredHouseholds).eq('status', 'Active').eq('payment_method', 'cash')
  }

  const subMap: Record<string, { status: string; planName: string; stripeSubId: string | null; maxDependents: number }> = {}
  for (const s of subs) {
    const plan = s.membership_plans as any
    subMap[s.household_id] = {
      status: expiredHouseholds.includes(s.household_id) ? 'Cancelled' : s.status,
      planName: plan?.name || 'Unknown',
      stripeSubId: s.stripe_subscription_id,
      maxDependents: plan?.max_dependents ?? 0
    }
  }

  const householdStripeMap: Record<string, string | null> = {}
  for (const h of households) {
    householdStripeMap[h.id] = h.stripe_customer_id
  }

  // Build: householdId → primary profile name
  const profileById = new Map(profiles.map(p => [p.id, p]))
  const householdPrimaryMap: Record<string, string> = {}
  for (const hm of allHouseholdMembers) {
    if (hm.role === 'Primary') {
      const primary = profileById.get(hm.profile_id)
      if (primary) {
        householdPrimaryMap[hm.household_id] = fullName(primary.first_name, primary.last_name)
      }
    }
  }

  // Flatten
  const members = profiles.map(p => {
    const hm = (p.household_members as any[])?.[0]
    const householdId = hm?.household_id
    const sub = householdId ? subMap[householdId] : null
    const stripeCustomerId = householdId ? householdStripeMap[householdId] : null
    const primaryName = householdId && hm?.role === 'Dependent' ? householdPrimaryMap[householdId] : null

    let subscriptionStatus = sub?.status || 'None'
    let planName = sub?.planName || 'No plan'
    
    // Check if dependent is allowed on this plan
    if (sub && sub.maxDependents === 0 && hm?.role !== 'Primary') {
      subscriptionStatus = 'None'
      planName = 'Not Covered (Indiv. Plan)'
    }

    return {
      id: p.id,
      householdId,
      name: fullName(p.first_name, p.last_name) || 'Unnamed member',
      role: p.role,
      householdRole: hm?.role || 'N/A',
      subscriptionStatus,
      planName,
      ...waiverInfo(p.id),
      joinedAt: p.created_at,
      stripeCustomerId,
      primaryName,
      hasAuth: !!p.auth_user_id, // only users with login accounts can be assigned roles
    }
  })

  return NextResponse.json({ members })
}
