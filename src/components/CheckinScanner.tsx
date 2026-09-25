'use client'

import { useState } from 'react'

interface CheckinResult {
  status: 'allowed' | 'denied' | 'error'
  member?: { first_name: string; last_name: string; date_of_birth: string }
  flag: string
  message: string
  plan?: { name: string }
}

export default function CheckinScanner() {
  const [profileId, setProfileId] = useState('')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCheckin = async (id?: string) => {
    const checkId = id || profileId.trim()
    if (!checkId) return

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch(`/api/checkin/${checkId}`)
      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      setResult({ status: 'error', flag: 'Error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const resetScanner = () => {
    setResult(null)
    setProfileId('')
  }

  // Result screen
  if (result) {
    const isAllowed = result.status === 'allowed'
    return (
      <div className="text-center">
        <div className={`w-full rounded-2xl sm:rounded-3xl p-6 sm:p-12 border-2 ${
          isAllowed 
            ? 'bg-green-950/30 border-green-500/30' 
            : 'bg-red-950/30 border-red-500/30'
        }`}>
          {/* Big Status Icon */}
          <div className={`w-20 h-20 sm:w-32 sm:h-32 rounded-full mx-auto mb-4 sm:mb-6 flex items-center justify-center text-4xl sm:text-7xl font-black ${
            isAllowed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {isAllowed ? '✓' : '✗'}
          </div>

          {/* Member Name */}
          {result.member && (
            <h2 className="text-xl sm:text-3xl font-black mb-2">
              {result.member.first_name} {result.member.last_name}
            </h2>
          )}

          {/* Status */}
          <div className={`inline-block px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold mb-3 sm:mb-4 ${
            isAllowed
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {result.flag}
          </div>

          {/* Plan */}
          {result.plan && (
            <p className="text-zinc-400 text-xs sm:text-sm mb-2">Plan: {result.plan.name}</p>
          )}

          {/* Message */}
          <p className={`text-sm sm:text-lg ${isAllowed ? 'text-green-300' : 'text-red-300'}`}>
            {result.message}
          </p>
        </div>

        <button
          onClick={resetScanner}
          className="mt-6 sm:mt-8 px-6 sm:px-8 py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-zinc-200 transition-colors active:scale-95"
        >
          Scan Next Member
        </button>
      </div>
    )
  }

  // Scanner/Input screen
  return (
    <div className="space-y-6">
      {/* Manual Entry */}
      <div className="bg-zinc-950 border border-white/5 rounded-2xl sm:rounded-3xl p-5 sm:p-8">
        <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 text-zinc-300">Enter Member ID</h3>
        <p className="text-xs sm:text-sm text-zinc-500 mb-4 sm:mb-6">
          Scan the QR code with a USB scanner (it types the ID automatically) or paste it manually.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); handleCheckin() }} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            placeholder="Profile UUID..."
            autoFocus
            className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 outline-none font-mono"
          />
          <button
            type="submit"
            disabled={loading || !profileId.trim()}
            className="px-6 py-3 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(220,38,38,0.5)]"
          >
            {loading ? 'Checking...' : 'Check In'}
          </button>
        </form>
      </div>

      {/* Quick tips */}
      <div className="text-center text-zinc-600 text-xs px-4">
        <p>USB barcode/QR scanners automatically type the member ID and press Enter.</p>
        <p>Just focus this page and scan — it works like a keyboard.</p>
      </div>
    </div>
  )
}
