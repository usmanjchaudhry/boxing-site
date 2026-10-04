import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/utils/stripe/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/** The only account allowed to buy hidden test products (matches /memberships/dev). */
const DEV_ACCOUNT_EMAIL = 'usmanjc98@gmail.com'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { planId, productId } = await request.json()
    if (!planId && !productId) {
      return NextResponse.json({ error: 'Missing planId or productId' }, { status: 400 })
    }

    // Return the buyer to the exact host they started on. Supabase session cookies
    // are host-only, so returning to a different domain (www vs apex, or a custom
    // domain vs *.vercel.app) would make the user appear logged out.
    const returnOrigin = request.nextUrl.origin

    let itemPriceData: any = null;
    let meta: any = {};
    let checkoutMode: 'subscription' | 'payment' = 'subscription';

    if (planId) {
      const adminClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: plan, error: planErr } = await adminClient
        .from('membership_plans')
        .select('*')
        .eq('id', planId)
        .single()

      if (planErr || !plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      }
      if (!plan.stripe_price_id) {
        return NextResponse.json({ error: 'Plan not configured in Stripe yet' }, { status: 500 })
      }

      itemPriceData = { price: plan.stripe_price_id, quantity: 1 }
      meta = { plan_id: planId }
      checkoutMode = 'subscription'
    } else if (productId) {
      // Service-role read so hidden (is_active=false) products like the $1 Dev Day Pass
      // can be found; RLS hides them from the user's client. Hidden products are then
      // restricted to the same dev account the /memberships/dev page allows.
      const productDb = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: product, error: prodErr } = await productDb
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()

      if (prodErr || !product || (!product.is_active && user.email !== DEV_ACCOUNT_EMAIL)) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }

      itemPriceData = {
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: product.price_cents,
        },
        quantity: 1
      }
      meta = { product_id: productId }
      checkoutMode = 'payment'
    }

    // 2. Get the user's profile and household
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: householdMember } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('profile_id', profile.id)
      .single()

    if (!householdMember) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 })
    }

    // 3. Check if household already has a Stripe customer.
    // Service-role client: billing identifiers are server-managed. Using the user's
    // client here depended on RLS UPDATE policies; when those blocked the write
    // (silently, no error), every checkout created a brand-new Stripe customer.
    const billingDb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: household, error: householdErr } = await billingDb
      .from('households')
      .select('stripe_customer_id')
      .eq('id', householdMember.household_id)
      .single()
    if (householdErr) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 })
    }

    let stripeCustomerId = household?.stripe_customer_id

    if (!stripeCustomerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email || profile.email || undefined,
        name: `${profile.first_name} ${profile.last_name}`,
        metadata: {
          supabase_user_id: user.id,
          household_id: householdMember.household_id,
          profile_id: profile.id,
        }
      })
      stripeCustomerId = customer.id

      // Save to household
      const { error: saveErr } = await billingDb
        .from('households')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', householdMember.household_id)
      if (saveErr) {
        console.error('[checkout] Failed to save stripe_customer_id:', householdMember.household_id, saveErr.message)
      }
    }

    // 4. Create a Stripe Checkout Session
    const sessionConfig: any = {
      customer: stripeCustomerId,
      mode: checkoutMode,
      line_items: [itemPriceData],
      success_url: `${returnOrigin}/memberships/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/memberships/cancel`,
      metadata: {
        household_id: householdMember.household_id,
        profile_id: profile.id, // Need this to mint the day pass to the specific person!
        ...meta
      }
    }

    if (checkoutMode === 'subscription') {
      sessionConfig.subscription_data = {
        metadata: {
          household_id: householdMember.household_id,
          plan_id: planId,
        }
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
