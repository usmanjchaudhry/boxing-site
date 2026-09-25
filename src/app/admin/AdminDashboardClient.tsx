'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, CreditCard, ScanLine, ShieldCheck, RefreshCw, Banknote, Loader2, Search } from 'lucide-react'
import CheckinScanner from '@/components/CheckinScanner'

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

type Tab = 'overview' | 'checkin' | 'payments' | 'members' | 'cash'

interface Plan {
  id: string
  name: string
  price_cents: number
  billing_interval: string
}

export default function AdminDashboardClient({ role }: { role: string }) {
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
  const [cashForm, setCashForm] = useState({ profileId: '', planId: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' })
  const [cashSubmitting, setCashSubmitting] = useState(false)
  const [cashHistory, setCashHistory] = useState<any[]>([])
  const [cashMessage, setCashMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [showMemberDropdown, setShowMemberDropdown] = useState(false)

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
    }
  }, [])

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/members')
      const data = await res.json()
      if (data.members) setMembers(data.members)
    } catch (err) {
      console.error('Failed to fetch members:', err)
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
      fetch('/api/admin/members').then(r => r.json()).then(d => { if (d.members) setMembers(d.members) })
      fetch('/api/stripe/plans').then(r => r.json()).then(d => { if (d.plans) setPlans(d.plans) }).catch(() => {})
      fetch('/api/admin/cash-payment').then(r => r.json()).then(d => { if (d.payments) setCashHistory(d.payments) }).catch(() => {})
    }
  }, [activeTab, payments.length, members.length, plans.length, fetchPayments, fetchMembers])

  const tabs: { id: Tab; label: string; icon: any; adminOnly?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: ShieldCheck },
    { id: 'checkin', label: 'Check-in Scanner', icon: ScanLine },
    { id: 'cash', label: 'Cash Payments', icon: Banknote, adminOnly: true },
    { id: 'payments', label: 'Stripe Payments', icon: CreditCard, adminOnly: true },
    { id: 'members', label: 'Members', icon: Users },
  ]

  const visibleTabs = tabs.filter(t => !t.adminOnly || role === 'admin')

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
        <button
          onClick={refreshAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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
          {/* Stats Cards */}
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
            <div className="p-4 sm:p-6 border-b border-white/5">
              <h3 className="text-lg font-bold">Recent Check-ins</h3>
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
        </div>
      )}

      {/* CHECK-IN TAB */}
      {activeTab === 'checkin' && (
        <CheckinScanner />
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
                {payments.length === 0 ? (
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
          <div className="p-4 sm:p-6 border-b border-white/5">
            <h3 className="text-lg font-bold">All Members</h3>
            <p className="text-xs text-zinc-500 mt-1">{members.length} members found</p>
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
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 sm:px-6 py-3">
                      {m.stripeCustomerId ? (
                        <a 
                          href={`https://dashboard.stripe.com/acct_1UJKVcLhPZ2Xh0zp/customers/${m.stripeCustomerId}`}
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
                    setCashForm(f => ({ ...f, profileId: '', planId: '', notes: '' }))
                    setMemberSearch('')
                    // Refresh history
                    const histRes = await fetch('/api/admin/cash-payment')
                    const histData = await histRes.json()
                    if (histData.payments) setCashHistory(histData.payments)
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
                  onChange={(e) => setCashForm(f => ({ ...f, planId: e.target.value }))}
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
                  disabled={cashSubmitting || !cashForm.profileId || !cashForm.planId}
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
              <p className="text-xs text-zinc-500 mt-1">All recorded cash payments · {cashHistory.length} records</p>
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
                  </tr>
                </thead>
                <tbody>
                  {cashHistory.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-600">No cash payments recorded yet</td></tr>
                  ) : (
                    cashHistory.map((cp: any) => (
                      <tr key={cp.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 sm:px-6 py-3 font-medium text-white">
                          {cp.memberName || 'Unknown'}
                        </td>
                        <td className="px-4 sm:px-6 py-3 font-bold text-green-400">
                          ${(cp.amount_cents / 100).toFixed(2)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-400 text-xs">
                          {cp.planName || 'Unknown'}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-300 hidden sm:table-cell">
                          {new Date(cp.payment_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 sm:px-6 py-3 hidden sm:table-cell">
                          {cp.endDate ? (
                            <span className={`text-xs font-bold ${
                              new Date(cp.endDate) < new Date() ? 'text-red-400' : 'text-green-400'
                            }`}>
                              {new Date(cp.endDate).toLocaleDateString()}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-zinc-500 text-xs hidden md:table-cell">
                          {cp.notes || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
