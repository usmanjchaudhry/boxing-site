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

// Charges per request: a few Stripe pages, so one request stays quick no matter how
// long the history gets. The dashboard asks for the next batch until there are none.
const PAGE_SIZE = 100
const PAGES_PER_REQUEST = 3

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

// GET /api/admin/payments[?after=<charge id>] — Stripe payments, newest first, in batches.
// Returns { payments, nextCursor }; pass nextCursor back as ?after= for the next batch
// (null when there are no older payments). This used to return only the 20 most recent
// charges, so anyone who paid earlier couldn't be found.
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const after = request.nextUrl.searchParams.get('after')
  if (after && !/^[A-Za-z0-9_]{1,255}$/.test(after)) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  }

  try {
    const [names, { charges, nextCursor }] = await Promise.all([
      householdNamesByCustomer(),
      (async () => {
        const charges: Stripe.Charge[] = []
        let cursor = after || undefined
        let hasMore = true
        for (let page = 0; page < PAGES_PER_REQUEST && hasMore; page++) {
          // Expand the customer so its name/email can stand in when billing details are blank
          const res = await stripe.charges.list({ limit: PAGE_SIZE, starting_after: cursor, expand: ['data.customer'] })
          charges.push(...res.data)
          hasMore = res.has_more && res.data.length > 0
          cursor = res.data[res.data.length - 1]?.id
        }
        return { charges, nextCursor: hasMore ? cursor ?? null : null }
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

    return NextResponse.json({ payments, nextCursor })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to fetch payments:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
