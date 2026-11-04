'use client'

import { useState } from 'react'
import { Archive, Loader2 } from 'lucide-react'
import type { NextPayment } from '@/utils/next-payment'

export interface ArchiveTarget {
  id: string
  name: string
  householdRole: string
  subscriptionStatus: string
  planName: string
  primaryName: string | null
  nextPayment?: NextPayment
}

/**
 * Confirm archiving a member. Archiving a household's primary member archives
 * everyone on the household, so they're listed here before anything happens.
 */
export default function ArchiveMemberDialog({
  member,
  household,
  onClose,
  onArchived,
}: {
  member: ArchiveTarget
  /** Other people on the member's household (only used when the member is the primary). */
  household: { id: string; name: string }[]
  onClose: () => void
  onArchived: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPrimary = member.householdRole === 'Primary'
  const others = isPrimary ? household.filter(h => h.id !== member.id) : []
  const next = member.nextPayment
  const cardBilling = isPrimary && (next?.kind === 'renews' || next?.kind === 'frozen' || (next?.kind === 'overdue' && next.reason === 'card_failed'))
  const cashLeft = isPrimary && next?.kind === 'due'

  const archive = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/members/${member.id}/archive`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not archive this member')
      const names: string[] = data.archived ?? [member.name]
      const parts = [`Archived ${names.join(', ')}.`]
      if (data.stripeCancelled) parts.push('Their card membership was cancelled in Stripe.')
      if (data.warnings?.length) parts.push(...data.warnings)
      onArchived(parts.join(' '))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive this member')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="archive-title">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4">
          <Archive className="w-6 h-6" />
        </div>
        <h3 id="archive-title" className="text-xl font-black text-white text-center mb-2">
          Archive {member.name}{others.length ? ' and their household' : ''}?
        </h3>

        {others.length > 0 && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs font-semibold text-zinc-400 mb-1.5">Everyone on this household will be archived:</p>
            <ul className="text-sm text-white space-y-0.5">
              <li>{member.name} <span className="text-zinc-500 text-xs">(account holder)</span></li>
              {others.map(o => <li key={o.id}>{o.name}</li>)}
            </ul>
          </div>
        )}

        <ul className="text-sm text-zinc-400 space-y-1.5 mb-5 list-disc pl-5">
          <li>Hidden from member lists, search and the scanner, and they won&apos;t get gym emails.</li>
          <li>They can&apos;t log in or check in.</li>
          {cardBilling && <li className="text-amber-300">Any card membership ({member.planName}) is cancelled in Stripe right away. No refund is issued.</li>}
          {cashLeft && <li>Their cash membership is left as-is, so any paid time is still there if you restore them.</li>}
          {!isPrimary && member.primaryName && <li>{member.primaryName}&apos;s membership isn&apos;t changed.</li>}
          <li>Waivers, check-ins and payments are kept. You can restore them from the Archived list.</li>
        </ul>

        {error && <p className="mb-4 text-sm text-red-400 text-center">{error}</p>}

        <div className="flex flex-col gap-3">
          <button
            id="archive-confirm"
            onClick={archive}
            disabled={busy}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Archiving...' : others.length ? `Archive ${others.length + 1} people` : 'Yes, archive'}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors border border-white/5"
          >
            Keep them
          </button>
        </div>
      </div>
    </div>
  )
}
