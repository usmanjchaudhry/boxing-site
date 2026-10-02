'use client'

import { useState } from 'react'
import { Loader2, X, Lock } from 'lucide-react'
import { checkLegacyPassword } from '@/app/memberships/actions'

export default function LegacyModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await checkLegacyPassword(password)
      
      if (res.error) {
        setError(res.error)
        setLoading(false)
        return
      }

      if (res.success) {
        // Success! Redirect to the secret page
        window.location.href = '/memberships/classified'
      }
    } catch (err: any) {
      setError('Something went wrong: ' + err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="text-zinc-700 hover:text-red-600 text-xs transition-colors font-mono tracking-widest uppercase"
      >
        [ Classified Portal ]
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-center mb-4 text-red-500">
              <Lock className="w-8 h-8" />
            </div>

            <h3 className="mb-2 text-2xl font-black text-center text-white">Legacy Transfer</h3>
            <p className="mb-6 text-sm text-center text-zinc-400">
              Enter the transfer code provided by your previous gym to unlock the Legacy Unlimited tier.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  placeholder="Enter access code..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 text-center text-white bg-black border border-zinc-700 rounded-xl focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm font-medium text-center text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 font-bold text-white transition-colors bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Unlock Plan'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
