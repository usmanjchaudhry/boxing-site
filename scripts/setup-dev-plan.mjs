import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=')
  if (key && rest.length > 0) env[key.trim()] = rest.join('=').trim()
})

const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function setup() {
  console.log('🔐 Setting up Admin Dev Plan...\n')

  // 1. Create $1 Membership
  const memberProduct = await stripe.products.create({
    name: 'Dev Membership',
    description: 'Admin testing membership - $1/month',
  })
  const memberPrice = await stripe.prices.create({
    product: memberProduct.id,
    unit_amount: 100,
    currency: 'usd',
    recurring: { interval: 'month' },
  })

  const { data: memberPlan, error: e1 } = await supabase
    .from('membership_plans')
    .insert({
      name: 'Dev Membership',
      price_cents: 100,
      description: 'Admin testing membership.',
      max_dependents: 0,
      is_active: false, // Hidden from regular UI
      stripe_price_id: memberPrice.id,
    })
    .select('id')
    .single()

  if (e1) console.error('❌', e1.message)
  else console.log(`✅ Dev Membership: ${memberPlan.id} | Stripe: ${memberPrice.id}`)

  // 2. Create $1 Day Pass
  const passProduct = await stripe.products.create({
    name: 'Dev Day Pass',
    description: 'Admin testing day pass - $1',
  })
  const passPrice = await stripe.prices.create({
    product: passProduct.id,
    unit_amount: 100,
    currency: 'usd',
  })

  const { data: dayPass, error: e2 } = await supabase
    .from('products')
    .insert({
      name: 'Dev Day Pass',
      price_cents: 100,
      category: 'DayPass',
      description: 'Admin testing day pass.',
      is_active: false, // Hidden from regular UI
      stripe_price_id: passPrice.id,
    })
    .select('id')
    .single()

  if (e2) console.error('❌', e2.message)
  else console.log(`✅ Dev Day Pass: ${dayPass.id} | Stripe: ${passPrice.id}`)

  console.log('\n🎉 Admin dev products created!')
}

setup().catch(e => console.error('FATAL:', e))
