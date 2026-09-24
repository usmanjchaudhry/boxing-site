import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/utils/stripe/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// We need the service role key here because webhooks don't have a user session
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: any
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminClient()

  console.log('STRIPE WEBHOOK:', event.type)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const householdId = session.metadata?.household_id
      const planId = session.metadata?.plan_id
      const stripeSubscriptionId = session.subscription

      if (householdId && planId && stripeSubscriptionId) {
        // Fetch the subscription from Stripe to get the current period
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId as string)

        // Upsert subscription in our database
        const { error } = await supabase.from('subscriptions').upsert({
          household_id: householdId,
          plan_id: planId,
          status: 'Active',
          start_date: new Date(sub.current_period_start * 1000).toISOString().split('T')[0],
          end_date: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString().split('T')[0]
            : null,
          stripe_subscription_id: stripeSubscriptionId,
        }, {
          onConflict: 'household_id'
        })

        if (error) {
          console.error('Failed to upsert subscription:', error)
        } else {
          console.log('Subscription activated for household:', householdId)
        }
      }
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object
      const stripeSubId = invoice.subscription

      if (stripeSubId) {
        const sub = await stripe.subscriptions.retrieve(stripeSubId as string)
        const householdId = sub.metadata?.household_id

        if (householdId) {
          await supabase.from('subscriptions')
            .update({
              status: 'Active',
              start_date: new Date(sub.current_period_start * 1000).toISOString().split('T')[0],
              end_date: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString().split('T')[0]
                : null,
            })
            .eq('household_id', householdId)

          console.log('Subscription renewed for household:', householdId)
        }
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const stripeSubId = invoice.subscription

      if (stripeSubId) {
        const sub = await stripe.subscriptions.retrieve(stripeSubId as string)
        const householdId = sub.metadata?.household_id

        if (householdId) {
          await supabase.from('subscriptions')
            .update({ status: 'Past_Due' })
            .eq('household_id', householdId)

          console.log('Payment failed for household:', householdId)
        }
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object
      const householdId = sub.metadata?.household_id

      if (householdId) {
        let status = 'Active'
        if (sub.status === 'canceled') status = 'Cancelled'
        else if (sub.status === 'past_due') status = 'Past_Due'
        else if (sub.status === 'paused') status = 'Frozen'

        await supabase.from('subscriptions')
          .update({ status })
          .eq('household_id', householdId)

        console.log('Subscription status updated to', status, 'for household:', householdId)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const householdId = sub.metadata?.household_id

      if (householdId) {
        await supabase.from('subscriptions')
          .update({ status: 'Cancelled' })
          .eq('household_id', householdId)

        console.log('Subscription cancelled for household:', householdId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
