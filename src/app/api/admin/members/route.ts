import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cashMembershipEnded } from '@/utils/membership-expiry'
import { getWaiverStatuses, type WaiverStatus } from '@/utils/waivers'
import { fetchAll } from '@/utils/supabase-paging'
import { fullName } from '@/utils/name-search'
import { nextPayment, type NextPayment } from '@/utils/next-payment'
import { DEFAULT_TIMEZONE, localDateString } from '@/utils/timezone'

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

type PlanJoin = { name?: string; max_dependents?: number | null; price_cents?: number | null; billing_interval?: string | null }

// GET /api/admin/members — All members with subscription + waiver + household info
// GET /api/admin/members?archived=1 — Archived members only (admins only)
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const archivedView = request.nextUrl.searchParams.get('archived') === '1'
  if (archivedView && admin.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = getAdminSupabase()

  // Every profile with household info. This used to stop at the newest 100, so older
  // members dropped out of the list (and its search) once the gym grew past that.
  // Supabase also caps each request at 1000 rows, so all of these queries page through.
  let allProfiles, subs, households, allHouseholdMembers, cashPayments, facility
  try {
    ;[allProfiles, subs, households, allHouseholdMembers, cashPayments, facility] = await Promise.all([
      fetchAll((from, to) => db
        .from('profiles')
        .select(`
          id, first_name, last_name, date_of_birth, role, created_at, auth_user_id, deleted_at,
          household_members(
            role,
            household_id
          )
        `)
        .order('created_at', { ascending: false })
        .order('id') // tie-breaker so paging never skips or repeats a row
        .range(from, to)),
      // All subscriptions with plan details + stripe subscription ID
      fetchAll((from, to) => db
        .from('subscriptions')
        .select('id, household_id, status, end_date, payment_method, stripe_subscription_id, membership_plans(name, max_dependents, price_cents, billing_interval)')
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
      // Cash payments, newest first: a cash member's next payment shows what they paid last
      fetchAll<{ subscription_id: string; amount_cents: number }>((from, to) => db
        .from('cash_payments')
        .select('subscription_id, amount_cents')
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)),
      db.from('facilities').select('timezone').limit(1).maybeSingle().then(r => r.data),
    ])
  } catch (e) {
    console.error('Failed to fetch members:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  // Archived people are hidden everywhere except the Archived view
  const profiles = allProfiles.filter(p => archivedView ? !!p.deleted_at : !p.deleted_at)

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
  const timeZone = facility?.timezone || DEFAULT_TIMEZONE
  const today = localDateString(now, timeZone)
  const expiredHouseholds = subs
    .filter(s => cashMembershipEnded(s, now, timeZone))
    .map(s => s.household_id)
  if (expiredHouseholds.length > 0) {
    await db.from('subscriptions').update({ status: 'Cancelled' })
      .in('household_id', expiredHouseholds).eq('status', 'Active').eq('payment_method', 'cash')
  }

  // Most recent cash amount per subscription (list is newest first)
  const lastCashAmount = new Map<string, number>()
  for (const cp of cashPayments) {
    if (!lastCashAmount.has(cp.subscription_id)) lastCashAmount.set(cp.subscription_id, cp.amount_cents)
  }

  const subMap: Record<string, { status: string; planName: string; stripeSubId: string | null; maxDependents: number; nextPayment: NextPayment }> = {}
  for (const s of subs) {
    const plan = (Array.isArray(s.membership_plans) ? s.membership_plans[0] : s.membership_plans) as PlanJoin | null
    const status = expiredHouseholds.includes(s.household_id) ? 'Cancelled' : s.status
    const isCash = (s.payment_method ?? '').toLowerCase() === 'cash'
    subMap[s.household_id] = {
      status,
      planName: plan?.name || 'Unknown',
      stripeSubId: s.stripe_subscription_id,
      maxDependents: plan?.max_dependents ?? 0,
      nextPayment: nextPayment({
        status,
        paymentMethod: s.payment_method,
        endDate: s.end_date,
        amountCents: (isCash ? lastCashAmount.get(s.id) : undefined) ?? plan?.price_cents ?? null,
        interval: plan?.billing_interval ?? null,
      }, today),
    }
  }

  const householdStripeMap: Record<string, string | null> = {}
  for (const h of households) {
    householdStripeMap[h.id] = h.stripe_customer_id
  }

  // Build: householdId → primary profile name
  const profileById = new Map(allProfiles.map(p => [p.id, p]))
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
    const hm = (p.household_members as { role: string; household_id: string }[] | null)?.[0]
    const householdId = hm?.household_id
    const sub = householdId ? subMap[householdId] : null
    const stripeCustomerId = householdId ? householdStripeMap[householdId] : null
    const primaryName = householdId && hm?.role === 'Dependent' ? householdPrimaryMap[householdId] : null

    let subscriptionStatus = sub?.status || 'None'
    let planName = sub?.planName || 'No plan'
    let memberNextPayment: NextPayment = sub?.nextPayment ?? { kind: 'none' }

    // Check if dependent is allowed on this plan
    if (sub && sub.maxDependents === 0 && hm?.role !== 'Primary') {
      subscriptionStatus = 'None'
      planName = 'Not Covered (Indiv. Plan)'
      memberNextPayment = { kind: 'none' }
    }

    return {
      id: p.id,
      householdId,
      name: fullName(p.first_name, p.last_name) || 'Unnamed member',
      role: p.role,
      householdRole: hm?.role || 'N/A',
      subscriptionStatus,
      planName,
      nextPayment: memberNextPayment,
      ...waiverInfo(p.id),
      joinedAt: p.created_at,
      archivedAt: p.deleted_at,
      stripeCustomerId,
      primaryName,
      hasAuth: !!p.auth_user_id, // only users with login accounts can be assigned roles
    }
  })

  return NextResponse.json({ members })
}
