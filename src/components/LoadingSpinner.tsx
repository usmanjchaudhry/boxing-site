'use client'

import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  fullPage?: boolean
}

export default function LoadingSpinner({ 
  label = 'Loading...', 
  size = 'md',
  fullPage = true 
}: LoadingSpinnerProps) {
  const sizes = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <Loader2 className={`${sizes[size]} text-red-500 animate-spin`} />
        <div className={`absolute inset-0 ${sizes[size]} rounded-full border-2 border-red-500/20`} />
      </div>
      {label && (
        <p className="text-zinc-400 text-sm font-medium animate-pulse">{label}</p>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        {spinner}
      </div>
    )
  }

  return spinner
}
