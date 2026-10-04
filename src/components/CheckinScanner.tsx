'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ScanLine, Loader2, CheckCircle2, XCircle, AlertTriangle, Volume2, VolumeX,
  Search, UserRound, History, WifiOff, MousePointerClick,
} from 'lucide-react'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { extractProfileId, type CheckinMethod, type CheckinResult } from '@/utils/checkin-code'
import { feedbackSounds, unlockAudio, isAudioUnlocked } from '@/utils/feedback-sounds'
import { classify, type CheckinTone } from '@/utils/checkin-feedback'

/* ────────────────────────────────────────────────────────────
 * Config
 * ──────────────────────────────────────────────────────────── */
const AUTO_RESET_MS: Record<CheckinTone, number> = { success: 4000, warning: 9000, error: 9000 }
const SAME_CODE_COOLDOWN_MS = 3000 // scanners can read the same screen twice in a row
const RECENT_LIMIT = 8

type Tone = CheckinTone

interface ScanEntry {
  id: number
  at: Date
  result: CheckinResult
  tone: Tone
}

interface MemberOption {
  id: string
  name: string
  householdRole: string
  subscriptionStatus: string
}

const TONE_STYLES: Record<Tone, { panel: string; ring: string; icon: string; pill: string; bar: string; Icon: typeof CheckCircle2 }> = {
  success: {
    panel: 'bg-emerald-950/40 border-emerald-500/40',
    ring: 'bg-emerald-500/15 text-emerald-400 shadow-[0_0_60px_-10px_rgba(16,185,129,0.6)]',
    icon: 'text-emerald-400',
    pill: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    bar: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
  warning: {
    panel: 'bg-amber-950/40 border-amber-500/40',
    ring: 'bg-amber-500/15 text-amber-400 shadow-[0_0_60px_-10px_rgba(245,158,11,0.6)]',
    icon: 'text-amber-400',
    pill: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    bar: 'bg-amber-500',
    Icon: AlertTriangle,
  },
  error: {
    panel: 'bg-red-950/40 border-red-500/40',
    ring: 'bg-red-500/15 text-red-400 shadow-[0_0_60px_-10px_rgba(239,68,68,0.6)]',
    icon: 'text-red-400',
    pill: 'bg-red-500/10 text-red-300 border-red-500/30',
    bar: 'bg-red-500',
    Icon: XCircle,
  },
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--
  return age
}

/* ────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────── */
export default function CheckinScanner() {
  const [phase, setPhase] = useState<'idle' | 'processing' | 'result'>('idle')
  const [current, setCurrent] = useState<ScanEntry | null>(null)
  const [recent, setRecent] = useState<ScanEntry[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [audioReady, setAudioReady] = useState(false)
  const [windowFocused, setWindowFocused] = useState(true)
  const [online, setOnline] = useState(true)

  const inFlight = useRef(false)
  const soundOnRef = useRef(soundOn)
  const lastCode = useRef<{ id: string; at: number } | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const seq = useRef(0)

  useEffect(() => { soundOnRef.current = soundOn }, [soundOn])

  /* Window focus and connectivity. A keyboard-wedge scanner only types into the focused window. */
  useEffect(() => {
    const sync = () => setWindowFocused(document.hasFocus())
    const net = () => setOnline(navigator.onLine)
    sync(); net()
    window.addEventListener('focus', sync)
    window.addEventListener('blur', sync)
    window.addEventListener('online', net)
    window.addEventListener('offline', net)
    const poll = setInterval(sync, 1000)
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener('online', net)
      window.removeEventListener('offline', net)
      clearInterval(poll)
    }
  }, [])

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const activate = () => {
    unlockAudio()
    setAudioReady(isAudioUnlocked())
    window.focus()
  }

  const reset = useCallback(() => {
    clearTimeout(resetTimer.current)
    setPhase('idle')
    setCurrent(null)
  }, [])

  const showResult = useCallback((result: CheckinResult) => {
    const { tone } = classify(result)
    const entry: ScanEntry = { id: ++seq.current, at: new Date(), result, tone }
    setCurrent(entry)
    setPhase('result')
    if (result.member) setRecent(prev => [entry, ...prev].slice(0, RECENT_LIMIT))

    if (soundOnRef.current) {
      if (tone === 'success') feedbackSounds.success()
      else feedbackSounds.denied()
    }

    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(reset, AUTO_RESET_MS[tone])
  }, [reset])

  const checkIn = useCallback(async (raw: string, method: CheckinMethod) => {
    const profileId = extractProfileId(raw)
    const now = Date.now()

    if (!profileId) {
      const result: CheckinResult = { status: 'error', flag: 'Unreadable Code', message: "That isn't a La Familia member QR code." }
      showResult(result)
      return
    }
    if (inFlight.current) return
    if (lastCode.current && lastCode.current.id === profileId && now - lastCode.current.at < SAME_CODE_COOLDOWN_MS) return
    lastCode.current = { id: profileId, at: now }

    inFlight.current = true
    clearTimeout(resetTimer.current)
    setPhase('processing')

    let result: CheckinResult
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: profileId, method }),
      })
      result = await res.json()
    } catch {
      result = { status: 'error', flag: 'Connection Problem', message: 'Could not reach the server. Check the internet connection and scan again.' }
      lastCode.current = null // allow an immediate retry
    } finally {
      inFlight.current = false
    }
    showResult(result)
  }, [showResult])

  useBarcodeScanner({ onScan: code => checkIn(code, 'qr_scanner') })

  /* Esc dismisses the result */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase === 'result') reset() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, reset])

  const ready = windowFocused && online

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" onClick={() => { if (!audioReady) activate() }}>
      {/* ───────────── Stage ───────────── */}
      <section aria-label="Check-in status" className="space-y-4">
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusChip online={online} focused={windowFocused} onActivate={activate} />
          <div className="flex items-center gap-2">
            {!audioReady && soundOn && (
              <button
                id="checkin-enable-sound"
                onClick={(e) => { e.stopPropagation(); activate() }}
                className="text-xs text-zinc-400 hover:text-white underline underline-offset-4"
              >
                Click to enable sound
              </button>
            )}
            <button
              id="checkin-sound-toggle"
              onClick={(e) => { e.stopPropagation(); activate(); setSoundOn(s => !s) }}
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Mute scan sounds' : 'Unmute scan sounds'}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-colors"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div aria-live="assertive" aria-atomic="true">
          {phase === 'idle' && <IdlePanel ready={ready} onActivate={activate} />}
          {phase === 'processing' && <ProcessingPanel />}
          {phase === 'result' && current && <ResultPanel key={current.id} entry={current} onNext={reset} />}
        </div>
      </section>

      {/* ───────────── Sidebar ───────────── */}
      <aside className="space-y-6">
        <ManualCheckin onCheckin={(id, method) => checkIn(id, method)} disabled={phase === 'processing'} />
        <RecentScans entries={recent} />
      </aside>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────── */
