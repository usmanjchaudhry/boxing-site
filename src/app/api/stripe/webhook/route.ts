import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/utils/stripe/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendGymEmail } from '@/utils/email'

// We need the service role key here because webhooks don't have a user session
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Safely convert a Stripe timestamp (seconds or object) to a date string
function toDateString(val: any): string | null {
  if (!val) return null
  // Newer Stripe API might return a number (unix seconds) or an object
  const ts = typeof val === 'number' ? val : (val?.seconds ?? val?.unix ?? null)
  if (!ts) return null
  try {
    return new Date(ts * 1000).toISOString().split('T')[0]
  } catch {
    return null
  }
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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const householdId = session.metadata?.household_id
        const profileId = session.metadata?.profile_id
        const planId = session.metadata?.plan_id
        const productId = session.metadata?.product_id
        const stripeSubscriptionId = session.subscription

        console.log('WEBHOOK DEBUG checkout.session.completed:', { householdId, planId, productId, stripeSubscriptionId })

        if (session.mode === 'payment' && productId && profileId) {
          // It's a Day Pass (or retail item)! Mint the pass for the user.
          const { error } = await supabase.from('passes').insert({
            profile_id: profileId,
            pass_type: 'Day Pass',
            status: 'Available'
          })
          if (error) {
            console.error('Failed to mint pass:', error)
          } else {
            console.log('Successfully minted Day Pass for profile:', profileId)
            const email = session.customer_details?.email
            if (email) {
              await sendGymEmail(
                email,
                'Your Day Pass Receipt',
                `<h2 style="margin-top:0; color:#fff;">Day Pass Purchased!</h2>
                 <p style="color:#aaa; line-height: 1.5;">Your payment of <strong>$${(session.amount_total! / 100).toFixed(2)}</strong> was successful.</p>
                 <p style="color:#aaa; line-height: 1.5;">Your ticket is available on your dashboard. Simply click "Use Ticket" and show the QR code at the front desk to enter.</p>
                 <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" style="display:inline-block; background-color:#dc2626; color:#fff; padding:12px 24px; text-decoration:none; border-radius:8px; font-weight:bold; margin-top:20px; font-size:14px;">Go to Dashboard</a>`
              )
            }
          }
        } else if (householdId && planId && stripeSubscriptionId) {
          // Fetch the subscription from Stripe to get the current period
          const subResponse = await stripe.subscriptions.retrieve(stripeSubscriptionId as string)
          const sub = ('data' in subResponse ? (subResponse as any).data : subResponse) as any

          const startDate = toDateString(sub.current_period_start) || new Date().toISOString().split('T')[0]
          const endDate = toDateString(sub.current_period_end)

          console.log('WEBHOOK DEBUG dates:', { startDate, endDate })

          // Upsert subscription in our database
          const { error } = await supabase.from('subscriptions').upsert({
            household_id: householdId,
            plan_id: planId,
            status: 'Active',
            start_date: startDate,
            end_date: endDate,
            stripe_subscription_id: stripeSubscriptionId,
          }, {
            onConflict: 'household_id'
          })

          if (error) {
            console.error('Failed to upsert subscription:', error)
          } else {
            console.log('Subscription activated for household:', householdId)
            const email = session.customer_details?.email
            if (email) {
              await sendGymEmail(
                email,
                'Welcome to La Familia Boxing!',
                `<h2 style="margin-top:0; color:#fff;">Membership Activated</h2>
                 <p style="color:#aaa; line-height: 1.5;">Your subscription payment of <strong>$${(session.amount_total! / 100).toFixed(2)}</strong> was successful. Welcome to the family!</p>
                 <p style="color:#aaa; line-height: 1.5;">Your gym access QR codes are now active. Scan them at the front desk whenever you visit.</p>
                 <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" style="display:inline-block; background-color:#dc2626; color:#fff; padding:12px 24px; text-decoration:none; border-radius:8px; font-weight:bold; margin-top:20px; font-size:14px;">View QR Codes</a>`
              )
            }
          }
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object
        const stripeSubId = invoice.subscription

        if (stripeSubId) {
          const subResponse = await stripe.subscriptions.retrieve(stripeSubId as string)
          const sub = ('data' in subResponse ? (subResponse as any).data : subResponse) as any
          const householdId = sub.metadata?.household_id

          if (householdId) {
            const startDate = toDateString(sub.current_period_start) || new Date().toISOString().split('T')[0]
            const endDate = toDateString(sub.current_period_end)

            await supabase.from('subscriptions')
              .update({
                status: 'Active',
                start_date: startDate,
                end_date: endDate,
              })
              .eq('household_id', householdId)

            console.log('Subscription renewed for household:', householdId)
            
            // Send receipt for recurring payments (skip first payment since checkout.session.completed handles it)
            if (invoice.billing_reason === 'subscription_cycle') {
              const email = invoice.customer_email
              if (email) {
                await sendGymEmail(
                  email,
                  'Membership Renewal Receipt',
                  `<h2 style="margin-top:0; color:#fff;">Membership Renewed</h2>
                   <p style="color:#aaa; line-height: 1.5;">Your monthly subscription payment of <strong>$${(invoice.amount_paid! / 100).toFixed(2)}</strong> was successful.</p>
                   <p style="color:#aaa; line-height: 1.5;">Your gym access remains active. Keep up the hard work!</p>`
                )
              }
            }
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const stripeSubId = invoice.subscription

        if (stripeSubId) {
          const subResponse = await stripe.subscriptions.retrieve(stripeSubId as string)
          const sub = ('data' in subResponse ? (subResponse as any).data : subResponse) as any
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
        let householdId = sub.metadata?.household_id

        // Fallback: look up by stripe_subscription_id if metadata is missing
        if (!householdId) {
          const { data: localSub } = await supabase
            .from('subscriptions')
            .select('household_id')
            .eq('stripe_subscription_id', sub.id)
            .single()
          householdId = localSub?.household_id
        }

        if (householdId) {
          let status = 'Active'
          if (sub.status === 'canceled') status = 'Cancelled'
          else if (sub.status === 'past_due') status = 'Past_Due'
          else if (sub.pause_collection) status = 'Frozen'

          await supabase.from('subscriptions')
            .update({ status })
            .eq('household_id', householdId)

          console.log('Subscription status updated to', status, 'for household:', householdId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        let householdId = sub.metadata?.household_id

        // Fallback: look up by stripe_subscription_id if metadata is missing
        if (!householdId) {
          const { data: localSub } = await supabase
            .from('subscriptions')
            .select('household_id')
            .eq('stripe_subscription_id', sub.id)
            .single()
          householdId = localSub?.household_id
        }

        if (householdId) {
          await supabase.from('subscriptions')
            .update({ status: 'Cancelled' })
            .eq('household_id', householdId)

          console.log('Subscription cancelled for household:', householdId)
        }
        break
      }
    }
  } catch (err: any) {
    console.error('WEBHOOK HANDLER ERROR:', err.message, err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
