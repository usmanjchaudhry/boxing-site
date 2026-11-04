import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { fullName } from '@/utils/name-search'

/**
 * Archiving members (server-only).
 *
 * Archive = "soft delete". The person disappears from member lists, searches,
 * the scanner and gym emails, can't log in or check in, and any card membership
 * is cancelled in Stripe so they stop being charged. Their waivers, check-ins and
 * payment history are kept, so they can be restored later.
 *
 * Archiving a household's primary member archives the whole household (everyone
 * on it), with the same timestamp so a restore brings back exactly that group.
 * Archiving a dependent archives only them.
 *
 * Permanent delete is only for archived accounts with no history at all (test or
 * junk sign-ups): no check-ins, day passes or payments.
 */

/** Long enough to mean "until restored" (100 years). */
const BAN_FOREVER = '876000h'

/** Stripe subscription statuses that can still charge (or resume charging). */
const LIVE_STRIPE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])

export class ArchiveError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

type Person = { id: string; first_name: string | null; last_name: string | null; role: string | null; auth_user_id: string | null; deleted_at: string | null }

export interface ArchiveScope {
  target: Person
  householdId: string | null
  householdRole: string | null
  /** Everyone affected: the whole household for a primary, otherwise just the target. */
  people: Person[]
}

const PERSON_COLUMNS = 'id, first_name, last_name, role, auth_user_id, deleted_at'

/** Who an archive/restore/delete of `profileId` affects. */
export async function getScope(db: SupabaseClient, profileId: string): Promise<ArchiveScope> {
  const { data: target, error } = await db.from('profiles').select(PERSON_COLUMNS).eq('id', profileId).maybeSingle<Person>()
  if (error) throw new ArchiveError(error.message, 500)
  if (!target) throw new ArchiveError('Member not found', 404)

  const { data: hm } = await db.from('household_members').select('household_id, role').eq('profile_id', profileId).limit(1).maybeSingle()
  if (!hm || hm.role !== 'Primary') {
    return { target, householdId: hm?.household_id ?? null, householdRole: hm?.role ?? null, people: [target] }
  }

  const { data: links } = await db.from('household_members').select('profile_id').eq('household_id', hm.household_id)
  const ids = [...new Set([profileId, ...(links ?? []).map(l => l.profile_id)])]
  const { data: people, error: peopleErr } = await db.from('profiles').select(PERSON_COLUMNS).in('id', ids)
  if (peopleErr) throw new ArchiveError(peopleErr.message, 500)
  // Target first, then the rest by name
  const others = ((people ?? []) as Person[]).filter(p => p.id !== profileId)
    .sort((a, b) => fullName(a.first_name, a.last_name).localeCompare(fullName(b.first_name, b.last_name)))
  return { target, householdId: hm.household_id, householdRole: 'Primary', people: [target, ...others] }
}

/** Staff and admins must be changed to "member" first, so nobody locks the gym out by accident. */
function assertArchivable(scope: ArchiveScope, actingAdminId: string) {
  if (scope.people.some(p => p.id === actingAdminId)) throw new ArchiveError('You cannot archive your own account.')
  const staff = scope.people.find(p => p.role === 'admin' || p.role === 'staff')
  if (staff) {
    throw new ArchiveError(`${fullName(staff.first_name, staff.last_name)} is ${staff.role === 'admin' ? 'an admin' : 'staff'}. Change their role to member first.`)
  }
}

/**
 * Cancel every Stripe subscription that could still charge this household, right away
 * (no refund). Throws if Stripe can't be reached, so we never archive someone who is
 * still being billed.
 */
async function cancelHouseholdBilling(db: SupabaseClient, stripe: Stripe, householdId: string): Promise<number> {
  const [{ data: sub }, { data: household }] = await Promise.all([
    db.from('subscriptions').select('id, status, payment_method, stripe_subscription_id').eq('household_id', householdId).limit(1).maybeSingle(),
    db.from('households').select('stripe_customer_id').eq('id', householdId).maybeSingle(),
  ])

  const toCancel = new Set<string>()
  if (household?.stripe_customer_id) {
    for await (const s of stripe.subscriptions.list({ customer: household.stripe_customer_id, status: 'all', limit: 100 })) {
      if (LIVE_STRIPE_STATUSES.has(s.status)) toCancel.add(s.id)
    }
  }
  if (sub?.stripe_subscription_id) {
    try {
      const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      if (LIVE_STRIPE_STATUSES.has(s.status)) toCancel.add(s.id)
    } catch (e) {
      // Already deleted in Stripe: nothing to cancel
      if ((e as { statusCode?: number }).statusCode !== 404) throw e
    }
  }

  for (const id of toCancel) {
    try {
      await stripe.subscriptions.cancel(id)
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e
    }
  }

  // Card memberships are now over. Cash/comp memberships aren't billed, so they're
  // left as-is: if the member is restored, any time they paid for is still there.
  const isCard = !!sub && ((sub.payment_method ?? '').toLowerCase() === 'stripe' || !!sub.stripe_subscription_id)
  if (sub && isCard && sub.status !== 'Cancelled') {
    await db.from('subscriptions').update({ status: 'Cancelled' }).eq('id', sub.id)
  }
  return toCancel.size
}