function StatusChip({ online, focused, onActivate }: { online: boolean; focused: boolean; onActivate: () => void }) {
  if (!online) {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/10 text-red-300 border border-red-500/30">
        <WifiOff className="w-3.5 h-3.5" /> Offline. Check-ins paused.
      </span>
    )
  }
  if (!focused) {
    return (
      <button
        id="checkin-activate"
        onClick={(e) => { e.stopPropagation(); onActivate() }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse"
      >
        <MousePointerClick className="w-3.5 h-3.5" /> Click here to activate scanner
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Scanner ready
    </span>
  )
}

function IdlePanel({ ready, onActivate }: { ready: boolean; onActivate: () => void }) {
  return (
    <div
      id="checkin-idle-panel"
      onClick={onActivate}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 p-8 sm:p-14 text-center min-h-[360px] flex flex-col items-center justify-center cursor-default"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(220,38,38,0.12),transparent_60%)]" />
      <div className="relative mb-8">
        <div className={`absolute inset-0 rounded-full ${ready ? 'animate-ping bg-red-500/20' : ''}`} />
        <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <ScanLine className="w-14 h-14 sm:w-16 sm:h-16 text-red-400" />
        </div>
      </div>
      <h2 className="relative text-2xl sm:text-4xl font-black tracking-tight">
        {ready ? 'Ready to scan' : 'Scanner paused'}
      </h2>
      <p className="relative mt-3 max-w-md text-sm sm:text-base text-zinc-400">
        {ready
          ? 'Member holds their phone\u2019s QR code 4\u20138 inches from the scanner, with screen brightness up.'
          : 'Click anywhere on this page so the scanner can type into it.'}
      </p>
    </div>
  )
}

function ProcessingPanel() {
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950 p-8 sm:p-14 min-h-[360px] flex flex-col items-center justify-center text-center">
      <Loader2 className="w-14 h-14 text-red-400 animate-spin mb-6" />
      <p className="text-xl font-bold">Checking in…</p>
    </div>
  )
}

