import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

// POST /api/admin/cash-payment — Record a cash payment and activate subscription
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })
  }

  const { profileId, planId, paymentDate, notes } = await request.json()

  if (!profileId || !planId || !paymentDate) {
    return NextResponse.json({ error: 'Missing required fields: profileId, planId, paymentDate' }, { status: 400 })
  }

  const db = getAdminSupabase()

  // 1. Get the member's household
  const { data: hm } = await db
    .from('household_members')
    .select('household_id')
    .eq('profile_id', profileId)
    .single()

  if (!hm) {
    return NextResponse.json({ error: 'Member has no household' }, { status: 400 })
  }

  // 2. Get the plan details
  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, price_cents, billing_interval')
    .eq('id', planId)
    .single()

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  // 3. Calculate end date based on billing interval
  const startDate = new Date(paymentDate)
  const endDate = new Date(startDate)
  
  if (plan.billing_interval === 'month') {
    endDate.setMonth(endDate.getMonth() + 1)
  } else if (plan.billing_interval === 'year') {
    endDate.setFullYear(endDate.getFullYear() + 1)
  } else if (plan.billing_interval === 'week') {
    endDate.setDate(endDate.getDate() + 7)
  } else {
    // Default to 30 days
    endDate.setDate(endDate.getDate() + 30)
  }

  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]

  // 4. Check for existing active subscription
  const { data: existingSub } = await db
    .from('subscriptions')
    .select('id, status')
    .eq('household_id', hm.household_id)
    .eq('status', 'Active')
    .maybeSingle()

  let subscriptionId: string

  if (existingSub) {
    // Update existing subscription
    const { error: updateErr } = await db
      .from('subscriptions')
      .update({
        plan_id: planId,
        status: 'Active',
        start_date: startDateStr,
        end_date: endDateStr,
        payment_method: 'cash',
        stripe_subscription_id: null,
      })
      .eq('id', existingSub.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
    subscriptionId = existingSub.id
  } else {
    // Cancel any existing non-active subscriptions first
    await db
      .from('subscriptions')
      .delete()
      .eq('household_id', hm.household_id)
      .neq('status', 'Active')

    // Create new subscription
    const { data: newSub, error: createErr } = await db
      .from('subscriptions')
      .insert({
        household_id: hm.household_id,
        plan_id: planId,
        status: 'Active',
        start_date: startDateStr,
        end_date: endDateStr,
        payment_method: 'cash',
        stripe_subscription_id: null,
      })
      .select('id')
      .single()

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }
    subscriptionId = newSub.id
  }

  // 5. Record the cash payment for audit
  const { error: paymentErr } = await db
    .from('cash_payments')
    .insert({
      subscription_id: subscriptionId,
      household_id: hm.household_id,
      amount_cents: plan.price_cents,
      payment_date: startDateStr,
      recorded_by: admin.id,
      notes: notes || null,
    })

  if (paymentErr) {
    console.error('Failed to record cash payment:', paymentErr)
    // Don't fail the whole operation — subscription is already active
  }

  return NextResponse.json({
    success: true,
    message: `Cash payment recorded. ${plan.name} active until ${endDateStr}.`,
    subscription: {
      id: subscriptionId,
      planName: plan.name,
      startDate: startDateStr,
      endDate: endDateStr,
      amountPaid: `$${(plan.price_cents / 100).toFixed(2)}`,
    }
  })
}

// GET /api/admin/cash-payment — Get all cash payment history
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = getAdminSupabase()

  // Simple flat query
  const { data: rawPayments, error } = await db
    .from('cash_payments')
    .select('id, amount_cents, payment_date, notes, created_at, household_id, subscription_id, recorded_by')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Failed to fetch cash payments:', error)
    return NextResponse.json({ payments: [] })
  }

  // Get subscription details for end_date and plan
  const subIds = [...new Set((rawPayments || []).map(p => p.subscription_id))]
  const { data: subs } = await db
    .from('subscriptions')
    .select('id, status, end_date, plan_id, membership_plans(name)')
    .in('id', subIds.length ? subIds : ['none'])

  const subMap: Record<string, any> = {}
  for (const s of subs || []) {
    subMap[s.id] = s
  }

  // Get primary member names per household
  const hhIds = [...new Set((rawPayments || []).map(p => p.household_id))]
  const { data: hhMembers } = await db
    .from('household_members')
    .select('household_id, role, profiles(first_name, last_name)')
    .eq('role', 'Primary')
    .in('household_id', hhIds.length ? hhIds : ['none'])

  const hhNameMap: Record<string, string> = {}
  for (const hm of hhMembers || []) {
    const p = hm.profiles as any
    if (p) hhNameMap[hm.household_id] = `${p.first_name} ${p.last_name}`
  }

  // Get admin names who recorded payments
  const adminIds = [...new Set((rawPayments || []).map(p => p.recorded_by))]
  const { data: admins } = await db
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', adminIds.length ? adminIds : ['none'])

  const adminMap: Record<string, string> = {}
  for (const a of admins || []) {
    adminMap[a.id] = `${a.first_name} ${a.last_name}`
  }

  // Build response
  const payments = (rawPayments || []).map(p => {
    const sub = subMap[p.subscription_id]
    const plan = sub?.membership_plans as any
    return {
      id: p.id,
      amount_cents: p.amount_cents,
      payment_date: p.payment_date,
      notes: p.notes,
      created_at: p.created_at,
      memberName: hhNameMap[p.household_id] || 'Unknown',
      planName: plan?.name || 'Unknown',
      endDate: sub?.end_date || null,
      subStatus: sub?.status || 'Unknown',
      recordedBy: adminMap[p.recorded_by] || 'Admin',
    }
  })

  return NextResponse.json({ payments })
}

