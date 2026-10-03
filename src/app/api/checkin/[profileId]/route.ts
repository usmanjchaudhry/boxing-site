import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function logCheckin(
  supabase: any,
  profileId: string,
  statusFlag: string,
  passId?: string
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
      pass_id: passId || null
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
    .maybeSingle()

  let hasValidAccess = false
  let passIdToConsume: string | undefined = undefined
  let accessFlag = 'No Active Pass'
  let accessMessage = 'No active membership or pass found'
  let planName = ''

  if (hm) {
    // 3. Check subscription + plan details
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan_id, end_date, payment_method, membership_plans(name, max_dependents, max_daily_checkins)')
      .eq('household_id', hm.household_id)
      .eq('status', 'Active')
      .limit(1)
      .maybeSingle()

    if (subscription) {
      const plan = subscription.membership_plans as any
      planName = plan.name

      // 3b. CHECK EXPIRY for cash subscriptions
      let isExpired = false
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

          isExpired = true
          accessFlag = 'Membership Expired'
          accessMessage = `Membership expired on ${endDate.toLocaleDateString()}. Please renew to regain access.`
        }
      }

      if (!isExpired) {
        // 4. INDIVIDUAL PLAN GATE
        if (plan && plan.max_dependents === 0 && hm.role !== 'Primary') {
          accessFlag = 'No Active Pass'
          accessMessage = `${plan.name} only covers the primary account holder. Upgrade to a Family plan to cover dependents.`
        } else {
          // 4b. CHECK DAILY LIMIT / MAX DEPENDENTS LIMIT
          let underDailyLimit = true
          
          // Calculate the effective daily limit for unique household members
          // It's either explicitly set via max_daily_checkins, or implicitly derived from max_dependents + 1 (primary)
          const explicitLimit = plan?.max_daily_checkins
          const implicitLimit = plan?.max_dependents != null ? plan.max_dependents + 1 : null
          const effectiveLimit = explicitLimit ?? implicitLimit

          if (effectiveLimit != null) {
            // Count unique check-ins for the household today
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            
            const { data: householdMembers } = await supabase
              .from('household_members')
              .select('profile_id')
              .eq('household_id', hm.household_id)
              
            const profileIds = householdMembers?.map(m => m.profile_id) || []
            
            if (profileIds.length > 0) {
              const { data: todayCheckins } = await supabase
                .from('gym_checkins')
                .select('profile_id')
                .in('profile_id', profileIds)
                .eq('status_flag', 'Success')
                .gte('scanned_at', today.toISOString())
                
              const uniqueCheckins = new Set(todayCheckins?.map(c => c.profile_id))
              // If this profile hasn't checked in yet, and limit is reached, deny.
              if (!uniqueCheckins.has(profileId) && uniqueCheckins.size >= effectiveLimit) {
                underDailyLimit = false
                accessFlag = 'No Active Pass'
                accessMessage = `Limit of ${effectiveLimit} household members per day reached for ${plan.name}.`
              }
            }
          }
          
          if (underDailyLimit) {
            hasValidAccess = true
          }
        }
      }
    } else {
      // Check past due
      const { data: pastDueSub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('household_id', hm.household_id)
        .eq('status', 'Past_Due')
        .limit(1)
        .maybeSingle()
        
      if (pastDueSub) {
        accessFlag = 'Payment Due'
        accessMessage = 'Payment is past due'
      }
    }
  }

  // 5. Fallback to Passes table
  if (!hasValidAccess) {
    const { data: availablePass } = await supabase
      .from('passes')
      .select('id, pass_type')
      .eq('profile_id', profileId)
      .eq('status', 'Available')
      .limit(1)
      .maybeSingle()
      
    if (availablePass) {
      hasValidAccess = true
      passIdToConsume = availablePass.id
      planName = availablePass.pass_type
    }
  }

  if (!hasValidAccess) {
    await logCheckin(supabase, profileId, accessFlag)
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: accessFlag,
      message: accessMessage
    })
  }

  // 6. Check waiver (everyone needs a waiver, even day pass)
  const { data: waivers } = await supabase
    .from('waivers')
    .select('id')
    .eq('participant_id', profileId)
    .eq('is_valid', true)
    .limit(1)

  if (!waivers || waivers.length === 0) {
    await logCheckin(supabase, profileId, 'Waiver Expired', passIdToConsume)
    return NextResponse.json({
      status: 'denied',
      member: profile,
      flag: 'Waiver Expired',
      message: 'No valid waiver on file'
    })
  }

  // 7. Consume Pass if applicable
  if (passIdToConsume) {
    await supabase
      .from('passes')
      .update({ status: 'Consumed' })
      .eq('id', passIdToConsume)
  }

  // 8. All checks passed
  await logCheckin(supabase, profileId, 'Success', passIdToConsume)
  return NextResponse.json({
    status: 'allowed',
    member: profile,
    flag: 'Success',
    plan: { name: planName },
    message: 'Welcome! Enjoy your workout.'
  })
}
