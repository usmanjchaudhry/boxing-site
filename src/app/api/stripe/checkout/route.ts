import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/utils/stripe/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { planId } = await request.json()
    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 })
    }

    // 1. Get the plan from our database
    const { data: plan, error: planErr } = await supabase
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

    // 3. Check if household already has a Stripe customer
    const { data: household } = await supabase
      .from('households')
      .select('stripe_customer_id')
      .eq('id', householdMember.household_id)
      .single()

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
      await supabase
        .from('households')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', householdMember.household_id)
    }

    // 4. Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        }
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/memberships/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/memberships/cancel`,
      metadata: {
        household_id: householdMember.household_id,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          household_id: householdMember.household_id,
          plan_id: planId,
        }
      }
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
