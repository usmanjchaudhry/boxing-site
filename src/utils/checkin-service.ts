import type { SupabaseClient } from '@supabase/supabase-js'
import type { CheckinMethod, CheckinResult } from '@/utils/checkin-code'

/**
 * Check-in domain service.
 *
 * Decides whether a member may enter, logs the attempt to `gym_checkins`,
 * and consumes a day pass when one is used. Kept framework-agnostic so the
 * API route stays a thin HTTP adapter.
 */

/** A repeat scan of the same member inside this window is treated as the same visit. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000
const DEFAULT_TIMEZONE = 'America/Los_Angeles'

/** Values allowed by the gym_checkins.status_flag CHECK constraint. */
type LoggedFlag = 'Success' | 'Waiver Expired' | 'Payment Due' | 'No Active Pass'

/** Wall-clock parts of `date` as seen in `timeZone`. */
function zonedParts(date: Date, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map(x => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second }
}

/**
 * UTC instant of local midnight "today" in the given IANA timezone.
 * Vercel servers run in UTC, so `setHours(0,0,0,0)` would reset the
 * daily limit at 5 PM Pacific instead of midnight.
 */
function startOfTodayIn(timeZone: string): Date {
  const today = zonedParts(new Date(), timeZone)
  const guess = Date.UTC(today.y, today.m - 1, today.d)
  const seen = zonedParts(new Date(guess), timeZone)
  const offsetMs = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.min, seen.s) - guess
  return new Date(guess - offsetMs)
}

