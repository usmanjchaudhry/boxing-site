/**
 * One-time script to create Stripe Products & Prices and sync them back to the database.
 *
 * Usage:
 *   1. Make sure your .env.local has STRIPE_SECRET_KEY and SUPABASE keys
 *   2. Run: node scripts/setup-stripe-products.mjs
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const plans = [
  {
    name: 'Basic Individual',
    price_cents: 2999,
    interval: 'month',
    description: 'Monthly membership for one person. Full gym access.',
  },
  {
    name: 'Basic Family',
    price_cents: 4999,
    interval: 'month',
    description: 'Monthly membership for up to 4 household members. Full gym access.',
  },
  {
    name: 'Premium Individual',
    price_cents: 4999,
    interval: 'month',
    description: 'Monthly membership for one person. Full gym access + unlimited classes.',
  },
  {
    name: 'Premium Family',
    price_cents: 7999,
    interval: 'month',
    description: 'Monthly membership for up to 6 household members. Full gym access + unlimited classes.',
  },
]

async function main() {
  console.log('🥊 Setting up Stripe products...\n')

  for (const plan of plans) {
    console.log(`Creating: ${plan.name}...`)

    // Create Stripe Product
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
    })

    // Create Stripe Price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price_cents,
      currency: 'usd',
      recurring: { interval: plan.interval },
    })

    console.log(`  Product: ${product.id}`)
    console.log(`  Price:   ${price.id}`)

    // Update the database plan with the stripe_price_id
    const { error } = await supabase
      .from('membership_plans')
      .update({ stripe_price_id: price.id })
      .eq('name', plan.name)

    if (error) {
      console.error(`  ❌ Failed to update DB: ${error.message}`)
    } else {
      console.log(`  ✅ Synced to database`)
    }

    console.log('')
  }

  console.log('🎉 All products created and synced!')
}

main().catch(console.error)
