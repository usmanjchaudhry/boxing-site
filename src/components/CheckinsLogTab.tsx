'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, CheckCircle2, XCircle, Ticket, BadgeCheck, Search, Loader2,
  RefreshCw, ScanLine, Keyboard, X, AlertTriangle,
} from 'lucide-react'
import type { CheckinLogResponse, CheckinLogRow, AccessFilter, ResultFilter } from '@/utils/checkin-log'

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'custom'
type View = 'all' | 'allowed' | 'denied' | 'membership' | 'day_pass'

const PAGE_SIZE = 50
const LIVE_REFRESH_MS = 15_000

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom' },
]

/** Each summary card is also a one-tap filter. */
const VIEW_FILTERS: Record<View, { result: ResultFilter; access: AccessFilter }> = {
  all: { result: 'all', access: 'all' },
  allowed: { result: 'allowed', access: 'all' },
  denied: { result: 'denied', access: 'all' },
  membership: { result: 'all', access: 'membership' },
  day_pass: { result: 'all', access: 'day_pass' },
}

// ── date helpers (pure, 'YYYY-MM-DD') ───────────────────────────────────────
const shift = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
const browserToday = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}
const fmtDay = (ymd: string, opts: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts })
}
function rangeFor(preset: Preset, today: string, custom: { from: string; to: string }) {
  switch (preset) {
    case 'today': return { from: today, to: today }
    case 'yesterday': return { from: shift(today, -1), to: shift(today, -1) }
    case '7d': return { from: shift(today, -6), to: today }
    case '30d': return { from: shift(today, -29), to: today }
    case 'custom': return custom
  }
}
function dayHeading(ymd: string, today: string) {
  if (ymd === today) return 'Today'
  if (ymd === shift(today, -1)) return 'Yesterday'
  return fmtDay(ymd, { weekday: 'long', month: 'short', day: 'numeric' })
}
function rangeLabel(from: string, to: string, today: string) {
  if (from === to) return `${dayHeading(from, today)} · ${fmtDay(from, { month: 'short', day: 'numeric', year: 'numeric' })}`
  return `${fmtDay(from, { month: 'short', day: 'numeric' })} – ${fmtDay(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const METHOD_LABEL: Record<string, { label: string; icon: typeof ScanLine }> = {
  qr_scanner: { label: 'QR scan', icon: ScanLine },
  kiosk: { label: 'Kiosk', icon: ScanLine },
  front_desk_manual: { label: 'Manual', icon: Keyboard },
}

// ── badges ──────────────────────────────────────────────────────────────────
function AccessBadge({ access }: { access: CheckinLogRow['access'] }) {
  if (access.kind === 'day_pass') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
        <Ticket className="w-3.5 h-3.5" /> {access.label}
      </span>
    )
  }
  if (access.kind === 'membership') {
    return (
      <span className="inline-flex flex-col">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold bg-sky-500/10 text-sky-300 border border-sky-500/20 w-fit">
          <BadgeCheck className="w-3.5 h-3.5" /> Membership
        </span>
        {access.detail && <span className="text-[11px] text-zinc-500 mt-1 pl-0.5">{access.detail}</span>}
      </span>
    )
  }
  return <span className="text-xs text-zinc-600">—</span>
}

function ResultBadge({ row }: { row: CheckinLogRow }) {
  return row.allowed ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-400">
      <CheckCircle2 className="w-4 h-4" /> Allowed
    </span>
  ) : (
    <span className="inline-flex flex-col">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400">
        <XCircle className="w-4 h-4" /> Denied
      </span>
      {row.reason && <span className="text-[11px] text-zinc-500 mt-0.5 pl-0.5">{row.reason}</span>}
    </span>
  )
}

function Initials({ name, allowed }: { name: string; allowed: boolean }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
  return (
    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-black border ${
      allowed ? 'bg-white/5 border-white/10 text-zinc-200' : 'bg-red-500/10 border-red-500/20 text-red-300'
    }`}>
      {initials}
    </span>
  )
}

