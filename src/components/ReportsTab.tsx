'use client'

import { useState, useEffect } from 'react'
import { Loader2, TrendingUp, TrendingDown, Users, DollarSign, Activity, BarChart3, CreditCard, Banknote, Wallet } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface ReportsData {
  memberGrowth: { month: string; members: number }[]
  checkinsByDay: { day: string; checkins: number }[]
  checkinTrend: { date: string; checkins: number }[]
  subscriptionStatus: { status: string; count: number }[]
  planDistribution: { plan: string; count: number }[]
  revenue: { month: string; revenue: number; card: number; cash: number }[]
  summary: {
    totalRevenue: number
    cardRevenue: number
    cashRevenue: number
    thisMonth: { label: string; total: number; card: number; cash: number }
    churnRate: number
    avgCheckinsPerDay: number
    totalCheckins: number
    activeMembers: number
    cancelledMembers: number
    revenueComplete?: boolean
  }
}

const STRIPE_COLOR = '#818cf8'
const CASH_COLOR = '#f59e0b'
const MONEY_KEYS = new Set(['revenue', 'card', 'cash'])

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_COLORS: Record<string, string> = {
  Active: '#22c55e',
  Cancelled: '#ef4444',
  Past_Due: '#f59e0b',
  Frozen: '#3b82f6',
}

const PLAN_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 shadow-2xl">
        <p className="text-xs text-zinc-400 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-sm font-bold" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' && MONEY_KEYS.has(p.dataKey)
              ? money(p.value)
              : p.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function ReportsTab() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch('/api/admin/reports')
        if (!res.ok) throw new Error('Failed to fetch reports')
        const json = await res.json()
        setData(json)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchReports()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <span className="ml-3 text-zinc-400">Loading reports...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-red-400">
        Failed to load reports: {error}
      </div>
    )
  }

  const { summary } = data

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-5 h-5" />}
          label={summary.revenueComplete === false ? 'Revenue, 6 mo (cash only, card failed)' : 'Revenue (last 6 months)'}
          value={`$${summary.totalRevenue.toLocaleString()}`}
          color="text-green-400"
          bgColor="bg-green-500/10"
        />
        <SummaryCard
          icon={<Users className="w-5 h-5" />}
          label="Active Memberships"
          value={summary.activeMembers.toString()}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <SummaryCard
          icon={<Activity className="w-5 h-5" />}
          label="Avg Daily Check-ins (30 days)"
          value={summary.avgCheckinsPerDay.toString()}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <SummaryCard
          icon={summary.churnRate > 20 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
          label="Cancelled (of all memberships)"
          value={`${summary.churnRate}%`}
          color={summary.churnRate > 20 ? 'text-red-400' : 'text-green-400'}
          bgColor={summary.churnRate > 20 ? 'bg-red-500/10' : 'bg-green-500/10'}
        />
      </div>

      {/* Income Breakdown: Stripe vs in-person cash */}
      <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <Wallet className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-bold">Income Breakdown</h3>
          <span className="text-xs text-zinc-500 ml-auto">Stripe vs in-person cash · after refunds</span>
        </div>
        {summary.revenueComplete === false && (
          <p className="mb-4 text-xs text-amber-400">
            Couldn&apos;t reach Stripe, so card income is missing. Totals below are cash only.
          </p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IncomeSplit
            title={`This month (${summary.thisMonth.label})`}
            total={summary.thisMonth.total}
            card={summary.thisMonth.card}
            cash={summary.thisMonth.cash}
          />
          <IncomeSplit
            title="Last 6 months"
            total={summary.totalRevenue}
            card={summary.cardRevenue}
            cash={summary.cashRevenue}
          />
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <DollarSign className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-bold">Monthly Revenue</h3>
          <span className="text-xs text-zinc-500 ml-auto">Stripe + cash, after refunds · last 6 months</span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.revenue}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="month" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${v}`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend />
            <Bar dataKey="card" stackId="income" fill={STRIPE_COLOR} name="Stripe (card)" />
            <Bar dataKey="cash" stackId="income" fill={CASH_COLOR} name="Cash" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Two column row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Member Growth */}
        <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold">New People Added</h3>
            <span className="text-xs text-zinc-500 ml-auto">Last 6 months</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.memberGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="members" fill="#3b82f6" radius={[6, 6, 0, 0]} name="members" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Check-ins by Day */}
        <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-bold">Check-ins by Day</h3>
            <span className="text-xs text-zinc-500 ml-auto">Last 30 days</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.checkinsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="day" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="checkins" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="checkins" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Check-in Trend */}
      <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-bold">Daily Check-in Trend</h3>
          <span className="text-xs text-zinc-500 ml-auto">Last 14 days</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.checkinTrend}>
            <defs>
              <linearGradient id="checkinGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={11} angle={-30} textAnchor="end" height={50} />
            <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="checkins"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#checkinGrad)"
              name="checkins"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two column: Subscription Status + Plan Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Status Pie */}
        <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
          <h3 className="text-lg font-bold mb-6">Membership Status</h3>
          {data.subscriptionStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data.subscriptionStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="status"
                  label={({ status, count }: any) => `${status}: ${count}`}
                  labelLine={false}
                >
                  {data.subscriptionStatus.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.status] || '#71717a'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-12 text-zinc-600">No subscription data</p>
          )}
        </div>

        {/* Plan Distribution */}
        <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
          <h3 className="text-lg font-bold mb-6">Active Memberships by Plan</h3>
          {data.planDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data.planDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="plan"
                  label={({ plan, count }: any) => `${plan}: ${count}`}
                  labelLine={false}
                >
                  {data.planDistribution.map((_, i) => (
                    <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-12 text-zinc-600">No plan data</p>
          )}
        </div>
      </div>
    </div>
  )
}

function IncomeSplit({ title, total, card, cash }: { title: string; total: number; card: number; cash: number }) {
  const cardPct = total > 0 ? Math.round((card / total) * 100) : 0
  const cashPct = total > 0 ? 100 - cardPct : 0

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 sm:p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">{title}</p>
      <p className="text-3xl sm:text-4xl font-black text-green-400 mb-4">{money(total)}</p>

      {/* Split bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800 mb-4">
        {total > 0 && (
          <>
            <div className="h-full transition-all duration-700" style={{ width: `${cardPct}%`, backgroundColor: STRIPE_COLOR }} />
            <div className="h-full transition-all duration-700" style={{ width: `${cashPct}%`, backgroundColor: CASH_COLOR }} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-start gap-2">
          <CreditCard className="w-4 h-4 mt-0.5 shrink-0" style={{ color: STRIPE_COLOR }} />
          <div>
            <p className="text-xs text-zinc-500">Stripe (card)</p>
            <p className="text-lg font-bold text-white">{money(card)}</p>
            <p className="text-xs text-zinc-500">{cardPct}%</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Banknote className="w-4 h-4 mt-0.5 shrink-0" style={{ color: CASH_COLOR }} />
          <div>
            <p className="text-xs text-zinc-500">In-person cash</p>
            <p className="text-lg font-bold text-white">{money(cash)}</p>
            <p className="text-xs text-zinc-500">{cashPct}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, color, bgColor }: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  bgColor: string
}) {
  return (
    <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${bgColor} ${color} mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className={`text-2xl sm:text-3xl font-black ${color}`}>{value}</p>
    </div>
  )
}
