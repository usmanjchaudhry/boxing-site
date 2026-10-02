import { stripe } from '@/utils/stripe/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/** Safely convert a Stripe timestamp to a date string */
function toDateString(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0]
  const ts = typeof val === 'number' ? val : (val?.seconds ?? val?.unix ?? null)
  if (!ts) return new Date().toISOString().split('T')[0]
  try {
    return new Date(ts * 1000).toISOString().split('T')[0]
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

/**
 * Get a Supabase admin client that bypasses RLS.
 * Required because the sync runs in server components where the
 * user-scoped client doesn't have permission to update subscriptions.
 */
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Enterprise Stripe Sync
 * 
 * Verifies subscription status against Stripe and auto-corrects
 * the database if they're out of sync. Also detects re-subscribes
 * (new active subscription when stored one is cancelled).
 * 
 * Uses an admin Supabase client for DB writes (bypasses RLS).
 */
export async function syncSubscriptionWithStripe(
  sub: {
    status: string
    stripe_subscription_id: string | null
    payment_method: string | null
    plan_id: string
  },
  householdId: string
): Promise<{ status: string; plan_id: string; stripe_subscription_id: string | null }> {
  // Only sync Stripe subscriptions that have a subscription ID
  if (!sub.stripe_subscription_id || (sub.payment_method && sub.payment_method !== 'stripe')) {
    return { status: sub.status, plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }
  }

  const adminDb = getAdminClient()

  try {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as any

    console.log(`[stripe-sync] sub=${sub.stripe_subscription_id} stripe_status=${stripeSub.status} db_status=${sub.status}`)

    let correctStatus = 'Active'
    if (stripeSub.status === 'canceled') correctStatus = 'Cancelled'
    else if (stripeSub.status === 'past_due') correctStatus = 'Past_Due'
    else if (stripeSub.pause_collection) correctStatus = 'Frozen'

    // If the stored subscription is cancelled in Stripe, check for a newer active one
    if (correctStatus === 'Cancelled') {
      const { data: household } = await adminDb
        .from('households')
        .select('stripe_customer_id')
        .eq('id', householdId)
        .single()

      if (household?.stripe_customer_id) {
        const activeSubsResponse = await stripe.subscriptions.list({
          customer: household.stripe_customer_id,
          status: 'active',
          limit: 1,
        })

        const activeSubsList = activeSubsResponse?.data || []
        console.log(`[stripe-sync] customer=${household.stripe_customer_id} active_subs=${activeSubsList.length}`)

        if (activeSubsList.length > 0) {
          const newSub = activeSubsList[0] as any
          const newPlanId = newSub.metadata?.plan_id || sub.plan_id

          console.log(`[stripe-sync] Found newer active sub: ${newSub.id}, updating DB`)
          const { error } = await adminDb
            .from('subscriptions')
            .update({
              status: 'Active',
              stripe_subscription_id: newSub.id,
              plan_id: newPlanId,
              start_date: toDateString(newSub.current_period_start),
            })
            .eq('household_id', householdId)

          if (error) console.error('[stripe-sync] Update error:', error)
          return { status: 'Active', plan_id: newPlanId, stripe_subscription_id: newSub.id }
        }
      }
    }

    // Sync the status if it differs
    if (sub.status !== correctStatus) {
      console.log(`[stripe-sync] Correcting DB: ${sub.status} -> ${correctStatus}`)
      const { error } = await adminDb
        .from('subscriptions')
        .update({ status: correctStatus })
        .eq('household_id', householdId)

      if (error) console.error('[stripe-sync] Update error:', error)
    }

    return { status: correctStatus, plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }

  } catch (err: any) {
    console.error(`[stripe-sync] Error: type=${err?.type} status=${err?.statusCode} msg=${err?.message}`)

    if (err?.statusCode === 404 || err?.type === 'StripeInvalidRequestError') {
      if (sub.status !== 'Cancelled') {
        await adminDb
          .from('subscriptions')
          .update({ status: 'Cancelled' })
          .eq('household_id', householdId)
      }
      return { status: 'Cancelled', plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }
    }

    return { status: sub.status, plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }
  }
}
