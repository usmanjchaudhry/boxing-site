/**
 * Add the hidden plans unlocked by the access code on /memberships/classified
 *
 *   - "Individual Unlimited $70": $70/mo, account holder only, unlimited visits
 *   - "Individual Unlimited $80": $80/mo, account holder only, unlimited visits
 *   - "Individual Unlimited $90": $90/mo, account holder only, unlimited visits
 *   - "Twice a Week Membership":  $80/mo, account holder only, 2 visit days per Mon-Sun week
 *   - "Family of 5 Membership":   $400/mo, account holder + 4 household members
 *
 * All are hidden (is_active = false): they don't show on the public Memberships
 * page, only after typing the access code. Staff can still record them as cash.
 *
 * BEFORE running: run database/weekly_checkin_limit.sql in the Supabase SQL
 * editor of the SAME project, or the Twice a Week plan is skipped (its weekly
 * limit can't be saved). The other plans are still added.
 *
 * Safe to re-run: a plan that already exists (by name) is skipped.
 *
 * Usage:
 *   node scripts/add-hidden-plans.mjs                 # uses .env.local (dev)
 *   node scripts/add-hidden-plans.mjs .env.production # uses another env file
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Names must match CODE_UNLOCKED_PLAN_NAMES in src/utils/legacy-access.ts
const individualUnlimited = (dollars) => ({
  name: `Individual Unlimited $${dollars}`,
  price_cents: dollars * 100,
  max_dependents: 0,
  max_weekly_checkins: null, // check in any day
  description: 'Monthly membership for the account holder. Check in any day, unlimited visits. Full access to the gym and all equipment.',
})

const PLANS = [
  individualUnlimited(70),
  individualUnlimited(80),
  individualUnlimited(90),
  {
    name: 'Twice a Week Membership',
    price_cents: 8000, // $80.00
    max_dependents: 0,
    max_weekly_checkins: 2,
    description: 'Monthly membership for the account holder. Train any 2 days each week (Monday to Sunday). Full access to the gym and all equipment.',
  },
  {
    name: 'Family of 5 Membership',
    price_cents: 40000, // $400.00
    max_dependents: 4,
    max_weekly_checkins: null,
    description: 'Monthly gym membership for the account holder plus 4 household members. Full access to the gym and all equipment.',
  },
]

// Load env
const envPath = process.argv[2] || '.env.local'
const envFile = fs.readFileSync(envPath, 'utf8')
const env = {}
envFile.split(/\r?\n/).forEach(line => {
  const [key, ...rest] = line.split('=')
  if (key && rest.length > 0) env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '')
})

for (const k of ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) {
    console.error(`FATAL: ${k} is missing from ${envPath}`)
    process.exit(1)
  }
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function addPlan(def) {
  const { data: existing, error: lookupErr } = await supabase
    .from('membership_plans')
    .select('id, stripe_price_id')
    .eq('name', def.name)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`)
  if (existing) {
    console.log(`ℹ️  ${def.name} already exists: ${existing.id} | Stripe: ${existing.stripe_price_id}. Skipped.`)
    return
  }

  // Stripe product + monthly price
  const product = await stripe.products.create({ name: def.name, description: def.description })
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: def.price_cents,
    currency: 'usd',
    recurring: { interval: 'month' },
  })
  console.log(`✅ ${def.name}: Stripe product ${product.id} | price ${price.id}`)

  const row = {
    name: def.name,
    price_cents: def.price_cents,
    description: def.description,
    billing_interval: 'month',
    max_dependents: def.max_dependents,
    is_active: false, // hidden: only shown after the access code
    stripe_price_id: price.id,
  }
  if (def.max_weekly_checkins != null) row.max_weekly_checkins = def.max_weekly_checkins

  const { data: plan, error } = await supabase.from('membership_plans').insert(row).select('id').single()
  if (error) {
    // Don't leave an orphaned product on sale in Stripe
    await stripe.products.update(product.id, { active: false })
    throw new Error(`DB insert for ${def.name} failed (Stripe product archived): ${error.message}`)
  }
  console.log(`✅ ${def.name}: plan row ${plan.id}`)
}

async function run() {
  const mode = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) ? 'LIVE' : 'TEST'
  console.log('🥊 Adding hidden plans')
  console.log(`   env file: ${envPath} | Stripe: ${mode} | Supabase: ${env.NEXT_PUBLIC_SUPABASE_URL}\n`)

  // Plans with a weekly limit need the column first, otherwise Twice a Week would
  // be saved as unlimited. Those are skipped (not the whole run) until it exists;
  // re-run this script after the SQL to add them.
  const { error: columnErr } = await supabase.from('membership_plans').select('max_weekly_checkins').limit(1)
  const hasWeeklyColumn = !columnErr
  const skipped = []

  for (const def of PLANS) {
    if (def.max_weekly_checkins != null && !hasWeeklyColumn) {
      skipped.push(def.name)
      continue
    }
    await addPlan(def)
  }

  if (skipped.length > 0) {
    console.warn(
      `\n⚠️  Skipped ${skipped.join(', ')}: the max_weekly_checkins column is missing (${columnErr.message}).\n` +
      '   Run database/weekly_checkin_limit.sql in the Supabase SQL editor for this project, then re-run this script.'
    )
  }

  const { data: hidden } = await supabase
    .from('membership_plans')
    .select(`name, price_cents, max_dependents, is_active, stripe_price_id${hasWeeklyColumn ? ', max_weekly_checkins' : ''}`)
    .in('name', PLANS.map(p => p.name))
  console.log('\nHidden plans:')
  for (const p of hidden || []) {
    console.log(
      `  🔒 ${p.name}: $${(p.price_cents / 100).toFixed(2)}/mo | household members: ${p.max_dependents}` +
      ` | visits/week: ${p.max_weekly_checkins ?? 'unlimited'} | public: ${p.is_active} | Stripe: ${p.stripe_price_id}`
    )
  }
  console.log('\n🎉 Done!')
}

run().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
