import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/utils/stripe/server'
import { fetchAll } from '@/utils/supabase-paging'
import { fullName } from '@/utils/name-search'

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = getAdminSupabase()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') return null
  return profile
}

type PaymentRow = {
  id: string
  amount: number
  currency: string
  status: string
  created: number
  customerEmail: string
  customerName: string
  /** Primary member of the household this Stripe customer belongs to (from our DB). */
  memberName: string | null
  /** Everyone in that household, so searching a dependent's name finds the payment. */
  householdNames: string[]
  description: string
  receiptUrl: string | null
}

// The dashboard polls every 15s. Pulling the whole Stripe history that often is
// wasteful, so keep the last result for a minute (per server instance).
const CACHE_MS = 60_000
let cache: { at: number; payments: PaymentRow[] } | null = null

/** Stripe customer id → { primary name, all member names } for every household. */
async function householdNamesByCustomer() {
  const db = getAdminSupabase()
  const [households, members] = await Promise.all([
    fetchAll<{ id: string; stripe_customer_id: string | null }>((from, to) => db
      .from('households').select('id, stripe_customer_id')
      .not('stripe_customer_id', 'is', null).order('id').range(from, to)),
    fetchAll<{ household_id: string; role: string; profiles: unknown }>((from, to) => db
      .from('household_members').select('household_id, profile_id, role, profiles(first_name, last_name)')
      .order('household_id').order('profile_id').range(from, to)),
  ])

  const byHousehold = new Map<string, { primary: string | null; all: string[] }>()
  for (const m of members) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { first_name: string | null; last_name: string | null } | null
    const name = p ? fullName(p.first_name, p.last_name) : ''
    if (!name) continue
    const entry = byHousehold.get(m.household_id) ?? { primary: null, all: [] }
    if (m.role === 'Primary') entry.primary = name
    entry.all.push(name)
    byHousehold.set(m.household_id, entry)
  }

  const byCustomer = new Map<string, { primary: string | null; all: string[] }>()
  for (const h of households) {
    const entry = byHousehold.get(h.id)
    if (h.stripe_customer_id && entry) byCustomer.set(h.stripe_customer_id, entry)
  }
  return byCustomer
}

// GET /api/admin/payments — Every Stripe payment (newest first), searchable by member
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (cache && Date.now() - cache.at < CACHE_MS && !request.nextUrl.searchParams.has('fresh')) {
    return NextResponse.json({ payments: cache.payments })
  }

  try {
    // This used to show only the 20 most recent charges, so anyone who paid
    // earlier couldn't be found. Page through the whole history instead.
    const [names, charges] = await Promise.all([
      householdNamesByCustomer(),
      (async () => {
        const all: Stripe.Charge[] = []
        // Expand the customer so its name/email can stand in when billing details are blank
        for await (const c of stripe.charges.list({ limit: 100, expand: ['data.customer'] }) as AsyncIterable<Stripe.Charge>) all.push(c)
        return all
      })(),
    ])

    const payments: PaymentRow[] = charges.map(charge => {
      const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
      const customer = charge.customer && typeof charge.customer === 'object' && !charge.customer.deleted ? charge.customer : null
      const household = customerId ? names.get(customerId) : undefined
      return {
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        created: charge.created,
        customerEmail: charge.billing_details?.email || charge.receipt_email || customer?.email || 'N/A',
        customerName: charge.billing_details?.name || customer?.name || household?.primary || 'N/A',
        memberName: household?.primary ?? null,
        householdNames: household?.all ?? [],
        description: charge.description || 'Subscription payment',
        receiptUrl: charge.receipt_url,
      }
    })

    cache = { at: Date.now(), payments }
    return NextResponse.json({ payments })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to fetch payments:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
