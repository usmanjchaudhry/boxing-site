'use client'

import { useState, useRef } from 'react'
import { addDependent } from '@/app/dashboard/actions'

export default function AddDependentForm() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const isSubmitting = useRef(false)

  const handleSubmit = async (formData: FormData) => {
    if (isSubmitting.current) return
    isSubmitting.current = true
    
    setLoading(true)
    setMessage('')
    
    try {
      await addDependent(formData)
      setIsSuccess(true)
      setMessage('Successfully added to your household!')
      const form = document.getElementById('add-dependent-form') as HTMLFormElement
      if (form) form.reset()
    } catch (e: any) {
      setIsSuccess(false)
      setMessage(e.message || 'Failed to add family member.')
    } finally {
      setLoading(false)
      isSubmitting.current = false
      setTimeout(() => setMessage(''), 4000)
    }
  }

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 bg-zinc-900 border border-white/10 p-8 rounded-3xl shadow-2xl">
            <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-white font-bold text-lg">Adding to Household...</p>
            <p className="text-zinc-400 text-sm">Please wait while we prepare the waiver.</p>
          </div>
        </div>
      )}
      
      <form id="add-dependent-form" action={handleSubmit} className="space-y-4 relative">
        {message && (
          <div className={`absolute -top-14 left-0 right-0 p-3 text-center text-sm rounded-xl font-bold backdrop-blur-md shadow-2xl border ${
            isSuccess 
              ? 'bg-green-500/20 text-green-400 border-green-500/30' 
              : 'bg-red-500/20 text-red-400 border-red-500/30'
          }`}>
            {message}
          </div>
        )}
        
        <input
          name="firstName"
          type="text"
          required
          placeholder="First Name"
          className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 outline-none"
        />
        <input
          name="lastName"
          type="text"
          required
          placeholder="Last Name"
          className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 outline-none"
        />
        <input
          name="dob"
          type="date"
          required
          className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500 outline-none"
        />
        <button 
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold text-sm py-3 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && (
            <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {loading ? 'Adding...' : 'Add to Household'}
        </button>
      </form>
    </>
  )
}
