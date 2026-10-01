import { stripe } from '@/utils/stripe/server'

/**
 * Enterprise Stripe Sync
 * 
 * Given a subscription record from the DB and a household ID,
 * verify the subscription status against Stripe and auto-correct the DB if needed.
 * Also detects re-subscribes (new active subscription when stored one is cancelled).
 * 
 * Returns the corrected subscription status and updated plan info.
 */
export async function syncSubscriptionWithStripe(
  supabase: any,
  sub: {
    status: string
    stripe_subscription_id: string | null
    payment_method: string
    plan_id: string
    end_date?: string | null
  },
  householdId: string
): Promise<{ status: string; plan_id: string; stripe_subscription_id: string | null }> {
  // Only sync Stripe subscriptions
  if (!sub.stripe_subscription_id || sub.payment_method !== 'stripe') {
    return { status: sub.status, plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }
  }

  try {
    const stripeSubResponse = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    const stripeSub = ('data' in stripeSubResponse ? (stripeSubResponse as any).data : stripeSubResponse) as any

    let correctStatus = 'Active'
    if (stripeSub.status === 'canceled') correctStatus = 'Cancelled'
    else if (stripeSub.status === 'past_due') correctStatus = 'Past_Due'
    else if (stripeSub.pause_collection) correctStatus = 'Frozen'

    // If the stored subscription is cancelled, check if the customer has a NEW active one
    if (correctStatus === 'Cancelled') {
      const { data: household } = await supabase
        .from('households')
        .select('stripe_customer_id')
        .eq('id', householdId)
        .single()

      if (household?.stripe_customer_id) {
        const activeSubs = await stripe.subscriptions.list({
          customer: household.stripe_customer_id,
          status: 'active',
          limit: 1,
        })

        const activeSubsList = ('data' in activeSubs ? (activeSubs as any).data : [activeSubs]) as any[]

        if (activeSubsList.length > 0) {
          const newSub = activeSubsList[0]
          const newPlanId = newSub.metadata?.plan_id || sub.plan_id

          console.log(`Stripe sync: Found newer active sub ${newSub.id} for household ${householdId}`)
          await supabase
            .from('subscriptions')
            .update({
              status: 'Active',
              stripe_subscription_id: newSub.id,
              plan_id: newPlanId,
              start_date: new Date(newSub.current_period_start * 1000).toISOString().split('T')[0],
            })
            .eq('household_id', householdId)

          return { status: 'Active', plan_id: newPlanId, stripe_subscription_id: newSub.id }
        }
      }
    }

    // Sync the status if it differs
    if (sub.status !== correctStatus) {
      console.log(`Stripe sync: ${sub.status} -> ${correctStatus} for household ${householdId}`)
      await supabase
        .from('subscriptions')
        .update({ status: correctStatus })
        .eq('household_id', householdId)
    }

    return { status: correctStatus, plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }

  } catch (err: any) {
    // If Stripe sub is deleted (404), mark as cancelled
    if (err?.statusCode === 404 || err?.type === 'StripeInvalidRequestError') {
      if (sub.status !== 'Cancelled') {
        await supabase
          .from('subscriptions')
          .update({ status: 'Cancelled' })
          .eq('household_id', householdId)
      }
      return { status: 'Cancelled', plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }
    }
    // Non-Stripe error — return DB value
    console.error('Stripe sync error:', err.message)
    return { status: sub.status, plan_id: sub.plan_id, stripe_subscription_id: sub.stripe_subscription_id }
  }
}
