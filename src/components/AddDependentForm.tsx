'use client'

import { useState } from 'react'
import { addDependent } from '@/app/dashboard/actions'

export default function AddDependentForm() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setLoading(true)
    setMessage('')
    
    try {
      await addDependent(formData)
      setIsSuccess(true)
      setMessage('Successfully added to your household!')
      // Reset form
      const form = document.getElementById('add-dependent-form') as HTMLFormElement
      if (form) form.reset()
    } catch (e: any) {
      setIsSuccess(false)
      setMessage(e.message || 'Failed to add family member.')
    } finally {
      setLoading(false)
      setTimeout(() => setMessage(''), 4000) // Clear message after 4s
    }
  }

  return (
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
        className="w-full bg-white text-black font-bold text-sm py-3 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Adding...' : 'Add to Household'}
      </button>
    </form>
  )
}
