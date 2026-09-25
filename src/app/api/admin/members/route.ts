import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

  // Query profiles with household info
  const { data: profiles, error: profilesErr } = await db
    .from('profiles')
    .select(`
      id, first_name, last_name, date_of_birth, role, created_at, auth_user_id,
      household_members(
        role,
        household_id
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (profilesErr) {
    console.error('Failed to fetch profiles:', profilesErr)
    return NextResponse.json({ error: profilesErr.message }, { status: 500 })
  }

  // Get all waivers (by participant_id)
  const { data: waivers } = await db
    .from('waivers')
    .select('participant_id, is_valid')

  const waiverMap: Record<string, boolean> = {}
  for (const w of waivers || []) {
    if (w.is_valid) waiverMap[w.participant_id] = true
  }

  // Get all subscriptions with plan names + stripe subscription ID
  const { data: subs } = await db
    .from('subscriptions')
    .select('household_id, status, stripe_subscription_id, membership_plans(name)')

  const subMap: Record<string, { status: string; planName: string; stripeSubId: string | null }> = {}
  for (const s of subs || []) {
    const plan = s.membership_plans as any
    subMap[s.household_id] = {
      status: s.status,
      planName: plan?.name || 'Unknown',
      stripeSubId: s.stripe_subscription_id
    }
  }

  // Get household stripe_customer_id mapping
  const { data: households } = await db
    .from('households')
    .select('id, stripe_customer_id')

  const householdStripeMap: Record<string, string | null> = {}
  for (const h of households || []) {
    householdStripeMap[h.id] = h.stripe_customer_id
  }

  // Get all household members to build primary→dependent relationships
  const { data: allHouseholdMembers } = await db
    .from('household_members')
    .select('profile_id, household_id, role')

  // Build: householdId → primary profile name
  const householdPrimaryMap: Record<string, string> = {}
  for (const hm of allHouseholdMembers || []) {
    if (hm.role === 'Primary') {
      const primary = (profiles || []).find(p => p.id === hm.profile_id)
      if (primary) {
        householdPrimaryMap[hm.household_id] = `${primary.first_name} ${primary.last_name}`
      }
    }
  }

  // Flatten
  const members = (profiles || []).map(p => {
    const hm = (p.household_members as any[])?.[0]
    const householdId = hm?.household_id
    const sub = householdId ? subMap[householdId] : null
    const stripeCustomerId = householdId ? householdStripeMap[householdId] : null
    const primaryName = householdId && hm?.role === 'Dependent' ? householdPrimaryMap[householdId] : null

    return {
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      role: p.role,
      householdRole: hm?.role || 'N/A',
      subscriptionStatus: sub?.status || 'None',
      planName: sub?.planName || 'No plan',
      hasWaiver: !!waiverMap[p.id],
      joinedAt: p.created_at,
      stripeCustomerId,
      primaryName,
      hasAuth: !!p.auth_user_id, // only users with login accounts can be assigned roles
    }
  })

  return NextResponse.json({ members })
}
