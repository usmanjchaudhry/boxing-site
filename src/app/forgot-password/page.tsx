'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, CheckCircle2, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-red-500 selection:text-white font-sans relative">
      
      {/* Background Glow */}
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
          Reset your password
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-zinc-950/50 backdrop-blur-xl py-8 px-4 border border-white/10 shadow-[0_0_40px_-15px_rgba(255,255,255,0.1)] rounded-2xl sm:rounded-3xl sm:px-10">
          
          {sent ? (
            /* Success State */
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Check Your Email</h3>
              <p className="text-zinc-400 text-sm mb-2">
                We&apos;ve sent a password reset link to:
              </p>
              <p className="text-white font-medium text-sm mb-6 bg-white/5 px-4 py-2 rounded-xl inline-block">
                {email}
              </p>
              <div className="space-y-3 text-left bg-zinc-900/50 rounded-xl p-4 border border-white/5">
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-300 font-semibold">1.</span> Open the email and click the reset link
                </p>
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-300 font-semibold">2.</span> You&apos;ll be redirected to set a new password
                </p>
                <p className="text-xs text-zinc-400">
                  <span className="text-zinc-300 font-semibold">3.</span> Didn&apos;t receive it? Check your spam folder
                </p>
              </div>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-6 text-sm text-zinc-500 hover:text-white transition-colors underline"
              >
                Try a different email
              </button>
            </div>
          ) : (
            /* Form State */
            <>
              <div className="mb-6">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4">
                  <Mail className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm text-zinc-400">
                  Enter the email address associated with your account and we&apos;ll send you a link to reset your password.
                </p>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-zinc-300">
                    Email address
                  </label>
                  <div className="mt-2">
                    <input
                      id="reset-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-xl border-0 bg-black/50 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all"
                      placeholder="champion@example.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-500 text-sm font-medium text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="flex w-full justify-center items-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-bold text-black hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
