'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Lock, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const getStrength = (pw: string) => {
    let score = 0
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    return score
  }

  const strength = getStrength(password)
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const strengthColor = ['', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-green-500'][strength]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-black flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-red-500 selection:text-white font-sans relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[300px] sm:h-[400px] opacity-15 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 blur-[100px] rounded-full mix-blend-screen" />
        </div>
        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
          <div className="bg-zinc-950/50 backdrop-blur-xl py-10 px-6 border border-white/10 shadow-[0_0_40px_-15px_rgba(255,255,255,0.1)] rounded-2xl sm:rounded-3xl sm:px-10 text-center">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-white mb-3">Password Updated!</h2>
            <p className="text-zinc-400 text-sm mb-8">
              Your password has been changed successfully.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors active:scale-95"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-red-500 selection:text-white font-sans relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[300px] sm:h-[400px] opacity-15 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-orange-600 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Link href="/login" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </Link>
        <h2 className="text-center text-3xl sm:text-4xl font-black tracking-tighter text-white">
          <span className="text-red-600">TITLE</span> BOXING
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-400 font-medium">
          Create your new password
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-zinc-950/50 backdrop-blur-xl py-8 px-4 border border-white/10 shadow-[0_0_40px_-15px_rgba(255,255,255,0.1)] rounded-2xl sm:rounded-3xl sm:px-10">
          
          <div className="mb-6">
            <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-sm text-zinc-400">
              Choose a strong password with at least 8 characters, including uppercase letters, numbers, and symbols.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-zinc-300">
                New Password
              </label>
              <div className="mt-2 relative">
                <input
                  id="new-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-black/50 py-3 pl-4 pr-12 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {password.length > 0 && (
                <div className="mt-3">
                  <div className="flex gap-1 mb-1.5">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength ? strengthColor : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${
                    strength <= 1 ? 'text-red-400' 
                    : strength === 2 ? 'text-amber-400' 
                    : strength === 3 ? 'text-blue-400' 
                    : 'text-green-400'
                  }`}>
                    {strengthLabel}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-sm font-medium text-zinc-300">
                Confirm New Password
              </label>
              <div className="mt-2 relative">
                <input
                  id="confirm-new-password"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`block w-full rounded-xl border-0 bg-black/50 py-3 pl-4 pr-12 text-white shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all ${
                    confirmPassword && confirmPassword !== password 
                      ? 'ring-red-500/50 bg-red-950/20' 
                      : 'ring-white/10'
                  }`}
                  placeholder="••••••••"
                />
                {confirmPassword && confirmPassword === password && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                )}
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-xs text-red-400 mt-1.5 font-medium">Passwords don&apos;t match</p>
              )}
            </div>

            {error && (
              <div className="text-red-500 text-sm font-medium text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword || password !== confirmPassword}
              className="flex w-full justify-center items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-bold text-black hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Set New Password'
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
