'use client'

import { useEffect, useState } from 'react'
import type { BillingSubscription } from '@/utils/stripe-duplicates'

const GYM_PHONE_DISPLAY = '(747) 265-9364'
const GYM_PHONE_TEL = '+17472659364'
const GYM_EMAIL = 'info@lafamiliashowtime.com'

function formatMoney(cents: number | null, interval: string | null) {
  if (cents == null) return ''
  const amount = `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
  return interval ? `${amount}/${interval === 'month' ? 'mo' : interval}` : amount
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

export default function DuplicateSubscriptionAlert({
  subscriptions,
  currentSubscriptionId,
  memberName,
}: {
  subscriptions: BillingSubscription[]
  currentSubscriptionId: string | null
  memberName: string
}) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const total = subscriptions.reduce((sum, s) => sum + (s.amountCents || 0), 0)
  const emailBody = [
    `Hi, I'm being charged for ${subscriptions.length} memberships and only need one.`,
    `Name: ${memberName}`,
    '',
    ...subscriptions.map(s => `- ${s.planName} ${formatMoney(s.amountCents, s.interval)} (started ${formatDate(s.startedAt)}) [${s.id}]`),
  ].join('\n')
  const mailto = `mailto:${GYM_EMAIL}?subject=${encodeURIComponent('Duplicate membership charge')}&body=${encodeURIComponent(emailBody)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        id="duplicate-subscription-alert"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dup-sub-title"
        aria-describedby="dup-sub-desc"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-zinc-950 border border-amber-500/30 shadow-[0_0_60px_-15px_rgba(245,158,11,0.45)] overflow-hidden"
      >
        <div className="p-6 sm:p-7">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h2 id="dup-sub-title" className="text-xl font-bold text-white mb-2">
            You&apos;re paying for {subscriptions.length} memberships
          </h2>
          <p id="dup-sub-desc" className="text-sm text-zinc-400 leading-relaxed mb-5">
            Your card is set up to be charged for more than one membership
            {total > 0 && <> (<span className="text-amber-400 font-semibold">{formatMoney(total, subscriptions[0]?.interval ?? null)}</span> total)</>}.
            You only need one. Contact us and we&apos;ll cancel the extra one and refund any duplicate charge.
          </p>

          <ul className="space-y-2 mb-6">
            {subscriptions.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black border border-white/5">
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">
                    {s.planName}
                    {s.id === currentSubscriptionId && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-green-400">Current</span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Started {formatDate(s.startedAt)}
                    {s.paused ? ' · Paused' : s.renewsAt ? ` · Next charge ${formatDate(s.renewsAt)}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-zinc-200 shrink-0">{formatMoney(s.amountCents, s.interval)}</span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-3">
            <a
              id="dup-sub-call"
              href={`tel:${GYM_PHONE_TEL}`}
              className="text-center text-sm font-bold py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors active:scale-95"
            >
              Call {GYM_PHONE_DISPLAY}
            </a>
            <a
              id="dup-sub-email"
              href={mailto}
              className="text-center text-sm font-bold py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/5 transition-colors active:scale-95"
            >
              Email us
            </a>
          </div>
          <button
            id="dup-sub-dismiss"
            type="button"
            onClick={() => setOpen(false)}
            className="w-full mt-3 text-xs text-zinc-500 hover:text-zinc-300 py-2 transition-colors"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  )
}
