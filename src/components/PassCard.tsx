'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function PassCard({ pass }: { pass: any }) {
  const [loading, setLoading] = useState(false)
  const price = (pass.price_cents / 100).toFixed(2)

  const handleBuy = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: pass.id }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Failed to create checkout session')
      }
    } catch (err: any) {
      alert('Something went wrong: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 rounded-3xl border bg-zinc-950 border-white/10 flex flex-col justify-between hover:border-white/30 transition-all duration-300">
      <div>
        <h3 className="text-lg font-bold mb-1 text-white">{pass.name}</h3>
        <div className="flex items-end gap-1 mb-4">
          <span className="text-4xl font-black text-white">${price}</span>
          <span className="text-zinc-500 text-sm mb-1">/pass</span>
        </div>
        <p className="text-zinc-500 text-sm mb-6">Valid for one full day of gym access. Does not automatically renew.</p>
      </div>
      <button
        onClick={handleBuy}
        disabled={loading}
        className="w-full py-3 rounded-xl font-bold text-sm bg-white text-black hover:bg-zinc-200 transition-all active:scale-95"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Redirecting...
          </span>
        ) : 'Buy Pass'}
      </button>
    </div>
  )
}
