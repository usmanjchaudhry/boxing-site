import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Helper: log every check-in attempt (success or denial) for auditing
async function logCheckin(
  supabase: any,
  profileId: string,
  statusFlag: string
) {
  const { data: facility } = await supabase
    .from('facilities')
    .select('id')
    .limit(1)
    .single()

  if (facility) {
    await supabase.from('gym_checkins').insert({
      profile_id: profileId,
      facility_id: facility.id,
      checkin_method: 'qr_scanner',
      status_flag: statusFlag,
    })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params

  if (!profileId) {
    return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // 1. Get profile
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, date_of_birth')
    .eq('id', profileId)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({
      status: 'error',
      message: 'Member not found',
      flag: 'No Active Pass'
    }, { status: 404 })
  }

  // 2. Find their household + their role
  const { data: hm } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('profile_id', profileId)
    .single()

  if (!hm) {
    await logCheckin(supabase, profileId, 'No Active Pass')
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: 'No Active Pass',
      message: 'Not associated with any household'
    })
  }

  // 3. Check subscription + plan details
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, plan_id, end_date, payment_method, membership_plans(name, max_dependents)')
    .eq('household_id', hm.household_id)
    .eq('status', 'Active')
    .limit(1)
    .maybeSingle()

  if (!subscription) {
    const { data: pastDueSub } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('household_id', hm.household_id)
      .eq('status', 'Past_Due')
      .limit(1)
      .maybeSingle()

    const flag = pastDueSub ? 'Payment Due' : 'No Active Pass'
    await logCheckin(supabase, profileId, flag)
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag,
      message: pastDueSub ? 'Payment is past due' : 'No active membership found'
    })
  }

  // 3b. CHECK EXPIRY for cash subscriptions
  if (subscription.end_date) {
    const endDate = new Date(subscription.end_date)
    const now = new Date()
    if (now > endDate) {
      // Auto-expire the subscription
      await supabase
        .from('subscriptions')
        .update({ status: 'Cancelled' })
        .eq('household_id', hm.household_id)
        .eq('status', 'Active')

      await logCheckin(supabase, profileId, 'Membership Expired')
      return NextResponse.json({
        status: 'denied',
        member: profile,
        flag: 'Membership Expired',
        message: `Membership expired on ${endDate.toLocaleDateString()}. Please renew to regain access.`
      })
    }
  }

  // 4. INDIVIDUAL PLAN GATE
  const plan = subscription.membership_plans as any
  if (plan && plan.max_dependents === 0 && hm.role !== 'Primary') {
    await logCheckin(supabase, profileId, 'No Active Pass')
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: 'No Active Pass',
      plan: { name: plan.name },
      message: `${plan.name} only covers the primary account holder. Upgrade to a Family plan to cover dependents.`
    })
  }

  // 5. Check waiver
  const { data: waivers } = await supabase
    .from('waivers')
    .select('id')
    .eq('participant_id', profileId)
    .eq('is_valid', true)
    .limit(1)

  if (!waivers || waivers.length === 0) {
    await logCheckin(supabase, profileId, 'Waiver Expired')
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: 'Waiver Expired',
      message: 'No valid waiver on file'
    })
  }

  // 6. All checks passed
  await logCheckin(supabase, profileId, 'Success')
  return NextResponse.json({
    status: 'allowed',
    member: profile,
    flag: 'Success',
    plan: { name: plan?.name },
    message: 'Welcome! Enjoy your workout.'
  })
}
