'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Plan {
  id: string
  name: string
  description: string
  price_cents: number
  billing_interval: string
  max_dependents: number
  stripe_price_id: string | null
}

export default function PlanCard({ plan, isCurrentPlan }: { plan: Plan; isCurrentPlan: boolean }) {
  const [loading, setLoading] = useState(false)

  const isDouble = plan.name.toLowerCase().includes('double')
  const isLegacy = plan.name.toLowerCase().includes('legacy')
  const isHighlight = isDouble || isLegacy
  const price = (plan.price_cents / 100).toFixed(2)

  // Build features based on plan type
  const features: string[] = [
    'Full gym access',
    'All equipment included',
  ]

  if (plan.max_dependents > 0) {
    features.push(`${plan.max_dependents} household members`)
    features.push('Shared household check-in')
  } else {
    features.push('Individual access')
  }

  if (isLegacy) {
    features.push('Legacy transfer pricing')
    features.push('Priority access')
  }

  const handleSubscribe = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
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
    <div className={`relative p-6 rounded-3xl border flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] ${
      isHighlight
        ? 'bg-gradient-to-b from-red-950/30 to-zinc-950 border-red-500/30 shadow-[0_0_40px_-10px_rgba(220,38,38,0.3)]'
        : 'bg-zinc-950 border-white/5 hover:border-white/10'
    }`}>
      {/* Badge */}
      {isDouble && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-red-600 text-white text-xs font-black rounded-full uppercase tracking-wider shadow-lg">
          Best Value
        </div>
      )}
      {isLegacy && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-red-600 to-zinc-700 text-white text-xs font-black rounded-full uppercase tracking-wider shadow-lg">
          Classified
        </div>
      )}

      <div>
        {/* Plan Name */}
        <h3 className={`text-lg font-bold mb-1 ${isHighlight ? 'text-red-400' : 'text-zinc-300'}`}>
          {plan.name}
        </h3>

        {/* Price */}
        <div className="flex items-end gap-1 mb-4">
          <span className="text-4xl font-black text-white">${price}</span>
          <span className="text-zinc-500 text-sm mb-1">/{plan.billing_interval}</span>
        </div>

        {/* Description */}
        <p className="text-zinc-500 text-sm mb-6">{plan.description}</p>

        {/* Features */}
        <ul className="space-y-2 mb-8">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
              <span className={`text-xs ${isHighlight ? 'text-red-500' : 'text-green-500'}`}>✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <button
        onClick={handleSubscribe}
        disabled={isCurrentPlan || loading || !plan.stripe_price_id}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
          isCurrentPlan
            ? 'bg-green-500/10 text-green-500 border border-green-500/20 cursor-default'
            : !plan.stripe_price_id
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              : isHighlight
                ? 'bg-red-600 text-white hover:bg-red-700 shadow-[0_0_20px_-5px_rgba(220,38,38,0.5)]'
                : 'bg-white text-black hover:bg-zinc-200'
        }`}
      >
        {isCurrentPlan ? '✓ Current Plan' : loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Redirecting...
          </span>
        ) : !plan.stripe_price_id ? 'Coming Soon' : 'Subscribe'}
      </button>
    </div>
  )
}
