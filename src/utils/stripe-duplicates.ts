import { stripe } from '@/utils/stripe/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/** Stripe statuses that mean the customer is (or will keep) being charged. */
const BILLING_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])

export type BillingSubscription = {
  id: string
  planName: string
  amountCents: number | null
  interval: string | null
  status: string
  startedAt: string | null
  renewsAt: string | null
  paused: boolean
}

function toIso(seconds: unknown): string | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

/**
 * Lists every Stripe subscription that is currently billing this customer.
 *
 * The app stores one subscription per household, so a second checkout silently
 * replaces the stored one while Stripe keeps charging both. Stripe is the source
 * of truth for what the customer is actually paying for, so we ask it directly.
 *
 * Never throws: returns [] on any error so the dashboard still renders.
 */
export async function getBillingSubscriptions(stripeCustomerId: string): Promise<BillingSubscription[]> {
  try {
    const res = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 20 })
    const billing = res.data.filter(s => BILLING_STATUSES.has(s.status))
    if (billing.length === 0) return []

    // Resolve plan names from our DB (admin client: inactive plans like Dev/Legacy are hidden by RLS).
    const planIds = [...new Set(billing.map(s => s.metadata?.plan_id).filter(Boolean))] as string[]
    const planNames: Record<string, string> = {}
    if (planIds.length > 0) {
      const adminDb = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data } = await adminDb.from('membership_plans').select('id, name').in('id', planIds)
      for (const p of data || []) planNames[p.id] = p.name
    }

    return billing.map(s => {
      const item = s.items?.data?.[0]
      const price = item?.price
      // Newer Stripe API versions keep the billing period on the item, older ones on the subscription.
      const periodEnd =
        (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
        (s as unknown as { current_period_end?: number }).current_period_end
      return {
        id: s.id,
        planName: planNames[s.metadata?.plan_id as string] || price?.nickname || 'Membership',
        amountCents: price?.unit_amount ?? null,
        interval: price?.recurring?.interval ?? null,
        status: s.status,
        startedAt: toIso(s.start_date),
        renewsAt: toIso(periodEnd),
        paused: !!s.pause_collection,
      }
    })
  } catch (err: unknown) {
    console.error('[stripe-duplicates] Could not list subscriptions:', err instanceof Error ? err.message : err)
    return []
  }
}
