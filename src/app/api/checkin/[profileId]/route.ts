import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params

  if (!profileId) {
    return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  }

  // Use admin client since front-desk staff may not be the member
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

  // 2. Find their household
  const { data: hm } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('profile_id', profileId)
    .single()

  if (!hm) {
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: 'No Active Pass',
      message: 'Not associated with any household'
    })
  }

  // 3. Check subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, plan_id, end_date, membership_plans(name)')
    .eq('household_id', hm.household_id)
    .eq('status', 'Active')
    .limit(1)
    .maybeSingle()

  if (!subscription) {
    // Check if past_due
    const { data: pastDueSub } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('household_id', hm.household_id)
      .eq('status', 'Past_Due')
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: pastDueSub ? 'Payment Due' : 'No Active Pass',
      message: pastDueSub ? 'Payment is past due' : 'No active membership found'
    })
  }

  // 4. Check waiver
  const { data: waivers } = await supabase
    .from('waivers')
    .select('id')
    .eq('participant_id', profileId)
    .eq('is_valid', true)
    .limit(1)

  if (!waivers || waivers.length === 0) {
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: 'Waiver Expired',
      message: 'No valid waiver on file'
    })
  }

  // 5. All checks passed — record check-in
  // Get a facility (use first available for now)
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
      status_flag: 'Success'
    })
  }

  return NextResponse.json({
    status: 'allowed',
    member: profile,
    flag: 'Success',
    plan: subscription.membership_plans,
    message: 'Welcome! Enjoy your workout.'
  })
}
