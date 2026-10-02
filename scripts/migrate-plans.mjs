/**
 * Production Plan Migration
 * 
 * Deactivates all old plans, creates new simplified pricing:
 * - Monthly Membership: $225/mo (1 person)
 * - Double Membership: $450/mo (primary + 2 dependents)
 * - Day Pass: $20 (updated from $15)
 * - Legacy Unlimited: unchanged (hidden)
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Load env
const envFile = fs.readFileSync('.env.local', 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=')
  if (key && rest.length > 0) env[key.trim()] = rest.join('=').trim()
})

const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function migrate() {
  console.log('🥊 Production Plan Migration\n')
  console.log('═══════════════════════════════════════\n')

  // ── Step 1: Deactivate ALL old membership plans (except Legacy) ──
  console.log('Step 1: Deactivating old plans...')
  const { data: oldPlans } = await supabase
    .from('membership_plans')
    .select('id, name, stripe_price_id')
    .eq('is_active', true)

  for (const plan of oldPlans || []) {
    console.log(`  Deactivating: ${plan.name}`)
    await supabase
      .from('membership_plans')
      .update({ is_active: false })
      .eq('id', plan.id)

    // Also archive the Stripe product if it has one
    if (plan.stripe_price_id) {
      try {
        const price = await stripe.prices.retrieve(plan.stripe_price_id)
        if (price.product) {
          await stripe.products.update(price.product, { active: false })
          console.log(`    Archived Stripe product: ${price.product}`)
        }
      } catch (e) {
        console.log(`    Could not archive Stripe product: ${e.message}`)
      }
    }
  }

  // ── Step 2: Create Monthly Membership ($225/mo) ──
  console.log('\nStep 2: Creating Monthly Membership ($225/mo)...')
  const monthlyProduct = await stripe.products.create({
    name: 'Monthly Membership',
    description: 'Monthly gym membership for one person. Full access to the gym and all equipment.',
  })
  const monthlyPrice = await stripe.prices.create({
    product: monthlyProduct.id,
    unit_amount: 22500, // $225.00
    currency: 'usd',
    recurring: { interval: 'month' },
  })
  
  const { data: monthlyPlan, error: monthlyErr } = await supabase
    .from('membership_plans')
    .insert({
      name: 'Monthly Membership',
      price_cents: 22500,
      description: 'Monthly gym membership for one person. Full access to the gym and all equipment.',
      max_dependents: 0,
      is_active: true,
      stripe_price_id: monthlyPrice.id,
    })
    .select('id')
    .single()

  if (monthlyErr) console.error('  ❌ DB error:', monthlyErr.message)
  else console.log(`  ✅ Created: ${monthlyPlan.id} | Stripe: ${monthlyPrice.id}`)

  // ── Step 3: Create Double Membership ($450/mo) ──
  console.log('\nStep 3: Creating Double Membership ($450/mo)...')
  const doubleProduct = await stripe.products.create({
    name: 'Double Membership',
    description: 'Monthly gym membership for up to 3 household members. Full access to the gym and all equipment.',
  })
  const doublePrice = await stripe.prices.create({
    product: doubleProduct.id,
    unit_amount: 45000, // $450.00
    currency: 'usd',
    recurring: { interval: 'month' },
  })

  const { data: doublePlan, error: doubleErr } = await supabase
    .from('membership_plans')
    .insert({
      name: 'Double Membership',
      price_cents: 45000,
      description: 'Monthly gym membership for up to 3 household members. Full access to the gym and all equipment.',
      max_dependents: 2,
      is_active: true,
      stripe_price_id: doublePrice.id,
    })
    .select('id')
    .single()

  if (doubleErr) console.error('  ❌ DB error:', doubleErr.message)
  else console.log(`  ✅ Created: ${doublePlan.id} | Stripe: ${doublePrice.id}`)

  // ── Step 4: Update Day Pass to $20 ──
  console.log('\nStep 4: Updating Day Pass to $20...')
  const { data: dayPass, error: dpErr } = await supabase
    .from('products')
    .update({ price_cents: 2000 })
    .eq('category', 'DayPass')
    .eq('is_active', true)
    .select('id, name, price_cents')

  if (dpErr) console.error('  ❌ DB error:', dpErr.message)
  else console.log(`  ✅ Updated: ${JSON.stringify(dayPass)}`)

  // ── Step 5: Verify final state ──
  console.log('\n═══════════════════════════════════════')
  console.log('Final State:\n')

  const { data: allPlans } = await supabase
    .from('membership_plans')
    .select('name, price_cents, is_active, max_dependents, stripe_price_id')
    .order('price_cents', { ascending: true })

  console.log('Membership Plans:')
  for (const p of allPlans || []) {
    const status = p.is_active ? '🟢' : '🔴'
    console.log(`  ${status} ${p.name} — $${(p.price_cents / 100).toFixed(2)}/mo | dependents: ${p.max_dependents} | active: ${p.is_active}`)
  }

  const { data: allPasses } = await supabase
    .from('products')
    .select('name, price_cents, is_active')
    .eq('category', 'DayPass')

  console.log('\nDay Passes:')
  for (const p of allPasses || []) {
    const status = p.is_active ? '🟢' : '🔴'
    console.log(`  ${status} ${p.name} — $${(p.price_cents / 100).toFixed(2)}`)
  }

  console.log('\n🎉 Migration complete!')
}

migrate().catch(e => console.error('FATAL:', e))
