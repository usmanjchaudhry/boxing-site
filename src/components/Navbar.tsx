import Link from 'next/link'
import { User, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let profile = null
  if (user) {
    console.log("NAVBAR DEBUG: Logged in as User ID:", user.id)
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()
      
    console.log("NAVBAR DEBUG: Profile Data:", data)
    console.log("NAVBAR DEBUG: Profile Error:", error)
    
    profile = data
  }

  return (
    <nav className="border-b border-white/5 bg-black/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo / Home Link */}
        <Link href="/" className="text-2xl font-bold tracking-tighter flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-red-600">TITLE</span> BOXING
        </Link>
        
        <div className="flex items-center gap-6">
          {user ? (
            <>
              {/* User Profile Pill */}
              <div className="text-sm font-medium text-zinc-300 flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                <User className="w-4 h-4 text-red-500" />
                {profile?.first_name && profile?.last_name 
                  ? `${profile.first_name} ${profile.last_name}`
                  : 'Champion'}
              </div>

              {/* Dashboard Link */}
              <Link 
                href="/dashboard" 
                className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-all active:scale-95"
              >
                Dashboard
              </Link>

              {/* Sign Out Button */}
              <form action="/auth/signout" method="post">
                <button className="text-zinc-400 hover:text-white p-2 transition-colors bg-white/5 hover:bg-white/10 rounded-full" title="Sign Out">
                  <LogOut className="w-5 h-5" />
                </button>
              </form>
            </>
          ) : (
            <>
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
      </div>
    </nav>
  )
}
