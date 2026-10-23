/**
 * Reading Stripe subscriptions and invoices the same way everywhere (webhook,
 * checkout success page, dashboard sync, nightly membership sync).
 *
 * Pure functions, no server-only imports.
 *
 * Why this exists: since Stripe API 2025-03-31 ("basil"), and so in the
 * 2026-08-26.dahlia version this site uses,
 *   - invoice.subscription moved to invoice.parent.subscription_details.subscription
 *   - subscription.current_period_start/end moved to the subscription items
 * Reading the old fields returns undefined, which silently skipped renewals
 * and failed-payment handling.
 */

/** subscriptions.status values the site uses. */
export type LocalStatus = 'Active' | 'Past_Due' | 'Frozen' | 'Cancelled'

type StripeSubLike = {
  status?: string | null
  pause_collection?: unknown
  current_period_start?: number | null
  current_period_end?: number | null
  items?: { data?: { current_period_start?: number | null; current_period_end?: number | null }[] } | null
}

/**
 * Gym access for a Stripe subscription status. Fails closed: anything that
 * isn't clearly paid (or is a status we don't know) denies entry.
 *
 *   active / trialing           -> Active (Frozen if collection is paused by an admin freeze)
 *   past_due / unpaid / incomplete -> Past_Due (scanner: "Payment Due")
 *   paused                      -> Frozen
 *   canceled / incomplete_expired -> Cancelled
 */
export function localStatusFromStripe(sub: Pick<StripeSubLike, 'status' | 'pause_collection'>): LocalStatus {
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return sub.pause_collection ? 'Frozen' : 'Active'
    case 'paused':
      return 'Frozen'
    case 'canceled':
    case 'incomplete_expired':
      return 'Cancelled'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    default:
      return 'Past_Due'
  }
}

/** The subscription an invoice belongs to (new and old API shapes), or null. */
export function subscriptionIdFromInvoice(invoice: {
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
  subscription?: string | { id: string } | null
}): string | null {
  const ref = invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/** 'YYYY-MM-DD' (UTC) for a Stripe unix timestamp, or null. */
export function stripeDate(ts: number | null | undefined): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

/** The current billing period (new API: on the items; old API: on the subscription). */
export function currentPeriod(sub: StripeSubLike): { start: string | null; end: string | null } {
  const item = sub.items?.data?.[0]
  return {
    start: stripeDate(item?.current_period_start ?? sub.current_period_start),
    end: stripeDate(item?.current_period_end ?? sub.current_period_end),
  }
}
