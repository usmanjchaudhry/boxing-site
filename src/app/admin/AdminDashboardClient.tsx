'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ShieldCheck, RefreshCw, Banknote, Loader2, Search, BookOpen, Trash2 } from 'lucide-react'
import CheckinScanner from '@/components/CheckinScanner'
import ReportsTab from '@/components/ReportsTab'
import CheckinsLogTab from '@/components/CheckinsLogTab'
import UserGuideTab from '@/components/user-guide/UserGuideTab'
import type { GuideFacts } from '@/utils/user-guide-facts'
import { tabsForRole, type AdminTab, type StaffRole } from './admin-tabs'
import { freezeSubscription, unfreezeSubscription, cancelSubscription } from './actions'

interface Stats {
  totalMembers: number
  activeSubscriptions: number
  todayCheckins: number
}

interface CheckinEntry {
  id: string
  scanned_at: string
  checkin_method: string
  status_flag: string
  profiles: { first_name: string; last_name: string } | null
}

interface Payment {
  id: string
  amount: number
  currency: string
  status: string
  created: number
  customerEmail: string
  customerName: string
  description: string
  receiptUrl: string | null
}

interface Member {
  id: string
  householdId: string | null
  name: string
  role: string
  householdRole: string
  subscriptionStatus: string
  planName: string
  hasWaiver: boolean
  joinedAt: string
  stripeCustomerId: string | null
  primaryName: string | null
  hasAuth: boolean
}

type Tab = AdminTab

interface Plan {
  id: string
  name: string
  price_cents: number
  billing_interval: string
}

/** Row returned by GET /api/admin/cash-payment */
interface CashPaymentRecord {
  id: string
  householdId: string
  amount_cents: number
  payment_date: string
  notes: string | null
  created_at: string
  memberName: string
  planName: string
  endDate: string | null
  subStatus: string
  recordedBy: string
  /** Other cash payments on the same membership (0 = this is the only one). */
  otherPaymentsOnSub: number
}

