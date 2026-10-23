import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/utils/stripe/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendGymEmail } from '@/utils/email'
import { currentPeriod, localStatusFromStripe, subscriptionIdFromInvoice } from '@/utils/stripe-status'

// We need the service role key here because webhooks don't have a user session
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** The live subscription from Stripe (the source of truth, whatever order events arrive in). */
async function retrieveSubscription(id: string) {
  return stripe.subscriptions.retrieve(id)
}

/**
 * Updates the household membership that belongs to this Stripe subscription.
 *
 * Skips (returns false) when the row now belongs to something else: a newer
 * Stripe subscription, or a cash/comp membership. A late event for an old
 * subscription must never cancel, or mark past due, the membership they have now.
 */
async function updateForStripeSubscription(
  supabase: SupabaseClient,
  stripeSubId: string,
  householdIdHint: string | null | undefined,
  values: Record<string, unknown>
): Promise<boolean> {
  const columns = 'household_id, stripe_subscription_id, payment_method'
  let { data: row, error } = await supabase
    .from('subscriptions').select(columns).eq('stripe_subscription_id', stripeSubId).limit(1).maybeSingle()
  assertOk(error, 'Failed to look up subscription')
  if (!row && householdIdHint) {
    ;({ data: row, error } = await supabase
      .from('subscriptions').select(columns).eq('household_id', householdIdHint).limit(1).maybeSingle())
    assertOk(error, 'Failed to look up subscription')
  }

  if (!row) {
    console.warn('[webhook] No membership row for Stripe subscription', stripeSubId)
    return false
  }
  if (row.stripe_subscription_id && row.stripe_subscription_id !== stripeSubId) {
    console.warn('[webhook] Ignoring event for old subscription', stripeSubId, '- household now has', row.stripe_subscription_id)
    return false
  }
  if (row.payment_method === 'cash' || row.payment_method === 'comp') {
    console.warn('[webhook] Ignoring Stripe event for a', row.payment_method, 'membership:', row.household_id)
    return false
  }

  const { error: updateError } = await supabase.from('subscriptions').update(values).eq('household_id', row.household_id)
  assertOk(updateError, 'Failed to update subscription')
  console.log('[webhook] Household', row.household_id, 'updated:', values)
  return true
}

/** start_date / end_date from the subscription's current billing period (only the parts Stripe gave us). */
function periodColumns(sub: Parameters<typeof currentPeriod>[0]) {
  const { start, end } = currentPeriod(sub)
  return { ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) }
}

/**
 * STRIPE_WEBHOOK_SECRET may hold several comma-separated secrets, one per Stripe
 * webhook endpoint that points at this deployment (each endpoint has its own whsec_).
 */
function verifyEvent(body: string, signature: string): ReturnType<typeof stripe.webhooks.constructEvent> | null {
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret)
    } catch {
      // try the next secret
    }
  }
  return null
}

/**
 * Supabase returns errors instead of throwing. Any failed write must surface as a
 * 500 so Stripe retries the event (it retries for up to 3 days in live mode);
 * returning 200 after a failed write would leave a paid customer with nothing.
 */
