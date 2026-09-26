'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import { login, signup } from './actions'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const urlMode = searchParams.get('mode')
  
  const [isRegister, setIsRegister] = useState(urlMode === 'register')
  const [error, setError] = useState(urlError || '')
  
  const [showPassword, setShowPassword] = useState(false)
  const [passwordMismatch, setPasswordMismatch] = useState(false)

  // Redirect logged-in users to dashboard
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard')
    })
  }, [router])
  
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [modalMessage, setModalMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Clear errors when toggling
  useEffect(() => {
    setError('')
    setPasswordMismatch(false)
  }, [isRegister])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setPasswordMismatch(false)
    setIsLoading(true)
    
    const formData = new FormData(e.currentTarget)
    
    if (isRegister) {
      const p1 = formData.get('password')
      const p2 = formData.get('confirmPassword')
      if (p1 !== p2) {
        setPasswordMismatch(true)
        setError('Passwords do not match')
        setIsLoading(false)
        return
      }
      
      const res = await signup(formData)
      setIsLoading(false)
      
      if (res.error) {
        setModalMessage(res.error)
        setShowErrorModal(true)
      } else {
        setModalMessage('Your account was created successfully! Welcome to the club.')
        setShowSuccessModal(true)
      }
      
    } else {
      const res = await login(formData)
      setIsLoading(false)
      
      if (res.error) {
        setModalMessage(res.error)
        setShowErrorModal(true)
      } else {
        // If login is successful, you could show a modal, but standard UX is to just redirect immediately.
        // If you prefer a modal for login too, you can set it here. We'll just redirect to dashboard or home.
        router.push('/')
      }
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-red-500 selection:text-white font-sans relative">
      
      {/* SUCCESS MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Success!</h3>
            <p className="text-zinc-400 mb-8">{modalMessage}</p>
            <button 
              onClick={() => router.push('/')}
              className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors"
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {/* ERROR MODAL */}
      {showErrorModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-red-500/20 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Error</h3>
            <p className="text-zinc-400 mb-8">{modalMessage}</p>
            <button 
              onClick={() => setShowErrorModal(false)}
              className="w-full bg-zinc-800 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-orange-600 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <h2 className="text-center text-4xl font-black tracking-tighter text-white">
          <span className="text-red-600">TITLE</span> BOXING
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-400 font-medium">
          {isRegister ? 'Create your champion account' : 'Sign in to your account'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-zinc-950/50 backdrop-blur-xl py-8 px-4 border border-white/10 shadow-[0_0_40px_-15px_rgba(255,255,255,0.1)] sm:rounded-3xl sm:px-10">
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            
            {isRegister && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-zinc-300">
                    First Name
                  </label>
                  <div className="mt-2">
                    <input
                      id="firstName"
                      name="firstName"
                      type="text"
                      required={isRegister}
                      className="block w-full rounded-xl border-0 bg-black/50 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all"
                      placeholder="Rocky"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-zinc-300">
                    Last Name
                  </label>
                  <div className="mt-2">
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      required={isRegister}
                      className="block w-full rounded-xl border-0 bg-black/50 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all"
                      placeholder="Balboa"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
                Email address
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full rounded-xl border-0 bg-black/50 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all"
                  placeholder="champion@example.com"
                />
              </div>
            </div>

            {isRegister && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-zinc-300">
                    Phone Number
                  </label>
                  <div className="mt-2">
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      required={isRegister}
                      className="block w-full rounded-xl border-0 bg-black/50 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all"
                      placeholder="555-010-0101"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="dob" className="block text-sm font-medium text-zinc-300">
                    Date of Birth
                  </label>
                  <div className="mt-2">
                    <input
                      id="dob"
                      name="dob"
                      type="date"
                      required={isRegister}
                      className="block w-full rounded-xl border-0 bg-black/50 py-3 px-4 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                  Password
                </label>
                {!isRegister && (
                  <Link href="/forgot-password" className="text-xs font-medium text-red-500 hover:text-red-400 transition-colors">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="mt-2 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className={`block w-full rounded-xl border-0 bg-black/50 py-3 pl-4 pr-12 text-white shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all ${passwordMismatch ? 'ring-red-500/50 bg-red-950/20' : 'ring-white/10'}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {isRegister && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300">
                  Confirm Password
                </label>
                <div className="mt-2 relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required={isRegister}
                    className={`block w-full rounded-xl border-0 bg-black/50 py-3 pl-4 pr-12 text-white shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset focus:ring-red-500 sm:text-sm sm:leading-6 transition-all ${passwordMismatch ? 'ring-red-500/50 bg-red-950/20' : 'ring-white/10'}`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="text-red-500 text-sm font-medium text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4 pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center items-center rounded-xl bg-white px-3 py-3 text-sm font-bold text-black hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-sm font-medium">
                  <span className="bg-zinc-950 px-4 text-zinc-500">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', `/login${!isRegister ? '?mode=register' : ''}`)
                  setIsRegister(!isRegister)
                }}
                className="flex w-full justify-center rounded-xl bg-transparent px-3 py-3 text-sm font-bold text-white border border-white/20 hover:border-white/50 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-all active:scale-95"
              >
                {isRegister ? 'Sign In Instead' : 'Create an Account'}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  )
}
