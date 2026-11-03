import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getStaffProfile } from '@/utils/auth/staff'

/**
 * Cash going OUT of the drawer: paying a coach in cash, or another expense
 * (supplies, repairs, ...). Stored in `cash_payouts` with a positive amount and
 * shown as a minus in the Cash Payments tab. Admins only, same as cash payments.
 */

const CATEGORIES = ['coach', 'other'] as const
type PayoutCategory = (typeof CATEGORIES)[number]

const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// POST /api/admin/cash-payout: record cash paid out
export async function POST(request: NextRequest) {
  const admin = await getStaffProfile('admin')
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const payeeName = typeof body?.payeeName === 'string' ? body.payeeName.trim() : ''
  const category: PayoutCategory = CATEGORIES.includes(body?.category) ? body.category : 'coach'
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null
  const payoutDate = body?.payoutDate

  if (!payeeName) {
    return NextResponse.json({ error: 'Enter who was paid.' }, { status: 400 })
  }
  if (payeeName.length > 120) {
    return NextResponse.json({ error: 'Name is too long (120 characters max).' }, { status: 400 })
  }
  if (!isYmd(payoutDate)) {
    return NextResponse.json({ error: 'Pick the date the cash was paid out.' }, { status: 400 })
  }
  if (category === 'other' && !notes) {
    return NextResponse.json({ error: 'Add a reason for "Other expense" payouts.' }, { status: 400 })
  }

  const dollars = Number(body?.amount)
  if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 10000) {
    return NextResponse.json({ error: 'Amount must be between $0.01 and $10,000.' }, { status: 400 })
  }
  const amountCents = Math.round(dollars * 100)

  const db = getServiceClient()
  const { data, error } = await db
    .from('cash_payouts')
    .insert({
      payee_name: payeeName,
      category,
      amount_cents: amountCents,
      payout_date: payoutDate,
      notes,
      recorded_by: admin.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to record cash payout:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.info('Cash payout recorded', { payoutId: data.id, recordedBy: admin.id, category, amountCents, payoutDate })
  return NextResponse.json({
    success: true,
    message: `Recorded -$${(amountCents / 100).toFixed(2)} paid to ${payeeName}.`,
  })
}

// GET /api/admin/cash-payout: recent cash payouts (newest first)
export async function GET() {
  const admin = await getStaffProfile('admin')
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = getServiceClient()
  const { data: rows, error } = await db
    .from('cash_payouts')
    .select('id, payee_name, category, amount_cents, payout_date, notes, created_at, recorded_by')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    // Most likely the table hasn't been created yet (database/cash_payouts.sql)
    console.error('Failed to fetch cash payouts:', error)
    return NextResponse.json({ payouts: [], error: error.message })
  }

  const adminIds = [...new Set((rows || []).map(r => r.recorded_by))]
  const { data: admins } = await db
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', adminIds.length ? adminIds : ['00000000-0000-0000-0000-000000000000'])

  const adminMap: Record<string, string> = {}
  for (const a of admins || []) adminMap[a.id] = `${a.first_name} ${a.last_name}`

  const payouts = (rows || []).map(r => ({
    id: r.id,
    payeeName: r.payee_name,
    category: r.category as PayoutCategory,
    amount_cents: r.amount_cents,
    payout_date: r.payout_date,
    notes: r.notes,
    created_at: r.created_at,
    recordedBy: adminMap[r.recorded_by] || 'Admin',
  }))

  return NextResponse.json({ payouts })
}

// DELETE /api/admin/cash-payout?id=<uuid>: remove a payout entered by mistake
export async function DELETE(request: NextRequest) {
  const admin = await getStaffProfile('admin')
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing payout id' }, { status: 400 })
  }

  const db = getServiceClient()
  const { data: deleted, error } = await db
    .from('cash_payouts')
    .delete()
    .eq('id', id)
    .select('id, payee_name, amount_cents, payout_date')

  if (error) {
    console.error('Failed to delete cash payout:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Payout not found (it may already be removed)' }, { status: 404 })
  }

  const p = deleted[0]
  console.info('Cash payout removed', { payoutId: p.id, removedBy: admin.id, amountCents: p.amount_cents, payoutDate: p.payout_date })

  return NextResponse.json({
    success: true,
    message: `Removed -$${(p.amount_cents / 100).toFixed(2)} payout to ${p.payee_name} from ${p.payout_date}.`,
  })
}

