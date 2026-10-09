import type { SupabaseClient } from '@supabase/supabase-js'
import type { CheckinMethod, CheckinResult } from '@/utils/checkin-code'
import { DEFAULT_TIMEZONE, startOfTodayIn } from '@/utils/timezone'
import { effectiveDailyLimit } from '@/utils/plan-rules'
import { cashMembershipEnded, formatEndDate } from '@/utils/membership-expiry'

/**
 * Check-in domain service.
 *
 * Decides whether a member may enter, logs the attempt to `gym_checkins`,
 * and consumes a day pass when one is used. Kept framework-agnostic so the
 * API route stays a thin HTTP adapter.
 *
 * Access priority:
 *   1. An unused day pass       -> used up on this scan (one pass = one entry)
 *   2. The household membership -> normal plan rules (status, daily limit, etc.)
 * A purchased day pass is an explicit intent to use it, so it wins over a membership.
 * A pass is never reused: scanning again after it's used needs another pass or a
 * membership, otherwise staff see "Day Pass Used".
 */

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

/** When this person last got in on a day pass today, or null. */
async function dayPassUsedTodayAt(db: SupabaseClient, profileId: string, startOfToday: Date): Promise<Date | null> {
  const { data } = await db
    .from('gym_checkins')
    .select('scanned_at')
    .eq('profile_id', profileId)
    .eq('status_flag', 'Success')
    .not('pass_id', 'is', null)
    .gte('scanned_at', startOfToday.toISOString())
    .order('scanned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.scanned_at ? new Date(data.scanned_at) : null
}

/** Unused day pass access (oldest first). Returns null when the member has none. */
async function findDayPassAccess(db: SupabaseClient, profileId: string): Promise<Granted | null> {
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
  startOfToday: Date,
  timeZone: string
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

  // Cash memberships end on their own at the start of their end date (gym time)
  if (cashMembershipEnded(subscription, new Date(), timeZone)) {
    await db
      .from('subscriptions')
      .update({ status: 'Cancelled' })
      .eq('household_id', hm.household_id)
      .eq('status', 'Active')
    return {
      granted: false,
      displayFlag: 'Membership Expired',
      loggedFlag: 'Payment Due',
      message: `Cash membership ended on ${formatEndDate(subscription.end_date as string)}. Please renew.`,
    }
  }

  // Individual plans cover the primary account holder only
  if (plan && plan.max_dependents === 0 && hm.role !== 'Primary') {
    return { ...NO_ACCESS, message: `${plan.name} only covers the primary account holder.` }
  }

  const effectiveLimit = effectiveDailyLimit(plan)

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

/** How many times to re-decide when another scan claims the same pass first. */
const MAX_CLAIM_ATTEMPTS = 3

export async function processCheckin(
  db: SupabaseClient,
  profileId: string,
  method: CheckinMethod,
  attempt = 1
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
  const timeZone = facility?.timezone || DEFAULT_TIMEZONE
  const startOfToday = startOfTodayIn(timeZone)
  let access =
    (await findDayPassAccess(db, profileId)) ??
    (await evaluateMembership(db, profileId, startOfToday, timeZone))

  // Denied after already using a day pass today: say so, so staff know why
  if (!access.granted) {
    const usedAt = await dayPassUsedTodayAt(db, profileId, startOfToday)
    if (usedAt) {
      const time = usedAt.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
      const membershipNote = access.displayFlag !== 'No Active Pass' ? ` (${access.displayFlag})` : ''
      access = {
        ...access,
        displayFlag: 'Day Pass Used',
        message: `Their day pass was already used today at ${time}. A day pass is good for one entry${membershipNote}.`,
      }
    }
  }

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

  // 4. Consume the day pass (only once access is fully granted).
  //    The status guard makes the claim atomic: if two scans race for the same
  //    pass, only one claims it and the other re-decides (next pass, membership,
  //    or "Day Pass Used"), so one pass can never let two scans in.
  if (access.passIdToConsume) {
    const { data: claimed, error } = await db
      .from('passes')
      .update({ status: 'Consumed', updated_at: new Date().toISOString() })
      .eq('id', access.passIdToConsume)
      .eq('status', 'Available')
      .select('id')
    if (error) {
      console.error('[checkin] Failed to consume pass:', error.message)
      return {
        httpStatus: 500,
        body: { status: 'error', flag: 'Error', message: 'Could not use the day pass. Please scan again.' },
      }
    }
    if (!claimed || claimed.length === 0) {
      if (attempt < MAX_CLAIM_ATTEMPTS) return processCheckin(db, profileId, method, attempt + 1)
      return {
        httpStatus: 409,
        body: { status: 'error', flag: 'Error', message: 'That day pass was just used. Please scan again.' },
      }
    }
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
