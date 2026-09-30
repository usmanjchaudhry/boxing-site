import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { stripe } from '@/utils/stripe/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // 1. Member growth over time (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('created_at')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true })

    // Group by month
    const memberGrowth: Record<string, number> = {}
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = d.toISOString().slice(0, 7) // YYYY-MM
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      memberGrowth[key] = 0
      months.push({ key, label })
    }

    allProfiles?.forEach(p => {
      const key = p.created_at.slice(0, 7)
      if (memberGrowth[key] !== undefined) {
        memberGrowth[key]++
      }
    })

    const memberGrowthData = months.map(m => ({
      month: m.label,
      members: memberGrowth[m.key]
    }))

    // 2. Check-in frequency (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentCheckins } = await supabase
      .from('check_ins')
      .select('scanned_at')
      .gte('scanned_at', thirtyDaysAgo.toISOString())
      .order('scanned_at', { ascending: true })

    // Group by day of week
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const checkinsByDay: Record<string, number> = {}
    dayNames.forEach(d => { checkinsByDay[d] = 0 })

    recentCheckins?.forEach(c => {
      const day = dayNames[new Date(c.scanned_at).getDay()]
      checkinsByDay[day]++
    })

    const checkinsByDayData = dayNames.map(d => ({
      day: d,
      checkins: checkinsByDay[d]
    }))

    // 3. Check-ins per day (last 14 days for trend)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const checkinTrend: { date: string; checkins: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const count = recentCheckins?.filter(c => c.scanned_at.startsWith(dateStr)).length || 0
      checkinTrend.push({ date: label, checkins: count })
    }

    // 4. Subscription breakdown
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('status, membership_plans(name)')

    const statusCounts: Record<string, number> = { Active: 0, Cancelled: 0, Past_Due: 0, Frozen: 0 }
    const planCounts: Record<string, number> = {}

    subscriptions?.forEach(s => {
      if (statusCounts[s.status] !== undefined) {
        statusCounts[s.status]++
      }
      const planName = (s.membership_plans as any)?.name || 'Unknown'
      planCounts[planName] = (planCounts[planName] || 0) + 1
    })

    const subscriptionStatusData = Object.entries(statusCounts)
      .filter(([, v]) => v > 0)
      .map(([status, count]) => ({ status, count }))

    const planDistributionData = Object.entries(planCounts)
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count)

    // 5. Revenue data from Stripe (last 6 months)
    const revenueData: { month: string; revenue: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const start = new Date()
      start.setMonth(start.getMonth() - i, 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)

      const label = start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

      try {
        const chargesResponse = await stripe.charges.list({
          created: {
            gte: Math.floor(start.getTime() / 1000),
            lt: Math.floor(end.getTime() / 1000),
          },
          limit: 100,
        })
        const charges = 'data' in chargesResponse && Array.isArray(chargesResponse.data)
          ? chargesResponse.data
          : (chargesResponse as any)?.data || []

        const monthRevenue = charges
          .filter((c: any) => c.status === 'succeeded')
          .reduce((sum: number, c: any) => sum + (c.amount || 0), 0)

        revenueData.push({ month: label, revenue: monthRevenue / 100 })
      } catch {
        revenueData.push({ month: label, revenue: 0 })
      }
    }

    // 6. Total revenue (all time)
    const totalRevenue = revenueData.reduce((sum, r) => sum + r.revenue, 0)

    // 7. Churn rate (cancelled / (active + cancelled) last 30 days)
    const activeCount = statusCounts.Active || 0
    const cancelledCount = statusCounts.Cancelled || 0
    const total = activeCount + cancelledCount
    const churnRate = total > 0 ? Math.round((cancelledCount / total) * 100) : 0

    // 8. Average check-ins per day (last 30 days)
    const totalCheckins = recentCheckins?.length || 0
    const avgCheckinsPerDay = Math.round((totalCheckins / 30) * 10) / 10

    return NextResponse.json({
      memberGrowth: memberGrowthData,
      checkinsByDay: checkinsByDayData,
      checkinTrend,
      subscriptionStatus: subscriptionStatusData,
      planDistribution: planDistributionData,
      revenue: revenueData,
      summary: {
        totalRevenue,
        churnRate,
        avgCheckinsPerDay,
        totalCheckins,
        activeMembers: activeCount,
        cancelledMembers: cancelledCount,
      }
    })
  } catch (err: any) {
    console.error('Reports API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
