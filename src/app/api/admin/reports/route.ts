import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/utils/stripe/server'
import { getServiceClient, getStaffProfile } from '@/utils/auth/staff'
import { DEFAULT_TIMEZONE, addDays, localDateString, zonedMidnightUtc } from '@/utils/timezone'

/**
 * Admin reports. All dates are grouped in the gym's timezone (Vercel runs in UTC),
 * reads use the service client (RLS would hide other members' rows), and only
 * successful check-ins count as visits.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** 'YYYY-MM' that is `back` months before `ymd`'s month. */
function monthKeyBack(ymd: string, back: number): string {
  const [y, m] = ymd.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - back, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Supabase returns at most 1000 rows per request, so page through. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

async function facilityTimezone(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('facilities').select('timezone').limit(1).maybeSingle()
  return data?.timezone || DEFAULT_TIMEZONE
}

export async function GET() {
  // Reports show revenue, so admins only (the tab is admin-only too)
  const admin = await getStaffProfile('admin')
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const db = getServiceClient()
    const tz = await facilityTimezone(db)
    const now = new Date()
    const today = localDateString(now, tz)

    // Last 6 calendar months, oldest first (this month included)
    const monthKeys = [5, 4, 3, 2, 1, 0].map(i => monthKeyBack(today, i))
    const windowStart = zonedMidnightUtc(`${monthKeys[0]}-01`, tz)

    // 1. New people per month (accounts + family members added)
    const profiles = await fetchAll<{ created_at: string }>((a, b) =>
      db.from('profiles').select('created_at').gte('created_at', windowStart.toISOString()).range(a, b))
    const growth: Record<string, number> = Object.fromEntries(monthKeys.map(k => [k, 0]))
    for (const p of profiles) {
      const k = localDateString(new Date(p.created_at), tz).slice(0, 7)
      if (k in growth) growth[k]++
    }
    const memberGrowth = monthKeys.map(k => ({ month: monthLabel(k), members: growth[k] }))

    // 2. Check-ins: successful entries only, last 30 days including today
    const first30 = addDays(today, -29)
    const checkins = await fetchAll<{ scanned_at: string }>((a, b) =>
      db.from('gym_checkins').select('scanned_at')
        .eq('status_flag', 'Success')
        .gte('scanned_at', zonedMidnightUtc(first30, tz).toISOString())
        .range(a, b))
    const perDate: Record<string, number> = {}
    for (const c of checkins) {
      const d = localDateString(new Date(c.scanned_at), tz)
      perDate[d] = (perDate[d] || 0) + 1
    }
    const byWeekday: Record<string, number> = Object.fromEntries(DAY_NAMES.map(d => [d, 0]))
    for (const [ymd, n] of Object.entries(perDate)) {
      byWeekday[DAY_NAMES[new Date(`${ymd}T12:00:00Z`).getUTCDay()]] += n
    }
    const checkinsByDay = DAY_NAMES.map(day => ({ day, checkins: byWeekday[day] }))
    const checkinTrend = Array.from({ length: 14 }, (_, i) => {
      const ymd = addDays(today, i - 13)
      return { date: dayLabel(ymd), checkins: perDate[ymd] || 0 }
    })

    // 3. Memberships (one per household). Cash memberships past their end date
    //    count as cancelled, same rule as the scanner.
    const { data: subs, error: subsErr } = await db
      .from('subscriptions')
      .select('status, end_date, payment_method, membership_plans(name)')
    if (subsErr) throw new Error(subsErr.message)
    const statusCounts: Record<string, number> = { Active: 0, Past_Due: 0, Frozen: 0, Cancelled: 0 }
    const planCounts: Record<string, number> = {}
    for (const s of subs ?? []) {
      const expiredCash = s.status === 'Active' && s.payment_method === 'cash' && s.end_date && now > new Date(s.end_date)
      const status = expiredCash ? 'Cancelled' : s.status
      if (status in statusCounts) statusCounts[status]++
      if (status === 'Active') {
        const joined = s.membership_plans as unknown
        const plan = (Array.isArray(joined) ? joined[0] : joined) as { name?: string } | null
        const name = plan?.name || 'Unknown'
        planCounts[name] = (planCounts[name] || 0) + 1
      }
    }
    const subscriptionStatus = Object.entries(statusCounts).filter(([, v]) => v > 0).map(([status, count]) => ({ status, count }))
    const planDistribution = Object.entries(planCounts).map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count)

    // 4. Revenue per month: card payments (Stripe, minus refunds) + recorded cash
    const card: Record<string, number> = Object.fromEntries(monthKeys.map(k => [k, 0]))
    const cash: Record<string, number> = Object.fromEntries(monthKeys.map(k => [k, 0]))
    let revenueComplete = true
    try {
      // Auto-pagination: every charge in the window, not just the first 100
      for await (const c of stripe.charges.list({ created: { gte: Math.floor(windowStart.getTime() / 1000) }, limit: 100 }) as AsyncIterable<Stripe.Charge>) {
        if (c.status !== 'succeeded') continue
        const k = localDateString(new Date(c.created * 1000), tz).slice(0, 7)
        if (k in card) card[k] += (c.amount - (c.amount_refunded || 0)) / 100
      }
    } catch (e) {
      revenueComplete = false
      console.error('[reports] Stripe revenue failed:', e instanceof Error ? e.message : e)
    }
    const { data: cashRows } = await db
      .from('cash_payments')
      .select('amount_cents, payment_date')
      .gte('payment_date', `${monthKeys[0]}-01`)
    for (const r of cashRows ?? []) {
      const k = String(r.payment_date).slice(0, 7)
      if (k in cash) cash[k] += (r.amount_cents || 0) / 100
    }
    const revenue = monthKeys.map(k => ({
      month: monthLabel(k),
      revenue: Math.round((card[k] + cash[k]) * 100) / 100,
      card: Math.round(card[k] * 100) / 100,
      cash: Math.round(cash[k] * 100) / 100,
    }))
    const round2 = (n: number) => Math.round(n * 100) / 100
    const monthTotals = (key: string) => ({
      label: monthLabel(key),
      total: round2(card[key] + cash[key]),
      card: round2(card[key]),
      cash: round2(cash[key]),
    })
    // This calendar month so far, and the last full calendar month
    const thisMonth = monthTotals(monthKeys[monthKeys.length - 1])
    const lastMonth = monthTotals(monthKeys[monthKeys.length - 2])

    // 5. Summary
    const activeCount = statusCounts.Active
    const everCount = Object.values(statusCounts).reduce((a, b) => a + b, 0)
    const cancelledRate = everCount > 0 ? Math.round((statusCounts.Cancelled / everCount) * 100) : 0
    const totalCheckins = checkins.length

    return NextResponse.json({
      memberGrowth,
      checkinsByDay,
      checkinTrend,
      subscriptionStatus,
      planDistribution,
      revenue,
      summary: {
        thisMonth,
        lastMonth,
        revenueComplete,
        churnRate: cancelledRate,
        avgCheckinsPerDay: Math.round((totalCheckins / 30) * 10) / 10,
        totalCheckins,
        activeMembers: activeCount,
        cancelledMembers: statusCounts.Cancelled,
      },
    })
  } catch (err) {
    console.error('Reports API error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load reports' }, { status: 500 })
  }
}