function ResultPanel({ entry, onNext }: { entry: ScanEntry; onNext: () => void }) {
  const { result, tone } = entry
  const s = TONE_STYLES[tone]
  const { staffAction } = classify(result)
  const age = ageFromDob(result.member?.date_of_birth)

  return (
    <div
      id="checkin-result-panel"
      data-status={result.status}
      className={`relative overflow-hidden rounded-3xl border-2 ${s.panel} p-8 sm:p-12 min-h-[360px] flex flex-col items-center justify-center text-center animate-[checkinPop_.25s_ease-out]`}
    >
      <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center mb-6 ${s.ring}`}>
        <s.Icon className="w-14 h-14 sm:w-20 sm:h-20" strokeWidth={2.2} />
      </div>

      {result.member && (
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
          {result.member.first_name} {result.member.last_name}
        </h2>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className={`px-3 py-1.5 rounded-xl border text-sm font-bold ${s.pill}`}>{result.flag}</span>
        {result.plan?.name && <span className="px-3 py-1.5 rounded-xl border border-white/10 text-sm text-zinc-300">{result.plan.name}</span>}
        {age != null && age < 18 && (
          <span className="px-3 py-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-sm font-bold text-purple-300">Minor · {age}</span>
        )}
      </div>

      <p className="mt-4 max-w-lg text-base sm:text-lg text-zinc-200">{result.message}</p>
      {staffAction && <p className="mt-2 max-w-lg text-sm text-zinc-400">{staffAction}</p>}

      <button
        id="checkin-next-member"
        onClick={onNext}
        className="mt-8 px-6 py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-zinc-200 active:scale-95 transition"
      >
        Next member <span className="ml-2 text-zinc-500 font-normal">Esc</span>
      </button>

      {/* Auto-reset countdown */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
        <div
          className={`h-full ${s.bar} origin-left`}
          style={{ animation: `checkinCountdown ${AUTO_RESET_MS[tone]}ms linear forwards` }}
        />
      </div>

      <style>{`
        @keyframes checkinCountdown { from { transform: scaleX(1) } to { transform: scaleX(0) } }
        @keyframes checkinPop { from { transform: scale(.97); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}

function ManualCheckin({ onCheckin, disabled }: { onCheckin: (id: string, method: CheckinMethod) => void; disabled: boolean }) {
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<MemberOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (members || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/members')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load members')
      setMembers(data.members || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [members, loading])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!members || q.length < 2 || extractProfileId(q)) return []
    return members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 6)
  }, [members, query])

  const submit = (id: string, method: CheckinMethod) => {
    onCheckin(id, method)
    setQuery('')
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-950 p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-200">
        <UserRound className="w-4 h-4 text-zinc-500" /> Forgot their phone?
      </h3>
      <p className="mt-1 text-xs text-zinc-500">Search by name to check them in manually.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          // A scan landing in this box arrives as a UUID + Enter. Treat it as a scan.
          const id = extractProfileId(query)
          if (id) submit(id, 'qr_scanner')
          else if (matches.length === 1) submit(matches[0].id, 'front_desk_manual')
        }}
        className="relative mt-4"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          id="checkin-manual-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={load}
          placeholder="Member name…"
          autoComplete="off"
          className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
        />
      </form>

      <div className="mt-2 space-y-1">
        {loading && <p className="flex items-center gap-2 px-1 py-2 text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /> Loading members…</p>}
        {error && <p className="px-1 py-2 text-xs text-red-400">{error}</p>}
        {matches.map(m => (
          <button
            key={m.id}
            id={`checkin-manual-${m.id}`}
            disabled={disabled}
            onClick={() => submit(m.id, 'front_desk_manual')}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-sm hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-zinc-200">{m.name}</span>
              <span className="block text-[11px] text-zinc-500">{m.householdRole}</span>
            </span>
            <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-lg ${
              m.subscriptionStatus === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-500'
            }`}>
              {m.subscriptionStatus}
            </span>
          </button>
        ))}
        {members && query.trim().length >= 2 && !extractProfileId(query) && matches.length === 0 && (
          <p className="px-1 py-2 text-xs text-zinc-600">No members match &ldquo;{query}&rdquo;.</p>
        )}
      </div>
    </div>
  )
}

function RecentScans({ entries }: { entries: ScanEntry[] }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-950 overflow-hidden">
      <h3 className="flex items-center gap-2 px-5 pt-5 pb-3 text-sm font-bold text-zinc-200">
        <History className="w-4 h-4 text-zinc-500" /> This session
      </h3>
      {entries.length === 0 ? (
        <p className="px-5 pb-5 text-xs text-zinc-600">Scans will appear here.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {entries.map(e => {
            const s = TONE_STYLES[e.tone]
            return (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <s.Icon className={`w-4 h-4 shrink-0 ${s.icon}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {e.result.member ? `${e.result.member.first_name} ${e.result.member.last_name}` : 'Unknown'}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">{e.result.flag}</p>
                </div>
                <time className="shrink-0 text-[11px] text-zinc-600 tabular-nums">
                  {e.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
