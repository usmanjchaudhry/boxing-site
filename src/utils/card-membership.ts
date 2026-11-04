import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { currentPeriod, localStatusFromStripe, type LocalStatus } from '@/utils/stripe-status'
import { daysBetween } from '@/utils/timezone'

/**
 * Card (Stripe) membership safety net (server-only).
 *
 * Normally Stripe webhooks keep `subscriptions.status` and `end_date` (the end of
 * the paid billing period) current, and the nightly sync double-checks. If both
 * miss an update, a member who stopped paying would keep getting in forever. So
 * whenever the stored card membership looks stale, we ask Stripe directly:
 *
 *   - no Stripe subscription id on an Active card membership, or
 *   - no end date, or
 *   - the paid period ended more than GRACE_DAYS ago (a renewal normally moves
 *     end_date forward within minutes; a failed renewal turns it Past_Due)
 *
 * Anything that isn't clearly paid denies entry (fails closed).
 */

/** Days after the paid period ends before we stop trusting the stored status. */
export const CARD_GRACE_DAYS = 1

/** Stripe statuses that mean a subscription is still billing (or trying to). */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])

export interface CardRow {
  status: string | null
  payment_method: string | null
  end_date: string | null
  stripe_subscription_id: string | null
}

/** Card = anything that isn't cash or comp (unknown methods are treated as card: must be paid in Stripe). */
export function isCardMembership(row: Pick<CardRow, 'payment_method'>): boolean {
  const m = (row.payment_method ?? '').trim().toLowerCase()
  return m !== 'cash' && m !== 'comp'
}

/** True when the stored Active card membership can't be trusted without asking Stripe. */
export function cardNeedsVerification(row: CardRow, todayIso: string): boolean {
  if (row.status !== 'Active' || !isCardMembership(row)) return false
  if (!row.stripe_subscription_id || !row.end_date) return true
  return daysBetween(row.end_date.slice(0, 10), todayIso) > CARD_GRACE_DAYS
}

export interface CardVerification {
  status: LocalStatus
  /** Values written back to the subscriptions row (empty when nothing changed). */
  update: Record<string, unknown>
  reason: string
}

function isMissing(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string }
  return e?.statusCode === 404 || e?.code === 'resource_missing'
}

/**
 * Ask Stripe what this household's card membership really is. Throws only when
 * Stripe can't be reached (callers should deny entry in that case).
 */
export async function verifyCardMembership(
  stripe: Stripe,
  row: CardRow,
  stripeCustomerId: string | null
): Promise<CardVerification> {
  let sub: Stripe.Subscription | null = null
  if (row.stripe_subscription_id) {
    try {
      sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
    } catch (e) {
      if (!isMissing(e)) throw e
    }
  }

  // The stored one is gone or over: a newer live subscription for the same customer counts
  if ((!sub || !LIVE_STATUSES.has(sub.status)) && stripeCustomerId) {
    const list = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 20 })
    const live = list.data
      .filter(s => LIVE_STATUSES.has(s.status))
      .sort((a, b) => (localStatusFromStripe(a) === 'Active' ? 0 : 1) - (localStatusFromStripe(b) === 'Active' ? 0 : 1) || b.created - a.created)[0]
    if (live) sub = live
  }

  if (!sub) {
    return { status: 'Cancelled', update: { status: 'Cancelled' }, reason: 'no Stripe subscription found' }
  }

  const status = localStatusFromStripe(sub)
  const { start, end } = currentPeriod(sub)
  const update: Record<string, unknown> = { status }
  if (end) update.end_date = end
  if (start) update.start_date = start
  if (sub.id !== row.stripe_subscription_id) {
    update.stripe_subscription_id = sub.id
    update.payment_method = 'stripe'
    // Checkout stores the plan on the subscription; keep the plan name in step
    if (typeof sub.metadata?.plan_id === 'string' && sub.metadata.plan_id) update.plan_id = sub.metadata.plan_id
  }
  return { status, update, reason: `Stripe status ${sub.status}` }
}

/** Write a verification result back so every screen agrees (best effort). */
export async function saveCardVerification(db: SupabaseClient, householdId: string, v: CardVerification) {
  const { error } = await db.from('subscriptions').update(v.update).eq('household_id', householdId)
  if (error) console.error('[card-membership] Could not save verification for', householdId, error.message)
}

