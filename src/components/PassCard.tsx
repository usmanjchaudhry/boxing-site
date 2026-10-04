'use client'

import { useState } from 'react'
import { Loader2, ChevronDown } from 'lucide-react'
import type { PassRecipient } from '@/utils/household-members'

export default function PassCard({ pass, recipients = [] }: { pass: any; recipients?: PassRecipient[] }) {
  const [loading, setLoading] = useState(false)
  // Default to the buyer (recipients are ordered self-first)
  const [forProfileId, setForProfileId] = useState<string>(recipients[0]?.id ?? '')
  const price = (pass.price_cents / 100).toFixed(2)
  const showPicker = recipients.length > 1
  const selected = recipients.find(r => r.id === forProfileId)

  const handleBuy = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: pass.id, ...(forProfileId ? { forProfileId } : {}) }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Failed to create checkout session')
        setLoading(false)
      }
    } catch (err: any) {
      alert('Something went wrong: ' + err.message)
      setLoading(false)
    }
  }

  return (
    <div className="relative p-6 rounded-3xl border bg-zinc-950 border-white/10 flex flex-col justify-between hover:border-white/30 transition-all duration-300">
      <div>
        <h3 className="text-lg font-bold mb-1 text-white">{pass.name}</h3>
        <div className="flex items-end gap-1 mb-4">
          <span className="text-4xl font-black text-white">${price}</span>
          <span className="text-zinc-500 text-sm mb-1">/pass</span>
        </div>
        <p className="text-zinc-500 text-sm mb-6">Valid for one full day of gym access. Does not automatically renew.</p>

        {showPicker && (
          <div className="mb-5">
            <label htmlFor={`pass-for-${pass.id}`} className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Who is this pass for?
            </label>
            <div className="relative">
              {/* Native select: best picker on phones. text-base (16px) stops iOS zooming in. */}
              <select
                id={`pass-for-${pass.id}`}
                value={forProfileId}
                onChange={e => setForProfileId(e.target.value)}
                disabled={loading}
                className="w-full appearance-none rounded-xl bg-black border border-white/15 px-4 py-3 pr-10 text-base text-white focus:outline-none focus:border-white/40 focus:ring-2 focus:ring-white/10 transition-colors"
              >
                {recipients.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.isSelf ? `${r.name} (me)` : r.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            </div>
            {selected && !selected.isSelf && (
              <p className="mt-2 text-xs text-zinc-500">
                {selected.name} checks in with their own QR code and the pass is used.
              </p>
            )}
          </div>
        )}
      </div>
      <button
        id={`buy-pass-${pass.id}`}
        type="button"
        onClick={handleBuy}
        disabled={loading}
        className="w-full py-3 rounded-xl font-bold text-sm bg-white text-black hover:bg-zinc-200 transition-all active:scale-95"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Redirecting...
          </span>
        ) : selected && !selected.isSelf ? `Buy Pass for ${selected.name.split(' ')[0]}` : 'Buy Pass'}
      </button>
    </div>
  )
}
