import type { SupabaseClient } from '@supabase/supabase-js'
import type { CheckinMethod, CheckinResult } from '@/utils/checkin-code'

/**
 * Check-in domain service.
 *
 * Decides whether a member may enter, logs the attempt to `gym_checkins`,
 * and consumes a day pass when one is used. Kept framework-agnostic so the
 * API route stays a thin HTTP adapter.
 *
 * Access priority:
 *   1. A day pass already used today  -> covers the rest of today (no new pass burned)
 *   2. An unused day pass             -> used up on this scan
 *   3. The household membership       -> normal plan rules (status, daily limit, etc.)
 * A purchased day pass is an explicit intent to use it, so it wins over a membership.
 */

const DEFAULT_TIMEZONE = 'America/Los_Angeles'

/** Values allowed by the gym_checkins.status_flag CHECK constraint. */
type LoggedFlag = 'Success' | 'Waiver Expired' | 'Payment Due' | 'No Active Pass'

/** Outcome of the access step (before the waiver check). */
type Granted = { granted: true; planName: string; passIdForLog?: string; passIdToConsume?: string }
type Denied = { granted: false; displayFlag: string; loggedFlag: LoggedFlag; message: string }
type AccessDecision = Granted | Denied

const NO_ACCESS: Denied = {
  granted: false,
  displayFlag: 'No Active Pass',
  loggedFlag: 'No Active Pass',
  message: 'No active membership or day pass found.',
}

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

/**
 * Day pass access. Returns null when the member has no usable pass.
 * A pass used earlier today keeps covering today, so a second scan the same
 * day doesn't burn another pass (or wrongly fall back to the membership).
 */
async function findDayPassAccess(
  db: SupabaseClient,
  profileId: string,
  startOfToday: Date
): Promise<Granted | null> {
  const { data: usedToday } = await db
    .from('gym_checkins')
    .select('pass_id')
    .eq('profile_id', profileId)
    .eq('status_flag', 'Success')
    .not('pass_id', 'is', null)
    .gte('scanned_at', startOfToday.toISOString())
    .limit(1)
    .maybeSingle()
  if (usedToday?.pass_id) {
    return { granted: true, planName: 'Day Pass', passIdForLog: usedToday.pass_id }
  }

  // Oldest unused, unexpired pass first
  const { data: pass } = await db
    .from('passes')
    .select('id, pass_type')
    .eq('profile_id', profileId)
    .eq('status', 'Available')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (pass) {
    return {
      granted: true,
      planName: pass.pass_type || 'Day Pass',
      passIdForLog: pass.id,
      passIdToConsume: pass.id,
    }
  }
  return null
}

/** Household membership access: status, expiry, plan coverage and daily limit. */
async function evaluateMembership(
  db: SupabaseClient,
  profileId: string,
  startOfToday: Date
): Promise<AccessDecision> {
  const { data: hm } = await db
    .from('household_members')
    .select('household_id, role')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!hm) return NO_ACCESS

  const { data: subscription } = await db
    .from('subscriptions')
    .select('status, plan_id, end_date, payment_method, membership_plans(name, max_dependents, max_daily_checkins)')
    .eq('household_id', hm.household_id)
    .limit(1)
    .maybeSingle()

  const joined = subscription?.membership_plans as unknown
  const plan = (Array.isArray(joined) ? joined[0] : joined) as
    { name: string; max_dependents: number | null; max_daily_checkins: number | null } | null

  switch (subscription?.status) {
    case 'Active':
      break
    case 'Past_Due':
      return {
        granted: false,
        displayFlag: 'Payment Due',
        loggedFlag: 'Payment Due',
        message: 'The last membership payment failed. Ask the member to update their card.',
      }
    case 'Frozen':
      return {
        ...NO_ACCESS,
        displayFlag: 'Membership Frozen',
        message: `${plan?.name ?? 'This membership'} is frozen. Unfreeze it in Admin to allow entry.`,
      }
    case 'Cancelled':
      return {
        ...NO_ACCESS,
        displayFlag: 'Membership Cancelled',
        message: `${plan?.name ?? 'This membership'} was cancelled.`,
      }
    default:
      return NO_ACCESS
  }

  // Cash subscriptions carry an end_date and expire automatically
  if (subscription.end_date && new Date() > new Date(subscription.end_date)) {
    await db
      .from('subscriptions')
      .update({ status: 'Cancelled' })
      .eq('household_id', hm.household_id)
      .eq('status', 'Active')
    return {
      granted: false,
      displayFlag: 'Membership Expired',
      loggedFlag: 'Payment Due',
      message: `Membership expired on ${new Date(subscription.end_date).toLocaleDateString()}. Please renew.`,
    }
  }

  // Individual plans cover the primary account holder only
  if (plan && plan.max_dependents === 0 && hm.role !== 'Primary') {
    return { ...NO_ACCESS, message: `${plan.name} only covers the primary account holder.` }
  }

  const effectiveLimit: number | null =
    plan?.max_daily_checkins ?? (plan?.max_dependents != null ? plan.max_dependents + 1 : null)

  if (effectiveLimit != null) {
    const { data: members } = await db
      .from('household_members')
      .select('profile_id')
      .eq('household_id', hm.household_id)
    const ids = members?.map(m => m.profile_id) ?? []

    if (ids.length > 0) {
      // Only membership check-ins count toward the plan's daily limit;
      // entries paid for with a day pass don't use up a membership slot.
      const { data: today } = await db
        .from('gym_checkins')
        .select('profile_id')
        .in('profile_id', ids)
        .eq('status_flag', 'Success')
        .is('pass_id', null)
        .gte('scanned_at', startOfToday.toISOString())
      const unique = new Set(today?.map(c => c.profile_id))
      if (!unique.has(profileId) && unique.size >= effectiveLimit) {
        return {
          ...NO_ACCESS,
          displayFlag: 'Daily Limit Reached',
          message: `${plan?.name ?? 'This plan'} allows ${effectiveLimit} household member${effectiveLimit === 1 ? '' : 's'} per day.`,
        }
      }
    }
  }

  return { granted: true, planName: plan?.name ?? '' }
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

  // 2. Access: day pass first, then membership
  const startOfToday = startOfTodayIn(facility?.timezone || DEFAULT_TIMEZONE)
  const access =
    (await findDayPassAccess(db, profileId, startOfToday)) ??
    (await evaluateMembership(db, profileId, startOfToday))

  if (!access.granted) {
    await log(access.loggedFlag)
    return {
      httpStatus: 200,
      body: { status: 'denied', flag: access.displayFlag, message: access.message, member: profile },
    }
  }

  // 3. Waiver — required for everyone, including day passes
  const { data: waivers } = await db
    .from('waivers')
    .select('id')
    .eq('participant_id', profileId)
    .eq('is_valid', true)
    .limit(1)

  if (!waivers || waivers.length === 0) {
    await log('Waiver Expired', access.passIdForLog)
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

  // 4. Consume a new day pass (only once access is fully granted).
  //    The status guard makes this safe if two scans race for the same pass.
  if (access.passIdToConsume) {
    const { error } = await db
      .from('passes')
      .update({ status: 'Consumed', updated_at: new Date().toISOString() })
      .eq('id', access.passIdToConsume)
      .eq('status', 'Available')
    if (error) console.error('[checkin] Failed to consume pass:', error.message)
  }

  await log('Success', access.passIdForLog)
  return {
    httpStatus: 200,
    body: {
      status: 'allowed',
      flag: 'Checked In',
      message: 'Welcome! Enjoy your workout.',
      member: profile,
      plan: { name: access.planName },
    },
  }
}
