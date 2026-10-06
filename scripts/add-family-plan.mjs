/**
 * Add the "Family of 4 Membership" plan
 *
 * - $700/mo recurring Stripe price
 * - Primary account holder + 3 dependents (max_dependents: 3 -> 4 people per day)
 *
 * Safe to re-run: if an active plan with this name already exists, it does nothing.
 *
 * Usage:
 *   node scripts/add-family-plan.mjs                 # uses .env.local
 *   node scripts/add-family-plan.mjs .env.production # uses another env file
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const PLAN_NAME = 'Family of 4 Membership'
const PRICE_CENTS = 70000 // $700.00
const MAX_DEPENDENTS = 3
const DESCRIPTION =
  'Monthly gym membership for the account holder plus 3 household members. Full access to the gym and all equipment.'

// Load env
const envPath = process.argv[2] || '.env.local'
const envFile = fs.readFileSync(envPath, 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=')
  if (key && rest.length > 0) env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '')
})

const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const mode = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '') ? 'LIVE' : 'TEST'
  console.log(`🥊 Adding ${PLAN_NAME} ($${PRICE_CENTS / 100}/mo)`)
  console.log(`   env file: ${envPath} | Stripe: ${mode} | Supabase: ${env.NEXT_PUBLIC_SUPABASE_URL}\n`)

  // Skip if it already exists
  const { data: existing, error: lookupErr } = await supabase
    .from('membership_plans')
    .select('id, stripe_price_id')
    .eq('name', PLAN_NAME)
    .eq('is_active', true)
    .maybeSingle()
  if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`)
  if (existing) {
    console.log(`ℹ️  Already exists: ${existing.id} | Stripe: ${existing.stripe_price_id}. Nothing to do.`)
    return
  }

  // Stripe product + monthly price
  const product = await stripe.products.create({ name: PLAN_NAME, description: DESCRIPTION })
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: PRICE_CENTS,
    currency: 'usd',
    recurring: { interval: 'month' },
  })
  console.log(`✅ Stripe product ${product.id} | price ${price.id}`)

  // Supabase plan row
  const { data: plan, error } = await supabase
    .from('membership_plans')
    .insert({
      name: PLAN_NAME,
      price_cents: PRICE_CENTS,
      description: DESCRIPTION,
      max_dependents: MAX_DEPENDENTS,
      is_active: true,
      stripe_price_id: price.id,
    })
    .select('id')
    .single()

  if (error) {
    // Don't leave an orphaned product on sale in Stripe
    await stripe.products.update(product.id, { active: false })
    throw new Error(`DB insert failed (Stripe product archived): ${error.message}`)
  }
  console.log(`✅ Plan row ${plan.id}`)

  // Show what's on sale now
  const { data: allPlans } = await supabase
    .from('membership_plans')
    .select('name, price_cents, max_dependents')
    .eq('is_active', true)
    .order('price_cents', { ascending: true })
  console.log('\nActive plans:')
  for (const p of allPlans || []) {
    console.log(`  🟢 ${p.name} — $${(p.price_cents / 100).toFixed(2)}/mo | dependents: ${p.max_dependents}`)
  }
  console.log('\n🎉 Done!')
}

run().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