export default function AdminDashboardClient({ role, guideFacts }: { role: string; guideFacts: GuideFacts }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [checkins, setCheckins] = useState<CheckinEntry[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  
  // Cash payment state
  const [plans, setPlans] = useState<Plan[]>([])
  const [cashForm, setCashForm] = useState({ profileId: '', planId: '', paymentDate: new Date().toISOString().split('T')[0], notes: '', amount: '' })
  const [cashSubmitting, setCashSubmitting] = useState(false)
  const [cashHistory, setCashHistory] = useState<CashPaymentRecord[]>([])
  const [cashMessage, setCashMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [showMemberDropdown, setShowMemberDropdown] = useState(false)
  const [membersTabSearch, setMembersTabSearch] = useState('')
  // Removing a cash payment (e.g. recorded twice by mistake)
  const [deletingCash, setDeletingCash] = useState<CashPaymentRecord | null>(null)
  const [cashDeleting, setCashDeleting] = useState(false)
  
  // Per-tab loading flags (true until first fetch completes)
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(true)
  const [cashLoading, setCashLoading] = useState(true)
  
  // Freezing UI State
  const [freezingMember, setFreezingMember] = useState<Member | null>(null)
  const [freezeDateTime, setFreezeDateTime] = useState<string>('')
  
  // Canceling UI State
  const [cancelingMember, setCancelingMember] = useState<Member | null>(null)
  
  // Unfreezing UI State
  const [unfreezingMember, setUnfreezingMember] = useState<Member | null>(null)

  const handleRoleChange = async (memberId: string, newRole: string) => {
    setUpdatingRole(memberId)
    try {
      const res = await fetch(`/api/admin/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to update role')
      } else {
        // Update local state immediately
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      }
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setUpdatingRole(null)
    }
  }

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      if (data.stats) setStats(data.stats)
      if (data.recentCheckins) setCheckins(data.recentCheckins)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [])

  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payments')
      const data = await res.json()
      if (data.payments) setPayments(data.payments)
    } catch (err) {
      console.error('Failed to fetch payments:', err)
    } finally {
      setPaymentsLoading(false)
    }
  }, [])

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/members')
      const data = await res.json()
      if (data.members) setMembers(data.members)
    } catch (err) {
      console.error('Failed to fetch members:', err)
    } finally {
      setMembersLoading(false)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      fetchStats(),
      activeTab === 'payments' ? fetchPayments() : Promise.resolve(),
      activeTab === 'members' ? fetchMembers() : Promise.resolve(),
    ])
    setLastRefresh(new Date())
    setLoading(false)
  }, [activeTab, fetchStats, fetchPayments, fetchMembers])

  // Initial load + auto-refresh every 15 seconds
  useEffect(() => {
    refreshAll()
    const interval = setInterval(refreshAll, 15000)
    return () => clearInterval(interval)
  }, [refreshAll])

  // Fetch tab-specific data when switching tabs
  useEffect(() => {
    if (activeTab === 'payments' && payments.length === 0) fetchPayments()
    if (activeTab === 'members' && members.length === 0) fetchMembers()
    if (activeTab === 'cash' && plans.length === 0) {
      fetch('/api/admin/members').then(r => r.json()).then(d => { if (d.members) setMembers(d.members) }).finally(() => setMembersLoading(false))
      fetch('/api/stripe/plans').then(r => r.json()).then(d => { if (d.plans) setPlans(d.plans) }).catch(() => {}).finally(() => setCashLoading(false))
      fetch('/api/admin/cash-payment').then(r => r.json()).then(d => { if (d.payments) setCashHistory(d.payments) }).catch(() => {})
    }
  }, [activeTab, payments.length, members.length, plans.length, fetchPayments, fetchMembers])

  const visibleTabs = tabsForRole(role)

  const refreshCashHistory = async () => {
    const histRes = await fetch('/api/admin/cash-payment')
    const histData = await histRes.json()
    if (histData.payments) setCashHistory(histData.payments)
  }

  const confirmDeleteCash = async () => {
    if (!deletingCash) return
    setCashDeleting(true)
    try {
      const res = await fetch(`/api/admin/cash-payment?id=${encodeURIComponent(deletingCash.id)}`, { method: 'DELETE' })
      const data = await res.json()
      setCashMessage(res.ok ? { type: 'success', text: data.message } : { type: 'error', text: data.error || 'Failed to remove payment' })
      if (res.ok) await refreshCashHistory()
    } catch (err) {
      setCashMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove payment' })
    } finally {
      setCashDeleting(false)
      setDeletingCash(null)
    }
  }

  // Same member + same day + same amount recorded more than once = likely a double entry
  const cashDupKey = (cp: CashPaymentRecord) => `${cp.householdId}|${cp.payment_date}|${cp.amount_cents}`
  const cashDupCounts: Record<string, number> = {}
  for (const cp of cashHistory) cashDupCounts[cashDupKey(cp)] = (cashDupCounts[cashDupKey(cp)] || 0) + 1

  // Opening a tab from the guide should land at the top of that tab
  const goToTab = (tab: Tab) => {
    setActiveTab(tab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black">Admin Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Role: <span className="text-zinc-300 font-medium capitalize">{role}</span>
            {' · '}
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="admin-open-guide"
            onClick={() => goToTab('guide')}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-sm font-medium hover:bg-red-500/20 hover:text-white transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Help
          </button>
          <button
            onClick={refreshAll}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-white text-black'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Loading Overlay */}
          {loading && !stats && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
              <p className="text-zinc-400 text-sm font-medium animate-pulse">Loading dashboard data...</p>
            </div>
          )}
          {/* Stats Cards */}
          {(!loading || stats) && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-6 rounded-2xl bg-zinc-950 border border-white/5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Total Members</p>
              <p className="text-4xl font-black">{stats?.totalMembers ?? '—'}</p>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-950 border border-white/5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Active Subscriptions</p>
              <p className="text-4xl font-black text-green-400">{stats?.activeSubscriptions ?? '—'}</p>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-950 border border-white/5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Today&apos;s Check-ins</p>
              <p className="text-4xl font-black text-blue-400">{stats?.todayCheckins ?? '—'}</p>
            </div>
          </div>

          {/* Recent Check-ins Table */}
          <div className="rounded-2xl bg-zinc-950 border border-white/5 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">Recent Check-ins</h3>
              <button
                id="overview-view-all-checkins"
                type="button"
                onClick={() => setActiveTab('checkins')}
                className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
              >
                View all →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold">Member</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden sm:table-cell">Method</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {checkins.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-zinc-600">No check-ins yet</td></tr>
                  ) : (
                    checkins.map(c => (
                      <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 sm:px-6 py-3 font-medium">
                          {c.profiles ? `${c.profiles.first_name} ${c.profiles.last_name}` : 'Unknown'}
                        </td>
                        <td className="px-4 sm:px-6 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${
                            c.status_flag === 'Success' 
                              ? 'bg-green-500/10 text-green-400' 
                              : 'bg-red-500/10 text-red-400'
                          }`}>
                            {c.status_flag}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-500 hidden sm:table-cell">{c.checkin_method}</td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-500 text-xs">
                          {new Date(c.scanned_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* CHECK-IN TAB */}
      {activeTab === 'checkin' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-zinc-950 px-4 py-3">
            <p className="text-xs text-zinc-500">Tip: use the full-screen kiosk on the front-desk computer. Nothing else on that page can take focus from the scanner.</p>
            <a
              id="admin-open-kiosk"
              href="/checkin"
              className="shrink-0 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
            >
              Open kiosk ↗
            </a>
          </div>
          <CheckinScanner />
        </div>
      )}

      {/* CHECK-INS LOG TAB */}
      {activeTab === 'checkins' && <CheckinsLogTab />}

      {/* USER'S GUIDE TAB */}
      {activeTab === 'guide' && (
        <UserGuideTab role={(role === 'admin' ? 'admin' : 'staff') as StaffRole} facts={guideFacts} onNavigate={goToTab} />
      )}

      {/* PAYMENTS TAB */}
      {activeTab === 'payments' && (
        <div className="rounded-2xl bg-zinc-950 border border-white/5 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-white/5">
            <h3 className="text-lg font-bold">Recent Payments (from Stripe)</h3>
            <p className="text-xs text-zinc-500 mt-1">Data pulled directly from Stripe API · Auto-refreshes every 15s</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold">Customer</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold">Amount</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden sm:table-cell">Date</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden md:table-cell">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {paymentsLoading ? (
                  <tr><td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                      <span className="text-sm text-zinc-500">Loading payments...</span>
                    </div>
                  </td></tr>
                ) : payments.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-600">No payments found</td></tr>
                ) : (
                  payments.map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 sm:px-6 py-3">
                        <p className="font-medium">{p.customerName}</p>
                        <p className="text-xs text-zinc-500">{p.customerEmail}</p>
                      </td>
                      <td className="px-4 sm:px-6 py-3 font-bold text-green-400">
                        ${(p.amount / 100).toFixed(2)}
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${
                          p.status === 'succeeded' 
                            ? 'bg-green-500/10 text-green-400' 
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-zinc-500 text-xs hidden sm:table-cell">
                        {new Date(p.created * 1000).toLocaleString()}
                      </td>
                      <td className="px-4 sm:px-6 py-3 hidden md:table-cell">
                        {p.receiptUrl && (
                          <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" 
                             className="text-xs text-blue-400 hover:text-blue-300 underline">
                            View
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MEMBERS TAB */}
      {activeTab === 'members' && (
        <div className="rounded-2xl bg-zinc-950 border border-white/5 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">All Members</h3>
              <p className="text-xs text-zinc-500 mt-1">{membersLoading ? 'Loading...' : `${members.length} total members`}</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name..."
                value={membersTabSearch}
                onChange={(e) => setMembersTabSearch(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold">Name</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold">Role</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden sm:table-cell">Plan</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold">Subscription</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden sm:table-cell">Waiver</th>
                  <th className="text-left px-4 sm:px-6 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {membersLoading ? (
                  <tr><td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                      <span className="text-sm text-zinc-500">Loading members...</span>
                    </div>
                  </td></tr>
                ) : members
                  .filter(m => m.name.toLowerCase().includes(membersTabSearch.toLowerCase()))
                  .map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 sm:px-6 py-3">
                      {m.stripeCustomerId ? (
                        <a 
                          href={`https://dashboard.stripe.com/customers/${m.stripeCustomerId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-blue-400 hover:text-blue-300 underline decoration-blue-400/30 hover:decoration-blue-300 transition-colors"
                        >
                          {m.name} ↗
                        </a>
                      ) : (
                        <p className="font-medium">{m.name}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-zinc-500 capitalize">{m.householdRole}</span>
                        {m.primaryName && (
                          <span className="text-xs text-zinc-600">· Dependent of <span className="text-zinc-400">{m.primaryName}</span></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      {role === 'admin' && m.hasAuth ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          disabled={updatingRole === m.id}
                          className={`px-2 py-1 rounded-lg text-xs font-bold capitalize border-0 outline-none cursor-pointer transition-colors disabled:opacity-50 ${
                            m.role === 'admin' ? 'bg-purple-500/10 text-purple-400'
                            : m.role === 'staff' ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-zinc-500/10 text-zinc-400'
                          }`}
                        >
                          <option value="member" className="bg-zinc-900 text-zinc-300">member</option>
                          <option value="staff" className="bg-zinc-900 text-blue-400">staff</option>
                          <option value="admin" className="bg-zinc-900 text-purple-400">admin</option>
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold capitalize ${
                          m.role === 'admin' ? 'bg-purple-500/10 text-purple-400'
                          : m.role === 'staff' ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-zinc-500/10 text-zinc-400'
                        }`}>
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-zinc-400 text-xs hidden sm:table-cell">{m.planName}</td>
                    <td className="px-4 sm:px-6 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${
                        m.subscriptionStatus === 'Active' ? 'bg-green-500/10 text-green-400'
                        : m.subscriptionStatus === 'Past_Due' ? 'bg-amber-500/10 text-amber-400'
                        : m.subscriptionStatus === 'Cancelled' ? 'bg-red-500/10 text-red-400'
                        : 'bg-zinc-500/10 text-zinc-500'
                      }`}>
                        {m.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 hidden sm:table-cell">
                      {m.hasWaiver 
                        ? <span className="text-green-400 text-xs font-bold">✓ Signed</span>
                        : <span className="text-red-400 text-xs font-bold">✗ Missing</span>
                      }
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      {/* Freeze/cancel are admin-only on the server, so only admins see the buttons */}
                      {role === 'admin' && m.householdRole === 'Primary' && m.subscriptionStatus !== 'None' && m.householdId && (
                        <div className="flex items-center gap-2">
                          {m.subscriptionStatus === 'Active' && (
                            <>
                              <button 
                                onClick={() => {
                                  setFreezingMember(m)
                                  setFreezeDateTime('')
                                }}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded"
                              >
                                Freeze
                              </button>
                              <button 
                                onClick={() => setCancelingMember(m)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {m.subscriptionStatus === 'Frozen' && (
                            <button 
                              onClick={() => setUnfreezingMember(m)}
                              className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded"
                            >
                              Unfreeze
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CASH PAYMENTS TAB */}
      {activeTab === 'cash' && (
        <div className="space-y-6">
          {cashLoading ? (
            <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                <span className="text-sm text-zinc-500">Loading cash payments...</span>
              </div>
            </div>
          ) : (
          <>
          {/* Record Payment Form */}
          <div className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6">
            <h3 className="text-lg font-bold mb-1">Record Cash Payment</h3>
            <p className="text-xs text-zinc-500 mb-6">Activate a membership for a member who paid in cash. The system auto-calculates the expiry date.</p>
            
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setCashSubmitting(true)
                setCashMessage(null)
                try {
                  const res = await fetch('/api/admin/cash-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cashForm),
                  })
                  const data = await res.json()
                  if (!res.ok) {
                    setCashMessage({ type: 'error', text: data.error })
                  } else {
                    setCashMessage({ type: 'success', text: data.message })
                    setCashForm(f => ({ ...f, profileId: '', planId: '', notes: '', amount: '' }))
                    setMemberSearch('')
                    // Refresh history
                    await refreshCashHistory()
                    // Refresh members to show updated status
                    fetchMembers()
                  }
                } catch (err: any) {
                  setCashMessage({ type: 'error', text: err.message })
                } finally {
                  setCashSubmitting(false)
                }
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {/* Member Search Combobox */}
              <div className="relative">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Member</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value)
                      setShowMemberDropdown(true)
                      if (!e.target.value) setCashForm(f => ({ ...f, profileId: '' }))
                    }}
                    onFocus={() => setShowMemberDropdown(true)}
                    onBlur={() => setTimeout(() => setShowMemberDropdown(false), 200)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                  />
                </div>
                {showMemberDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                    {members
                      .filter(m => m.householdRole === 'Primary')
                      .filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                      .map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setCashForm(f => ({ ...f, profileId: m.id }))
                            setMemberSearch(m.name)
                            setShowMemberDropdown(false)
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors flex justify-between items-center ${
                            cashForm.profileId === m.id ? 'bg-red-500/10 text-red-400' : 'text-zinc-300'
                          }`}
                        >
                          <span>{m.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            m.subscriptionStatus === 'Active' ? 'text-green-400 bg-green-500/10'
                            : m.subscriptionStatus === 'None' ? 'text-zinc-500 bg-zinc-500/10'
                            : 'text-amber-400 bg-amber-500/10'
                          }`}>{m.subscriptionStatus}</span>
                        </button>
                      ))}
                    {members.filter(m => m.householdRole === 'Primary').filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                      <p className="px-4 py-3 text-xs text-zinc-600">No members found</p>
                    )}
                  </div>
                )}
                {/* Hidden required input for form validation */}
                <input type="hidden" required value={cashForm.profileId} />
              </div>

              {/* Plan Select */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Plan</label>
                <select
                  required
                  value={cashForm.planId}
                  onChange={(e) => {
                    // Pre-fill the amount with the plan price; staff can change it
                    const p = plans.find(pl => pl.id === e.target.value)
                    setCashForm(f => ({ ...f, planId: e.target.value, amount: p ? (p.price_cents / 100).toFixed(2) : '' }))
                  }}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                >
                  <option value="" className="bg-zinc-900">Select plan...</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id} className="bg-zinc-900">
                      {p.name} — ${(p.price_cents / 100).toFixed(2)}/{p.billing_interval}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Paid */}
              <div>
                <label htmlFor="cash-amount" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Amount Paid ($)</label>
                <input
                  id="cash-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  required
                  value={cashForm.amount}
                  onChange={(e) => setCashForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="Pick a plan first"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none placeholder:text-zinc-600"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Filled in with the plan price. Change it if they paid a different amount.</p>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Payment Date</label>
                <input
                  type="date"
                  required
                  value={cashForm.paymentDate}
                  onChange={(e) => setCashForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <input
                  type="text"
                  value={cashForm.notes}
                  onChange={(e) => setCashForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Paid $50 cash"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none placeholder:text-zinc-600"
                />
              </div>

              {/* Submit */}
              <div className="sm:col-span-2 flex items-center gap-4">
                <button
                  type="submit"
                  disabled={cashSubmitting || !cashForm.profileId || !cashForm.planId || !(Number(cashForm.amount) > 0)}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cashSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                  {cashSubmitting ? 'Recording...' : 'Record Payment & Activate'}
                </button>
                {cashMessage && (
                  <p className={`text-sm font-medium ${
                    cashMessage.type === 'success' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {cashMessage.text}
                  </p>
                )}
              </div>
            </form>
          </div>

          {/* Cash Payment History */}
          <div className="rounded-2xl bg-zinc-950 border border-white/5 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/5">
              <h3 className="text-lg font-bold">Cash Payment History</h3>
              <p className="text-xs text-zinc-500 mt-1">All recorded cash payments · {cashHistory.length} records · Use <span className="text-zinc-300">Remove</span> to delete one entered by mistake</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold">Member</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold">Amount</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold">Plan</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden sm:table-cell">Paid On</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden sm:table-cell">Expires</th>
                    <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden md:table-cell">Notes</th>
                    <th className="text-right px-4 sm:px-6 py-3 font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {cashHistory.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-zinc-600">No cash payments recorded yet</td></tr>
                  ) : (
                    cashHistory.map(cp => (
                      <tr key={cp.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 sm:px-6 py-3 font-medium text-white">
                          {cp.memberName || 'Unknown'}
                          {cashDupCounts[cashDupKey(cp)] > 1 && (
                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-400 align-middle">
                              Possible duplicate
                            </span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-3 font-bold text-green-400">
                          ${(cp.amount_cents / 100).toFixed(2)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-400 text-xs">
                          {cp.planName || 'Unknown'}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-300 hidden sm:table-cell">
                          {new Date(cp.payment_date).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                        </td>
                        <td className="px-4 sm:px-6 py-3 hidden sm:table-cell">
                          {cp.endDate ? (
                            <span className={`text-xs font-bold ${
                              new Date(cp.endDate) < new Date() ? 'text-red-400' : 'text-green-400'
                            }`}>
                              {new Date(cp.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-500 text-xs hidden md:table-cell">
                          {cp.notes || '—'}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-right">
                          <button
                            id={`cash-remove-${cp.id}`}
                            type="button"
                            onClick={() => setDeletingCash(cp)}
                            title="Remove this payment"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-red-400 hover:text-white hover:bg-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Remove</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}
        </div>
      )}
      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        <ReportsTab />
      )}

      {/* Freeze Modal */}
      {freezingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button 
              onClick={() => setFreezingMember(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-white mb-2">Freeze Subscription</h3>
            <p className="text-sm text-zinc-400 mb-6">
              You are freezing the billing cycle for <span className="font-bold text-white">{freezingMember.name}</span>. Their QR code will instantly stop working.
            </p>

            <div className="space-y-6">
              {/* Option 1: Specific Date/Time */}
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  1. Automatic Resume (Date & Time)
                </label>
                <p className="text-xs text-zinc-500 mb-3">Stripe will automatically unfreeze and charge them at this exact moment.</p>
                <div className="flex flex-col gap-3">
                  <input 
                    type="datetime-local" 
                    min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16)}
                    value={freezeDateTime}
                    onChange={(e) => setFreezeDateTime(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <button 
                    disabled={!freezeDateTime}
                    onClick={async () => {
                      if (!freezeDateTime) return
                      await freezeSubscription(freezingMember.householdId!, freezeDateTime)
                      setFreezingMember(null)
                      fetchMembers()
                    }}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Freeze Until Selected Time
                  </button>
                </div>
              </div>

              {/* Option 2: Indefinitely */}
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  2. Manual Resume (Indefinitely)
                </label>
                <p className="text-xs text-zinc-500 mb-3">They will be frozen forever until you manually click Unfreeze on this dashboard.</p>
                <button 
                  onClick={async () => {
                    await freezeSubscription(freezingMember.householdId!, null)
                    setFreezingMember(null)
                    fetchMembers()
                  }}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors border border-white/5"
                >
                  Freeze Indefinitely
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Cancel Subscription?</h3>
            <p className="text-sm text-zinc-400 mb-8">
              Are you sure you want to permanently cancel the subscription for <span className="font-bold text-white">{cancelingMember.name}</span>? They will immediately lose gym access.
            </p>

            <div className="flex flex-col gap-3">
              <button 
                onClick={async () => {
                  await cancelSubscription(cancelingMember.householdId!)
                  setCancelingMember(null)
                  fetchMembers()
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Yes, Cancel it
              </button>
              <button 
                onClick={() => setCancelingMember(null)}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors border border-white/5"
              >
                Nevermind, keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unfreeze Modal */}
      {unfreezingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Unfreeze Account?</h3>
            <p className="text-sm text-zinc-400 mb-8">
              Are you sure you want to unfreeze the subscription for <span className="font-bold text-white">{unfreezingMember.name}</span>? Their billing will resume and they will regain gym access immediately.
            </p>

            <div className="flex flex-col gap-3">
              <button 
                onClick={async () => {
                  await unfreezeSubscription(unfreezingMember.householdId!)
                  setUnfreezingMember(null)
                  fetchMembers()
                }}
                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Yes, Unfreeze Now
              </button>
              <button 
                onClick={() => setUnfreezingMember(null)}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors border border-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Cash Payment Modal */}
      {deletingCash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Remove Cash Payment?</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Remove the <span className="font-bold text-white">${(deletingCash.amount_cents / 100).toFixed(2)}</span> payment for{' '}
              <span className="font-bold text-white">{deletingCash.memberName}</span> on{' '}
              <span className="font-bold text-white">{new Date(deletingCash.payment_date).toLocaleDateString(undefined, { timeZone: 'UTC' })}</span>?
              This can’t be undone.
            </p>
            {deletingCash.otherPaymentsOnSub === 0 ? (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-6 text-left">
                This is the only cash payment on this membership. Removing it will <span className="font-bold">not</span> turn the membership off. To end it, use <span className="font-bold">Cancel</span> on the Members tab.
              </p>
            ) : (
              <p className="text-xs text-zinc-500 mb-6">The membership stays active. Only this payment record is removed.</p>
            )}

            <div className="flex flex-col gap-3">
              <button
                id="cash-remove-confirm"
                onClick={confirmDeleteCash}
                disabled={cashDeleting}
                className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {cashDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {cashDeleting ? 'Removing...' : 'Yes, Remove Payment'}
              </button>
              <button
                onClick={() => setDeletingCash(null)}
                disabled={cashDeleting}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors border border-white/5"
              >
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
