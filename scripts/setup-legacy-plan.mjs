import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('🥊 Setting up Legacy Stripe product...\n')

  const plan = {
    name: 'Legacy Unlimited',
    price_cents: 10000,
    interval: 'month',
    description: 'Monthly unlimited membership for legacy transfers.',
    max_dependents: 5,
    is_active: false // Keep it hidden from the regular UI
  }

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

  // Insert into DB
  const { data, error } = await supabase
    .from('membership_plans')
    .insert({
      name: plan.name,
      price_cents: plan.price_cents,
      description: plan.description,
      max_dependents: plan.max_dependents,
      is_active: plan.is_active,
      stripe_price_id: price.id
    })
    .select('id')
    .single()

  if (error) {
    console.error(`  ❌ Failed to insert to DB: ${error.message}`)
  } else {
    console.log(`  ✅ Synced to database. Plan ID: ${data.id}`)
  }

  console.log('🎉 Legacy plan created!')
}

main().catch(console.error)
