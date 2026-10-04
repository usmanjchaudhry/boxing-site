'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Snowflake, AlertTriangle, Ticket } from 'lucide-react'
import type { DashboardSnapshot } from '@/utils/dashboard-snapshot'

const POLL_MS = 4000
/** Stop polling after this long without a change; resumes when the page is reopened. */
const IDLE_STOP_MS = 15 * 60 * 1000
const TOAST_MS = 6000

type Toast = { tone: 'success' | 'error' | 'info' | 'warning'; text: string; Icon: typeof CheckCircle2 }

const TOAST_STYLES: Record<Toast['tone'], string> = {
  success: 'bg-green-500/15 border-green-500/30 text-green-300 shadow-[0_0_30px_-8px_rgba(34,197,94,0.6)]',
  error: 'bg-red-500/15 border-red-500/30 text-red-300 shadow-[0_0_30px_-8px_rgba(239,68,68,0.6)]',
  info: 'bg-sky-500/15 border-sky-500/30 text-sky-300 shadow-[0_0_30px_-8px_rgba(14,165,233,0.6)]',
  warning: 'bg-amber-500/15 border-amber-500/30 text-amber-200 shadow-[0_0_30px_-8px_rgba(245,158,11,0.6)]',
}

/** What changed between two snapshots, as a message for the member (null = nothing to announce). */
function describeChange(prev: DashboardSnapshot, next: DashboardSnapshot): Toast | null {
  if (prev.membershipStatus !== next.membershipStatus) {
    switch (next.membershipStatus) {
      case 'Cancelled': return { tone: 'error', text: 'Your membership was cancelled.', Icon: XCircle }
      case 'Frozen': return { tone: 'info', text: 'Your membership is frozen.', Icon: Snowflake }
      case 'Past_Due': return { tone: 'warning', text: 'Your last payment failed. Update your card to keep access.', Icon: AlertTriangle }
      case 'Active': return { tone: 'success', text: 'Your membership is active.', Icon: CheckCircle2 }
    }
  }
  const used = prev.availablePassIds.filter(id => !next.availablePassIds.includes(id)).length
  if (used > 0) {
    return {
      tone: 'success',
      text: used === 1 ? 'Day pass used. Enjoy your workout!' : `${used} day passes used. Enjoy your workout!`,
      Icon: Ticket,
    }
  }
  return null
}

const keyOf = (s: DashboardSnapshot) => `${s.membershipStatus ?? '-'}|${[...s.availablePassIds].sort().join(',')}`

/**
 * Keeps the member dashboard in sync with things that happen elsewhere:
 * a pass scanned at the front desk, or a membership cancelled / frozen /
 * payment failing (Stripe or admin). While the page is visible it polls
 * /api/dashboard/status; on any change it refreshes the page and shows a message.
 * Display only: the scanner always checks the database itself.
 */
export default function DashboardLiveSync({ initial }: { initial: DashboardSnapshot }) {
  const router = useRouter()
  const [toast, setToast] = useState<Toast | null>(null)
  const knownRef = useRef<DashboardSnapshot>(initial)
  const initialKey = keyOf(initial)

  useEffect(() => {
    knownRef.current = initial
    // Nothing that can change from outside: no membership and no unused passes
    if (initial.membershipStatus === null && initial.availablePassIds.length === 0) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let inFlight = false
    let lastChange = Date.now()

    const check = async () => {
      if (inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try {
        const res = await fetch('/api/dashboard/status', { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as DashboardSnapshot
        if (keyOf(next) !== keyOf(knownRef.current)) {
          const message = describeChange(knownRef.current, next)
          knownRef.current = next
          lastChange = Date.now()
          if (message) setToast(message)
          router.refresh()
        }
      } catch {
        // Network hiccup: try again on the next tick
      } finally {
        inFlight = false
      }
    }

    // Always replaces the pending timer, so there is never more than one loop
    const schedule = () => {
      clearTimeout(timer)
      if (stopped) return
      if (Date.now() - lastChange > IDLE_STOP_MS) return // idle: wait for the page to be reopened
      timer = setTimeout(() => { check().finally(schedule) }, POLL_MS)
    }

    // Phone unlocked / tab reopened: check right away and restart the loop
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      lastChange = Date.now()
      clearTimeout(timer)
      check().finally(schedule)
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    schedule()

    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
    // initialKey captures snapshot changes; router is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 bottom-6 z-50 w-max max-w-[90vw] flex items-center gap-2 px-5 py-3 rounded-2xl border text-sm font-semibold backdrop-blur-md animate-toast-in ${TOAST_STYLES[toast.tone]}`}
    >
      <toast.Icon className="w-4 h-4 shrink-0" />
      {toast.text}
    </div>
  )
}