// ── main ────────────────────────────────────────────────────────────────────
export default function CheckinsLogTab() {
  const [preset, setPreset] = useState<Preset>('today')
  const [custom, setCustom] = useState(() => ({ from: browserToday(), to: browserToday() }))
  const [view, setView] = useState<View>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const [data, setData] = useState<CheckinLogResponse | null>(null)
  const [rows, setRows] = useState<CheckinLogRow[]>([])
  // URL of the last first-page request that finished; loading = it doesn't match the current filters
  const [settledUrl, setSettledUrl] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestId = useRef(0)
  const rowsRef = useRef<CheckinLogRow[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])

  // The facility's "today" comes from the server; fall back to the browser until the first response
  const today = data?.range.today ?? browserToday()
  const { from, to } = rangeFor(preset, today, custom)
  const customInvalid = preset === 'custom' && (!custom.from || !custom.to || custom.from > custom.to)
  const isLive = to >= today
  const isFiltered = view !== 'all' || debouncedQuery.trim() !== '' || preset !== 'today'

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const buildUrl = useCallback((offset: number, limit: number) => {
    const { result, access } = VIEW_FILTERS[view]
    const p = new URLSearchParams({ from, to, result, access, offset: String(offset), limit: String(limit) })
    if (debouncedQuery.trim()) p.set('q', debouncedQuery.trim())
    return `/api/admin/checkins?${p}`
  }, [from, to, view, debouncedQuery])

  const firstPageUrl = customInvalid ? null : buildUrl(0, PAGE_SIZE)
  const loading = firstPageUrl !== null && settledUrl !== firstPageUrl

  /** mode: 'replace' (filters changed), 'refresh' (silent live update), 'more' (pagination) */
  const load = useCallback(async (mode: 'replace' | 'refresh' | 'more') => {
    if (customInvalid) return
    const id = ++requestId.current
    const current = rowsRef.current
    const offset = mode === 'more' ? current.length : 0
    const limit = mode === 'refresh' ? Math.min(200, Math.max(PAGE_SIZE, current.length)) : PAGE_SIZE
    const pageUrl = buildUrl(0, PAGE_SIZE)
    try {
      const res = await fetch(buildUrl(offset, limit), { cache: 'no-store' })
      const body = await res.json()
      if (id !== requestId.current) return // a newer request won
      if (!res.ok) throw new Error(body.error || 'Could not load check-ins.')
      const next = body as CheckinLogResponse
      setData(next)
      setRows(mode === 'more' ? [...current, ...next.rows] : next.rows)
      setError(null)
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Could not load check-ins.')
    } finally {
      if (id === requestId.current) {
        setSettledUrl(pageUrl); setRefreshing(false); setLoadingMore(false)
      }
    }
  }, [buildUrl, customInvalid])

  const refresh = () => { setRefreshing(true); load('refresh') }
  const loadMore = () => { setLoadingMore(true); load('more') }
  const retry = () => { setError(null); setSettledUrl(null); load('replace') }

  // Filters changed -> fresh first page (state updates happen after the fetch resolves)
  useEffect(() => { load('replace') }, [load])

  // Live updates while the range includes today and the tab is visible
  useEffect(() => {
    if (!isLive) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load('refresh')
    }, LIVE_REFRESH_MS)
    return () => clearInterval(t)
  }, [isLive, load])

  const groups = useMemo(() => {
    const out: { date: string; rows: CheckinLogRow[] }[] = []
    for (const r of rows) {
      const last = out[out.length - 1]
      if (last && last.date === r.localDate) last.rows.push(r)
      else out.push({ date: r.localDate, rows: [r] })
    }
    return out
  }, [rows])

  const s = data?.summary
  const cards: { id: View; label: string; value: number | undefined; tone: string; active: string }[] = [
    { id: 'all', label: 'All scans', value: s?.total, tone: 'text-white', active: 'border-white/40 bg-white/[0.06]' },
    { id: 'allowed', label: 'Allowed', value: s?.allowed, tone: 'text-green-400', active: 'border-green-500/50 bg-green-500/[0.07]' },
    { id: 'denied', label: 'Denied', value: s?.denied, tone: 'text-red-400', active: 'border-red-500/50 bg-red-500/[0.07]' },
    { id: 'membership', label: 'Membership', value: s?.membership, tone: 'text-sky-300', active: 'border-sky-500/50 bg-sky-500/[0.07]' },
    { id: 'day_pass', label: 'Day Pass', value: s?.dayPass, tone: 'text-amber-300', active: 'border-amber-500/50 bg-amber-500/[0.07]' },
  ]

  const resetFilters = () => { setPreset('today'); setView('all'); setQuery('') }

  return (
    <div className="space-y-5">
      {/* Header + date filters */}
      <section className="rounded-2xl bg-zinc-950 border border-white/5 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Check-ins</h2>
            <p className="text-sm text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <CalendarDays className="w-4 h-4" />
              {customInvalid ? 'Pick a valid date range' : rangeLabel(from, to, today)}
              {isLive && !customInvalid && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-400">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-green-400" />
                  </span>
                  Live
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isFiltered && (
              <button
                id="checkins-clear-filters"
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Clear filters
              </button>
            )}
            <button
              id="checkins-refresh"
              type="button"
              onClick={refresh}
              disabled={loading || refreshing || customInvalid}
              aria-label="Refresh check-ins"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Date presets */}
        <div role="group" aria-label="Date range" className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {PRESETS.map(p => (
            <button
              key={p.id}
              id={`checkins-preset-${p.id}`}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => {
                if (p.id === 'custom' && preset !== 'custom') setCustom({ from, to }) // start from the current range
                setPreset(p.id)
              }}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                preset === p.id ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {preset === 'custom' && (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                From
                <input
                  id="checkins-from"
                  type="date"
                  value={custom.from}
                  max={custom.to || today}
                  onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
                  className="rounded-xl bg-black border border-white/15 px-3 py-2 text-base sm:text-sm text-white [color-scheme:dark] focus:outline-none focus:border-white/40"
                />
              </label>
              <span className="pb-2.5 text-zinc-600">–</span>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                To
                <input
                  id="checkins-to"
                  type="date"
                  value={custom.to}
                  min={custom.from}
                  max={today}
                  onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
                  className="rounded-xl bg-black border border-white/15 px-3 py-2 text-base sm:text-sm text-white [color-scheme:dark] focus:outline-none focus:border-white/40"
                />
              </label>
            </div>
          )}
          <div className="relative flex-1 sm:max-w-xs sm:ml-auto self-end w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              id="checkins-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search member name"
              aria-label="Search member name"
              className="w-full rounded-xl bg-black border border-white/15 pl-9 pr-3 py-2 text-base sm:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
            />
          </div>
        </div>
        {customInvalid && (
          <p className="text-xs text-amber-400">The start date must be on or before the end date.</p>
        )}
      </section>

      {/* Summary cards = quick filters */}
      <section aria-label="Filter by result or access type" className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {cards.map((c, i) => (
          <button
            key={c.id}
            id={`checkins-filter-${c.id}`}
            type="button"
            aria-pressed={view === c.id}
            onClick={() => setView(view === c.id && c.id !== 'all' ? 'all' : c.id)}
            className={`text-left p-3.5 sm:p-4 rounded-2xl border transition-all ${i === 0 ? 'col-span-2 sm:col-span-1' : ''} ${
              view === c.id ? c.active : 'bg-zinc-950 border-white/5 hover:border-white/15'
            }`}
          >
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">{c.label}</p>
            <p className={`text-2xl sm:text-3xl font-black mt-1 tabular-nums ${c.tone}`}>
              {loading && !data ? <span className="inline-block w-8 h-7 rounded bg-white/5 animate-pulse" /> : (c.value ?? 0)}
            </p>
          </button>
        ))}
      </section>

      {/* Results */}
      <section className="rounded-2xl bg-zinc-950 border border-white/5 overflow-hidden">
        {/* Desktop column headers */}
        <div className="hidden sm:grid grid-cols-[96px_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_110px] gap-4 px-6 py-3 border-b border-white/5 text-[11px] uppercase tracking-wider font-semibold text-zinc-500">
          <span>Time</span><span>Member</span><span>Access used</span><span>Result</span><span>Method</span>
        </div>

        {error ? (
          <div className="px-6 py-14 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            <p className="text-sm text-zinc-300">{error}</p>
            <button type="button" onClick={retry} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10">
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="divide-y divide-white/5" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 sm:px-6 py-4 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-white/5 animate-pulse" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3 w-1/3 rounded bg-white/5 animate-pulse" />
                  <span className="block h-3 w-1/5 rounded bg-white/5 animate-pulse" />
                </span>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 flex flex-col items-center text-center gap-2">
            <ScanLine className="w-8 h-8 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-300">No check-ins found</p>
            <p className="text-xs text-zinc-500 max-w-xs">
              {isFiltered ? 'Try a different date range or clear the filters.' : 'Scans from the front desk will show up here as they happen.'}
            </p>
          </div>
        ) : (
          <>
            {groups.map(g => (
              <div key={g.date}>
                <div className="px-4 sm:px-6 py-2 bg-zinc-900/80 border-b border-white/5 text-xs font-bold text-zinc-300">
                  {dayHeading(g.date, today)}
                  {g.date !== today && g.date !== shift(today, -1) ? '' : (
                    <span className="font-normal text-zinc-500"> · {fmtDay(g.date, { month: 'short', day: 'numeric' })}</span>
                  )}
                </div>
                <ul className="divide-y divide-white/5">
                  {g.rows.map(r => {
                    const method = METHOD_LABEL[r.method] ?? { label: r.method, icon: ScanLine }
                    return (
                      <li key={r.id} className="hover:bg-white/[0.02] transition-colors">
                        {/* Desktop row */}
                        <div className="hidden sm:grid grid-cols-[96px_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_110px] gap-4 items-center px-6 py-3">
                          <span className="text-sm text-zinc-400 tabular-nums">{r.localTime}</span>
                          <span className="flex items-center gap-3 min-w-0">
                            <Initials name={r.member.name} allowed={r.allowed} />
                            <span className="font-semibold text-sm truncate">{r.member.name}</span>
                          </span>
                          <AccessBadge access={r.access} />
                          <ResultBadge row={r} />
                          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                            <method.icon className="w-3.5 h-3.5" /> {method.label}
                          </span>
                        </div>
                        {/* Mobile row */}
                        <div className="sm:hidden flex items-start gap-3 px-4 py-3.5">
                          <Initials name={r.member.name} allowed={r.allowed} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="font-semibold text-sm truncate">{r.member.name}</p>
                              <span className="text-xs text-zinc-500 tabular-nums shrink-0">{r.localTime}</span>
                            </div>
                            <div className="mt-1.5 flex items-start justify-between gap-2">
                              <AccessBadge access={r.access} />
                              <ResultBadge row={r} />
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}

            <div className="px-4 sm:px-6 py-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                Showing {rows.length} of {data?.total ?? rows.length}
              </p>
              {data?.hasMore && (
                <button
                  id="checkins-load-more"
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Load more
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