function assertOk(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`)
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const event = verifyEvent(body, signature)
  if (!event) {
    console.error('Webhook signature verification failed for all configured secrets')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminClient()

  console.log('STRIPE WEBHOOK:', event.type, event.id)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const householdId = session.metadata?.household_id
        const profileId = session.metadata?.profile_id
        const planId = session.metadata?.plan_id
        const productId = session.metadata?.product_id
        const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

        console.log('WEBHOOK DEBUG checkout.session.completed:', { householdId, planId, productId, stripeSubscriptionId })

        if (session.mode === 'payment' && productId && profileId) {
          // Only fulfil once the money has actually been captured.
          if (session.payment_status !== 'paid') {
            console.warn('[webhook] Checkout completed but not paid; no pass minted:', session.id, session.payment_status)
            break
          }
          // It's a Day Pass (or retail item)! Mint the pass for the user.
          const { error } = await supabase.from('passes').insert({
            profile_id: profileId,
            pass_type: 'Day Pass',
            status: 'Available'
          })
          assertOk(error, 'Failed to mint pass')
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
        } else if (householdId && planId && stripeSubscriptionId) {
          // Fetch the subscription from Stripe to get its status and current period
          const sub = await retrieveSubscription(stripeSubscriptionId)
          const period = currentPeriod(sub)
          const status = localStatusFromStripe(sub)

          console.log('WEBHOOK DEBUG subscription:', { status: sub.status, ...period })

          // If Stripe re-delivers this event, the row is already active for this
          // subscription: still re-apply the upsert (harmless) but don't re-send the welcome email.
          const { data: existing, error: lookupError } = await supabase
            .from('subscriptions')
            .select('status, stripe_subscription_id')
            .eq('household_id', householdId)
            .maybeSingle()
          assertOk(lookupError, 'Failed to read subscription')
          const alreadyActive = existing?.status === 'Active' && existing?.stripe_subscription_id === stripeSubscriptionId

          // Upsert subscription in our database. payment_method must be set here:
          // a household that used to pay cash keeps 'cash' otherwise, and then the
          // cash end-date rule (membership-expiry.ts) would cancel a paid card plan.
          const { error } = await supabase.from('subscriptions').upsert({
            household_id: householdId,
            plan_id: planId,
            status,
            start_date: period.start || new Date().toISOString().split('T')[0],
            end_date: period.end,
            stripe_subscription_id: stripeSubscriptionId,
            payment_method: 'stripe',
          }, {
            onConflict: 'household_id'
          })

          assertOk(error, 'Failed to upsert subscription')
          console.log('Subscription', status, 'for household:', householdId)
          const email = session.customer_details?.email
          if (email && !alreadyActive && status === 'Active') {
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
        break
      }

      case 'invoice.paid': {
        // A renewal (or a late payment) went through: restore access and move the period forward.
        const invoice = event.data.object
        const stripeSubId = subscriptionIdFromInvoice(invoice)

        if (stripeSubId) {
          const sub = await retrieveSubscription(stripeSubId)
          const updated = await updateForStripeSubscription(supabase, stripeSubId, sub.metadata?.household_id, {
            status: localStatusFromStripe(sub),
            ...periodColumns(sub),
          })

          // Send receipt for recurring payments (skip first payment since checkout.session.completed handles it)
          if (updated && invoice.billing_reason === 'subscription_cycle') {
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
        break
      }

      case 'invoice.payment_failed': {
        // A charge failed: cut off access right away (the scanner shows "Payment Due").
        const invoice = event.data.object
        const stripeSubId = subscriptionIdFromInvoice(invoice)

        if (stripeSubId && invoice.id) {
          // Events can arrive out of order: if a retry already paid this invoice, keep access.
          const live = await stripe.invoices.retrieve(invoice.id)
          if (live.status === 'paid') {
            console.log('[webhook] Invoice', invoice.id, 'failed earlier but is now paid; access unchanged')
            break
          }
          const sub = await retrieveSubscription(stripeSubId)
          await updateForStripeSubscription(supabase, stripeSubId, sub.metadata?.household_id, { status: 'Past_Due' })
        }
        break
      }

      case 'customer.subscription.updated': {
        // Use the live subscription, not the event copy, so an older event can't undo a newer change.
        const sub = await retrieveSubscription(event.data.object.id)
        await updateForStripeSubscription(supabase, sub.id, sub.metadata?.household_id, {
          status: localStatusFromStripe(sub),
          ...periodColumns(sub),
        })
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await updateForStripeSubscription(supabase, sub.id, sub.metadata?.household_id, { status: 'Cancelled' })
        break
      }
    }
  } catch (err) {
    // Non-2xx tells Stripe to retry this event later.
    const e = err as Error
    console.error('WEBHOOK HANDLER ERROR:', event.type, event.id, e.message, e.stack)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
