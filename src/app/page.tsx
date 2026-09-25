import Link from "next/link";
import { ArrowRight, Trophy, Users, CalendarDays } from "lucide-react";
import Navbar from "@/components/Navbar";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <div className="min-h-screen bg-black text-zinc-100 selection:bg-red-500 selection:text-white font-sans">
      
      <Navbar />

      {/* Hero Section */}
      <main className="relative pt-20 pb-16 sm:pt-32 sm:pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Abstract Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] sm:w-[1000px] h-[300px] sm:h-[500px] opacity-30 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-orange-600/20 blur-[100px] rounded-full mix-blend-screen" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 text-center">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-8 leading-[1.1]">
            TRAIN LIKE <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
              A CHAMPION.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-12 font-medium">
            {isLoggedIn 
              ? 'Welcome back to the most elite boxing and fitness facility in the city. Your next session awaits.'
              : 'Join the most elite boxing and fitness facility in the city. Professional coaching, state-of-the-art equipment, and a community that pushes you further.'
            }
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href={isLoggedIn ? "/dashboard" : "/login"} 
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-full font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(220,38,38,0.5)]"
            >
              {isLoggedIn ? 'Go to Dashboard' : 'Join the Club'}
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link 
              href="/schedule" 
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-full font-bold text-lg transition-all border border-white/10"
            >
              View Schedule
            </Link>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="py-16 sm:py-24 bg-zinc-950 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
            <div className="p-8 rounded-3xl bg-black border border-white/5 hover:border-red-500/30 transition-colors group">
              <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Trophy className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold mb-3">Elite Coaching</h3>
              <p className="text-zinc-400 leading-relaxed">
                Learn from former professionals and certified trainers who know what it takes to win.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-black border border-white/5 hover:border-red-500/30 transition-colors group">
              <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold mb-3">Community First</h3>
              <p className="text-zinc-400 leading-relaxed">
                Surround yourself with individuals who are just as driven and dedicated as you are.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-black border border-white/5 hover:border-red-500/30 transition-colors group">
              <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <CalendarDays className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold mb-3">Flexible Classes</h3>
              <p className="text-zinc-400 leading-relaxed">
                From early bird sessions to late-night sparring, find classes that fit your schedule.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