export interface ArchiveResult { archived: string[]; stripeCancelled: number; warnings: string[] }

export async function archiveMember(db: SupabaseClient, stripe: Stripe, profileId: string, actingAdminId: string): Promise<ArchiveResult> {
  const scope = await getScope(db, profileId)
  if (scope.target.deleted_at) throw new ArchiveError('This member is already archived.')
  assertArchivable(scope, actingAdminId)

  // 1. Stop billing first (primary only: dependents ride on the primary's membership)
  let stripeCancelled = 0
  if (scope.householdRole === 'Primary' && scope.householdId) {
    try {
      stripeCancelled = await cancelHouseholdBilling(db, stripe, scope.householdId)
    } catch (e) {
      console.error('[archive] Stripe cancel failed:', e)
      throw new ArchiveError('Could not cancel their card membership in Stripe, so nothing was archived. Try again in a minute.', 502)
    }
  }

  // 2. Hide them (one timestamp for the group, so restore brings back the same people)
  const at = new Date().toISOString()
  const people = scope.people.filter(p => !p.deleted_at)
  const { error } = await db.from('profiles').update({ deleted_at: at }).in('id', people.map(p => p.id))
  if (error) throw new ArchiveError(`Could not archive: ${error.message}`, 500)
  if (scope.householdRole === 'Primary' && scope.householdId) {
    await db.from('households').update({ deleted_at: at }).eq('id', scope.householdId)
  }

  // 3. Block login (people with an account; dependents usually have none)
  const warnings: string[] = []
  for (const p of people.filter(p => p.auth_user_id)) {
    const { error: banErr } = await db.auth.admin.updateUserById(p.auth_user_id!, { ban_duration: BAN_FOREVER })
    if (banErr) {
      console.error('[archive] Could not block login for', p.id, banErr.message)
      warnings.push(`Could not block login for ${fullName(p.first_name, p.last_name)}. They are hidden and can't check in, but try archiving again later.`)
    }
  }

  return { archived: people.map(p => fullName(p.first_name, p.last_name)), stripeCancelled, warnings }
}

export interface RestoreResult { restored: string[]; hadCardMembership: boolean; warnings: string[] }

export async function restoreMember(db: SupabaseClient, profileId: string): Promise<RestoreResult> {
  const scope = await getScope(db, profileId)
  if (!scope.target.deleted_at) throw new ArchiveError('This member is not archived.')

  // A dependent can't come back on their own while their whole household is archived
  if (scope.householdRole !== 'Primary' && scope.householdId) {
    const { data: primaryLink } = await db.from('household_members').select('profile_id').eq('household_id', scope.householdId).eq('role', 'Primary').maybeSingle()
    if (primaryLink) {
      const { data: primary } = await db.from('profiles').select('first_name, last_name, deleted_at').eq('id', primaryLink.profile_id).maybeSingle()
      if (primary?.deleted_at) throw new ArchiveError(`Restore ${fullName(primary.first_name, primary.last_name)} first. Their household is archived.`)
    }
  }

  // Bring back the people archived together with the target (same timestamp)
  const people = scope.people.filter(p => p.deleted_at && p.deleted_at === scope.target.deleted_at)
  const { error } = await db.from('profiles').update({ deleted_at: null }).in('id', people.map(p => p.id))
  if (error) throw new ArchiveError(`Could not restore: ${error.message}`, 500)
  if (scope.householdRole === 'Primary' && scope.householdId) {
    await db.from('households').update({ deleted_at: null }).eq('id', scope.householdId)
  }

  const warnings: string[] = []
  for (const p of people.filter(p => p.auth_user_id)) {
    const { error: banErr } = await db.auth.admin.updateUserById(p.auth_user_id!, { ban_duration: 'none' })
    if (banErr) {
      console.error('[restore] Could not unblock login for', p.id, banErr.message)
      warnings.push(`Could not re-enable login for ${fullName(p.first_name, p.last_name)}.`)
    }
  }

  let hadCardMembership = false
  if (scope.householdRole === 'Primary' && scope.householdId) {
    const { data: sub } = await db.from('subscriptions').select('payment_method, stripe_subscription_id, status').eq('household_id', scope.householdId).limit(1).maybeSingle()
    hadCardMembership = !!sub && sub.status === 'Cancelled' && ((sub.payment_method ?? '').toLowerCase() === 'stripe' || !!sub.stripe_subscription_id)
  }

  return { restored: people.map(p => fullName(p.first_name, p.last_name)), hadCardMembership, warnings }
}