export async function processCheckin(
  db: SupabaseClient,
  profileId: string,
  method: CheckinMethod
): Promise<{ httpStatus: number; body: CheckinResult }> {
  const { data: facility } = await db
    .from('facilities')
    .select('id, timezone')
    .limit(1)
    .maybeSingle()

  const log = async (flag: LoggedFlag, passId?: string) => {
    if (!facility) {
      console.error('[checkin] No facility row found — check-in not logged')
      return
    }
    const { error } = await db.from('gym_checkins').insert({
      profile_id: profileId,
      facility_id: facility.id,
      checkin_method: method,
      status_flag: flag,
      pass_id: passId || null,
    })
    if (error) console.error('[checkin] Failed to log check-in:', error.message)
  }

  // 1. Profile
  const { data: profile } = await db
    .from('profiles')
    .select('id, first_name, last_name, date_of_birth')
    .eq('id', profileId)
    .maybeSingle()

  if (!profile) {
    return {
      httpStatus: 404,
      body: { status: 'error', flag: 'Not Found', message: 'No member matches this QR code.' },
    }
  }

  // 2. Repeat scan moments after a successful check-in: let them in again, but
  //    don't write a second log row (keeps "Today's check-ins" accurate) and
  //    don't re-evaluate access (a day pass was already consumed on the first scan).
  const { data: recent } = await db
    .from('gym_checkins')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status_flag', 'Success')
    .gte('scanned_at', new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString())
    .limit(1)
    .maybeSingle()

  if (recent) {
    return {
      httpStatus: 200,
      body: {
        status: 'allowed',
        flag: 'Checked In',
        message: 'Welcome! Enjoy your workout.',
        member: profile,
        duplicate: true,
      },
    }
  }

  // 3. Household + role
  const { data: hm } = await db
    .from('household_members')
    .select('household_id, role')
    .eq('profile_id', profileId)
    .maybeSingle()

  let hasValidAccess = false
  let passIdToConsume: string | undefined
  let displayFlag = 'No Active Pass'
  let loggedFlag: LoggedFlag = 'No Active Pass'
  let message = 'No active membership or day pass found.'
  let planName = ''

  if (hm) {
    const { data: subscription } = await db
      .from('subscriptions')
      .select('status, plan_id, end_date, payment_method, membership_plans(name, max_dependents, max_daily_checkins)')
      .eq('household_id', hm.household_id)
      .eq('status', 'Active')
      .limit(1)
      .maybeSingle()

    if (subscription) {
      const joined = subscription.membership_plans as unknown
      const plan = (Array.isArray(joined) ? joined[0] : joined) as
        { name: string; max_dependents: number | null; max_daily_checkins: number | null } | null
      planName = plan?.name ?? ''

      // Cash subscriptions carry an end_date and expire automatically
      const expired = subscription.end_date && new Date() > new Date(subscription.end_date)
      if (expired) {
        await db
          .from('subscriptions')
          .update({ status: 'Cancelled' })
          .eq('household_id', hm.household_id)
          .eq('status', 'Active')
        displayFlag = 'Membership Expired'
        loggedFlag = 'Payment Due'
        message = `Membership expired on ${new Date(subscription.end_date).toLocaleDateString()}. Please renew.`
      } else if (plan && plan.max_dependents === 0 && hm.role !== 'Primary') {
        // Individual plans cover the primary account holder only
        message = `${plan.name} only covers the primary account holder.`
      } else {
        const effectiveLimit: number | null =
          plan?.max_daily_checkins ?? (plan?.max_dependents != null ? plan.max_dependents + 1 : null)

        let underDailyLimit = true
        if (effectiveLimit != null) {
          const { data: members } = await db
            .from('household_members')
            .select('profile_id')
            .eq('household_id', hm.household_id)
          const ids = members?.map(m => m.profile_id) ?? []

          if (ids.length > 0) {
            const { data: today } = await db
              .from('gym_checkins')
              .select('profile_id')
              .in('profile_id', ids)
              .eq('status_flag', 'Success')
              .gte('scanned_at', startOfTodayIn(facility?.timezone || DEFAULT_TIMEZONE).toISOString())
            const unique = new Set(today?.map(c => c.profile_id))
            if (!unique.has(profileId) && unique.size >= effectiveLimit) {
              underDailyLimit = false
              displayFlag = 'Daily Limit Reached'
              message = `${plan?.name ?? 'This plan'} allows ${effectiveLimit} household member${effectiveLimit === 1 ? '' : 's'} per day.`
            }
          }
        }
        hasValidAccess = underDailyLimit
      }
    } else {
      const { data: pastDue } = await db
        .from('subscriptions')
        .select('status')
        .eq('household_id', hm.household_id)
        .eq('status', 'Past_Due')
        .limit(1)
        .maybeSingle()
      if (pastDue) {
        displayFlag = 'Payment Due'
        loggedFlag = 'Payment Due'
        message = 'The last membership payment failed. Ask the member to update their card.'
      }
    }
  }

  // 4. Fall back to an unused day pass
  if (!hasValidAccess) {
    const { data: pass } = await db
      .from('passes')
      .select('id, pass_type')
      .eq('profile_id', profileId)
      .eq('status', 'Available')
      .limit(1)
      .maybeSingle()
    if (pass) {
      hasValidAccess = true
      passIdToConsume = pass.id
      planName = pass.pass_type
    }
  }

  if (!hasValidAccess) {
    await log(loggedFlag)
    return { httpStatus: 200, body: { status: 'denied', flag: displayFlag, message, member: profile } }
  }

  // 5. Waiver — required for everyone, including day passes
  const { data: waivers } = await db
    .from('waivers')
    .select('id')
    .eq('participant_id', profileId)
    .eq('is_valid', true)
    .limit(1)

  if (!waivers || waivers.length === 0) {
    await log('Waiver Expired', passIdToConsume)
    return {
      httpStatus: 200,
      body: {
        status: 'denied',
        flag: 'Waiver Required',
        message: 'No signed waiver on file. Ask the member to sign it in the app.',
        member: profile,
      },
    }
  }

  // 6. Consume the day pass (only once access is fully granted)
  if (passIdToConsume) {
    await db.from('passes').update({ status: 'Consumed' }).eq('id', passIdToConsume)
  }

  await log('Success', passIdToConsume)
  return {
    httpStatus: 200,
    body: {
      status: 'allowed',
      flag: 'Checked In',
      message: 'Welcome! Enjoy your workout.',
      member: profile,
      plan: { name: planName },
    },
  }
}
