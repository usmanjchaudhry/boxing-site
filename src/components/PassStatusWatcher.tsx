'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

const POLL_MS = 4000
/** Stop polling after this long without a change; resumes when the page is reopened. */
const IDLE_STOP_MS = 15 * 60 * 1000

/**
 * Keeps the dashboard's tickets in sync with the front desk.
 * While the household has unused passes and the page is visible, it checks
 * /api/passes/status every few seconds. When a pass is used at the scanner it
 * refreshes the dashboard (the ticket moves to history) and shows a confirmation.
 */
export default function PassStatusWatcher({ availableIds }: { availableIds: string[] }) {
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(null)
  const knownRef = useRef<string[]>(availableIds)
  const idKey = availableIds.slice().sort().join(',')

  useEffect(() => {
    knownRef.current = availableIds
    if (availableIds.length === 0) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let inFlight = false
    let lastChange = Date.now()

    const check = async () => {
      if (inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try {
        const res = await fetch('/api/passes/status', { cache: 'no-store' })
        if (!res.ok) return
        const { available } = (await res.json()) as { available: string[] }
        const used = knownRef.current.filter(id => !available.includes(id))
        if (used.length > 0) {
          lastChange = Date.now()
          knownRef.current = available
          setToast(used.length === 1 ? 'Day pass used. Enjoy your workout!' : `${used.length} day passes used. Enjoy your workout!`)
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
    // idKey captures availableIds changes; router is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 w-max max-w-[90vw] flex items-center gap-2 px-5 py-3 rounded-2xl bg-green-500/15 border border-green-500/30 text-green-300 text-sm font-semibold backdrop-blur-md shadow-[0_0_30px_-8px_rgba(34,197,94,0.6)] animate-toast-in"
    >
      <CheckCircle2 className="w-4 h-4" />
      {toast}
    </div>
  )
}