/** Reasons this archived group can't be permanently deleted (empty = OK to delete). */
export async function historyBlockingDelete(db: SupabaseClient, stripe: Stripe, scope: ArchiveScope): Promise<string[]> {
  const ids = scope.people.map(p => p.id)
  const count = async (table: string, column: string, values: string[]) => {
    if (values.length === 0) return 0
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).in(column, values)
    if (error) {
      // A table this database doesn't have can't hold history
      if (/does not exist|schema cache/i.test(error.message)) return 0
      throw new ArchiveError(`Could not check ${table}: ${error.message}`, 500)
    }
    return count ?? 0
  }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  const reasons: string[] = []
  const checkins = await count('gym_checkins', 'profile_id', ids)
  if (checkins) reasons.push(plural(checkins, 'check-in'))
  const passes = await count('passes', 'profile_id', ids)
  if (passes) reasons.push(`${passes} day pass${passes === 1 ? '' : 'es'}`)
  const bookings = await count('class_bookings', 'profile_id', ids)
  if (bookings) reasons.push(plural(bookings, 'class booking'))
  const receipts = await count('payment_receipts', 'paid_by_profile_id', ids)
  if (receipts) reasons.push(plural(receipts, 'receipt'))
  // Waivers they signed for someone outside this group belong to that person: never delete those
  const { count: signedForOthers, error: signedErr } = await db.from('waivers').select('*', { count: 'exact', head: true })
    .in('signed_by_id', ids).not('participant_id', 'in', `(${ids.join(',')})`)
  if (signedErr) throw new ArchiveError(`Could not check waivers: ${signedErr.message}`, 500)
  if (signedForOthers) reasons.push(`${plural(signedForOthers, 'waiver')} signed for other people`)

  if (scope.householdRole === 'Primary' && scope.householdId) {
    const cash = await count('cash_payments', 'household_id', [scope.householdId])
    if (cash) reasons.push(plural(cash, 'cash payment'))
    const { data: household } = await db.from('households').select('stripe_customer_id').eq('id', scope.householdId).maybeSingle()
    if (household?.stripe_customer_id) {
      try {
        const charges = await stripe.charges.list({ customer: household.stripe_customer_id, limit: 100 })
        const paid = charges.data.filter(c => c.paid).length
        if (paid) reasons.push(`${paid}${charges.has_more ? '+' : ''} card payment${paid === 1 ? '' : 's'}`)
      } catch (e) {
        if ((e as { statusCode?: number }).statusCode !== 404) {
          throw new ArchiveError('Could not check their Stripe payment history. Try again in a minute.', 502)
        }
      }
    }
  }
  return reasons
}

export async function permanentlyDeleteMember(db: SupabaseClient, stripe: Stripe, profileId: string, actingAdminId: string): Promise<{ deleted: string[] }> {
  const scope = await getScope(db, profileId)
  if (!scope.target.deleted_at) throw new ArchiveError('Archive this member first. Only archived members can be permanently deleted.')
  assertArchivable(scope, actingAdminId)
  // A primary's delete takes the household; only allow it when everyone on it is archived
  const active = scope.people.find(p => !p.deleted_at)
  if (active) throw new ArchiveError(`${fullName(active.first_name, active.last_name)} on this household is not archived.`)

  const reasons = await historyBlockingDelete(db, stripe, scope)
  if (reasons.length) {
    throw new ArchiveError(`Has history (${reasons.join(', ')}), so it stays archived. Permanent delete is only for accounts that never used the gym.`, 409)
  }

  const ids = scope.people.map(p => p.id)
  const fail = (step: string, message: string) => { throw new ArchiveError(`Could not delete (${step}): ${message}`, 500) }

  // Household first (its subscription doesn't cascade), then everything tied to these people
  if (scope.householdRole === 'Primary' && scope.householdId) {
    let r = await db.from('subscriptions').delete().eq('household_id', scope.householdId)
    if (r.error) fail('membership', r.error.message)
    r = await db.from('household_members').delete().eq('household_id', scope.householdId)
    if (r.error) fail('household', r.error.message)
    r = await db.from('households').delete().eq('id', scope.householdId)
    if (r.error) fail('household', r.error.message)
  } else {
    const r = await db.from('household_members').delete().in('profile_id', ids)
    if (r.error) fail('household', r.error.message)
  }
  for (const [table, column] of [['relationships', 'guardian_id'], ['relationships', 'minor_id'], ['waiver_requests', 'participant_id'], ['waivers', 'participant_id'], ['waivers', 'signed_by_id'], ['addresses', 'profile_id']] as const) {
    const r = await db.from(table).delete().in(column, ids)
    if (r.error && !/does not exist|schema cache/i.test(r.error.message)) fail(table, r.error.message)
  }

  const r = await db.from('profiles').delete().in('id', ids)
  if (r.error) fail('profile', r.error.message)

  // Login accounts last (the profile rows that pointed at them are gone now)
  for (const p of scope.people.filter(p => p.auth_user_id)) {
    const { error } = await db.auth.admin.deleteUser(p.auth_user_id!)
    if (error && !/not found/i.test(error.message)) console.error('[delete] Could not delete login for', p.id, error.message)
  }

  return { deleted: scope.people.map(p => fullName(p.first_name, p.last_name)) }
}
