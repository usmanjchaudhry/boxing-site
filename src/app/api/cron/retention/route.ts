import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGymEmail } from '@/utils/email'

// This route is designed to be called by a Vercel Cron Job once per day.
// It checks for members who haven't checked in recently and sends retention emails.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://lafamiliashowtimeboxing.dev'

// Protect this endpoint so only Vercel Cron can call it
function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  // Allow in development
  if (process.env.NODE_ENV === 'development') return true
  return false
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ──────────────────────────────────────────────
// Email templates
// ──────────────────────────────────────────────

function weMissYouEmail(firstName: string) {
  return {
    subject: `${firstName}, we haven't seen you at the gym! 🥊`,
    html: `
      <h2 style="color: #fff; margin-bottom: 10px;">Hey ${firstName},</h2>
      <p style="color: #aaa; line-height: 1.6;">
        We noticed you haven't checked in for a while. The heavy bags miss you! 💪
      </p>
      <p style="color: #aaa; line-height: 1.6;">
        Whether it's been a busy week or you need a fresh start — there's no better time
        than now to get back in the ring.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${SITE_URL}/schedule" style="background-color: #dc2626; color: #fff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 16px;">
          View Class Schedule →
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">
        Your membership is still active. Just show up — we'll take care of the rest.
      </p>
    `
  }
}

function paymentFailedEmail(firstName: string) {
  return {
    subject: `${firstName}, your payment needs attention`,
    html: `
      <h2 style="color: #fff; margin-bottom: 10px;">Hey ${firstName},</h2>
      <p style="color: #aaa; line-height: 1.6;">
        We were unable to process your latest membership payment. This can happen if your
        card expired or there was a temporary issue with your bank.
      </p>
      <p style="color: #aaa; line-height: 1.6;">
        To avoid any interruption to your gym access, please update your payment method.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${SITE_URL}/memberships" style="background-color: #dc2626; color: #fff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 16px;">
          Update Payment Method →
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">
        If you've already resolved this, you can ignore this email.
      </p>
    `
  }
}

function subscriptionExpiringEmail(firstName: string, daysLeft: number) {
  return {
    subject: `${firstName}, your membership expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    html: `
      <h2 style="color: #fff; margin-bottom: 10px;">Hey ${firstName},</h2>
      <p style="color: #aaa; line-height: 1.6;">
        Just a heads up — your gym membership expires in <strong style="color: #f59e0b;">${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.
      </p>
      <p style="color: #aaa; line-height: 1.6;">
        Don't lose access to the gym, classes, and your check-in streak!
        Renew now to keep your momentum going.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${SITE_URL}/memberships" style="background-color: #dc2626; color: #fff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 16px;">
          Renew Membership →
        </a>
      </div>
    `
  }
}

// ──────────────────────────────────────────────
// Main cron handler
// ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const results = { weMissYou: 0, paymentFailed: 0, expiring: 0, errors: 0 }

  try {
    // ── 1. "We miss you" emails ──
    // Find active members who haven't checked in for 14+ days
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    // Get all active household IDs
    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('household_id')
      .eq('status', 'Active')

    if (activeSubs && activeSubs.length > 0) {
      const householdIds = activeSubs.map(s => s.household_id)

      // Get all members in those households
      const { data: activeMembers } = await supabase
        .from('household_members')
        .select('profile_id, role')
        .in('household_id', householdIds)
        .eq('role', 'Primary') // Only email the primary account holder

      if (activeMembers) {
        for (const member of activeMembers) {
          // Check their last check-in
          const { data: lastCheckin } = await supabase
            .from('gym_checkins')
            .select('scanned_at')
            .eq('profile_id', member.profile_id)
            .eq('status_flag', 'Success')
            .order('scanned_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const shouldSend = !lastCheckin || new Date(lastCheckin.scanned_at) < fourteenDaysAgo

          if (shouldSend) {
            // Get their profile info
            const { data: profile } = await supabase
              .from('profiles')
              .select('first_name, email')
              .eq('id', member.profile_id)
              .single()

            if (profile?.email) {
              const email = weMissYouEmail(profile.first_name)
              await sendGymEmail(profile.email, email.subject, email.html)
              results.weMissYou++
            }
          }
        }
      }
    }

    // ── 2. Payment failed reminders ──
    // Find past-due subscriptions and remind the primary member
    const { data: pastDueSubs } = await supabase
      .from('subscriptions')
      .select('household_id')
      .eq('status', 'Past_Due')

    if (pastDueSubs) {
      for (const sub of pastDueSubs) {
        const { data: primary } = await supabase
          .from('household_members')
          .select('profile_id')
          .eq('household_id', sub.household_id)
          .eq('role', 'Primary')
          .single()

        if (primary) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, email')
            .eq('id', primary.profile_id)
            .single()

          if (profile?.email) {
            const email = paymentFailedEmail(profile.first_name)
            await sendGymEmail(profile.email, email.subject, email.html)
            results.paymentFailed++
          }
        }
      }
    }

    // ── 3. Subscription expiring soon (cash/time-limited plans) ──
    // Find subscriptions expiring in the next 3 days
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    const today = new Date().toISOString().split('T')[0]
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0]

    const { data: expiringSubs } = await supabase
      .from('subscriptions')
      .select('household_id, end_date')
      .eq('status', 'Active')
      .not('end_date', 'is', null)
      .gte('end_date', today)
      .lte('end_date', threeDaysStr)

    if (expiringSubs) {
      for (const sub of expiringSubs) {
        const daysLeft = Math.ceil(
          (new Date(sub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )

        const { data: primary } = await supabase
          .from('household_members')
          .select('profile_id')
          .eq('household_id', sub.household_id)
          .eq('role', 'Primary')
          .single()

        if (primary) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, email')
            .eq('id', primary.profile_id)
            .single()

          if (profile?.email) {
            const email = subscriptionExpiringEmail(profile.first_name, daysLeft)
            await sendGymEmail(profile.email, email.subject, email.html)
            results.expiring++
          }
        }
      }
    }

  } catch (err: any) {
    console.error('Retention cron error:', err)
    results.errors++
    return NextResponse.json({ error: err.message, results }, { status: 500 })
  }

  console.log('Retention cron completed:', results)
  return NextResponse.json({
    message: 'Retention emails sent',
    results,
    timestamp: new Date().toISOString()
  })
}
