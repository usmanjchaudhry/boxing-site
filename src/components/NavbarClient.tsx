'use client'

import { useState } from 'react'
import Link from 'next/link'
import { User, LogOut, Menu, X, ShieldCheck, Calendar } from 'lucide-react'

export default function NavbarClient({ profile, isLoggedIn, isAdmin }: { 
  profile: { first_name: string; last_name: string } | null
  isLoggedIn: boolean
  isAdmin?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="border-b border-white/5 bg-black/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-xl sm:text-2xl font-bold tracking-tighter flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-red-600">TITLE</span> BOXING
        </Link>
        
        {/* Desktop Nav */}
        <div className="hidden sm:flex items-center gap-4 lg:gap-6">
          {isLoggedIn ? (
            <>
              <div className="text-sm font-medium text-zinc-300 flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                <User className="w-4 h-4 text-red-500" />
                {profile?.first_name && profile?.last_name 
                  ? `${profile.first_name} ${profile.last_name}`
                  : 'Champion'}
              </div>
              {isAdmin && (
                <Link 
                  href="/admin" 
                  className="flex items-center gap-1.5 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors bg-purple-500/10 px-4 py-2 rounded-full border border-purple-500/20"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin
                </Link>
              )}
              <Link 
                href="/schedule" 
                className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Schedule
              </Link>
              <Link 
                href="/dashboard" 
                className="bg-white text-black px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-all active:scale-95"
              >
                Dashboard
              </Link>
              <form action="/auth/signout" method="post">
                <button className="text-zinc-400 hover:text-white p-2 transition-colors bg-white/5 hover:bg-white/10 rounded-full" title="Sign Out">
                  <LogOut className="w-5 h-5" />
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/schedule" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Schedule
              </Link>
              <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Sign In
              </Link>
              <Link 
                href="/login" 
                className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-all active:scale-95"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden text-zinc-400 hover:text-white p-2 transition-colors"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-white/5 bg-black/95 backdrop-blur-xl px-4 py-4 space-y-3">
          {isLoggedIn ? (
            <>
              <div className="text-sm font-medium text-zinc-300 flex items-center gap-2 bg-white/5 px-4 py-3 rounded-xl border border-white/10">
                <User className="w-4 h-4 text-red-500" />
                {profile?.first_name && profile?.last_name 
                  ? `${profile.first_name} ${profile.last_name}`
                  : 'Champion'}
              </div>
              <Link 
                href="/dashboard" 
                onClick={() => setMenuOpen(false)}
                className="block text-center bg-white text-black px-5 py-3 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition-all active:scale-95"
              >
                Dashboard
              </Link>
              {isAdmin && (
                <Link 
                  href="/admin" 
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 bg-purple-500/10 text-purple-400 px-5 py-3 rounded-xl text-sm font-semibold border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin Dashboard
                </Link>
              )}
              <Link 
                href="/schedule" 
                onClick={() => setMenuOpen(false)}
                className="block text-center bg-white/5 text-white px-5 py-3 rounded-xl text-sm font-semibold border border-white/10 hover:bg-white/10 transition-all"
              >
                Schedule
              </Link>
              <Link 
                href="/memberships" 
                onClick={() => setMenuOpen(false)}
                className="block text-center bg-white/5 text-white px-5 py-3 rounded-xl text-sm font-semibold border border-white/10 hover:bg-white/10 transition-all"
              >
                Memberships
              </Link>
              <form action="/auth/signout" method="post">
                <button className="w-full text-center text-zinc-400 hover:text-white py-3 text-sm font-medium transition-colors">
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link 
                href="/login" 
                onClick={() => setMenuOpen(false)}
                className="block text-center bg-white text-black px-5 py-3 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition-all active:scale-95"
              >
                Sign In
              </Link>
              <Link 
                href="/login?mode=register" 
                onClick={() => setMenuOpen(false)}
                className="block text-center bg-white/5 text-white px-5 py-3 rounded-xl text-sm font-semibold border border-white/10 hover:bg-white/10 transition-all"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
