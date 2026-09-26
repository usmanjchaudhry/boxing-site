import Link from "next/link";
import Image from "next/image";
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

      {/* Gym Gallery Section */}
      <section id="gallery" className="py-16 sm:py-24 bg-black border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Section Header */}
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-red-500 text-sm font-bold uppercase tracking-[0.2em] mb-3">Inside the Club</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
              WHERE CHAMPIONS <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">ARE MADE</span>
            </h2>
            <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
              State-of-the-art facilities designed for serious training. Every detail built to push you further.
            </p>
          </div>

          {/* Bento Grid Gallery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-[200px] sm:auto-rows-[250px]">
            {/* Large hero image — spans 2 cols, 2 rows */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden group sm:col-span-2 lg:col-span-2 row-span-2 border border-white/5">
              <Image
                src="/gym-interior.jpg"
                alt="Premium boxing gym interior with heavy bags and full-size ring"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 50vw"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">The Floor</span>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-1">World-Class Facility</h3>
                <p className="text-zinc-300 text-sm mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  Full-size ring, heavy bags, speed bags, and everything you need to train at the highest level.
                </p>
              </div>
            </div>

            {/* Training shot */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden group row-span-2 border border-white/5">
              <Image
                src="/gym-training.jpg"
                alt="Boxer training with heavy bag in dramatic lighting"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
              <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Training</span>
                <h3 className="text-lg font-black text-white mt-1">Bag Work</h3>
              </div>
            </div>

            {/* Gloves detail */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden group border border-white/5">
              <Image
                src="/gym-gloves.jpg"
                alt="Red boxing gloves hanging on the ring ropes"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
              <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Gear</span>
                <h3 className="text-lg font-black text-white mt-1">Premium Equipment</h3>
              </div>
            </div>

            {/* Weights detail */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden group border border-white/5">
              <Image
                src="/gym-weights.jpg"
                alt="Weight training area with dumbbells and kettlebells"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
              <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Strength</span>
                <h3 className="text-lg font-black text-white mt-1">Weight Room</h3>
              </div>
            </div>

            {/* Group class — spans 2 cols */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden group sm:col-span-2 border border-white/5">
              <Image
                src="/gym-class.jpg"
                alt="High-energy group boxing fitness class in action"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Classes</span>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-1">Group Training Sessions</h3>
                <p className="text-zinc-300 text-sm mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  High-energy classes led by expert coaches. All levels welcome.
                </p>
              </div>
            </div>

            {/* Sparring — spans 2 cols */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden group sm:col-span-2 border border-white/5">
              <Image
                src="/gym-sparring.jpg"
                alt="Two boxers sparring in a professional ring"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Ring Time</span>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-1">Sparring & Competition Prep</h3>
                <p className="text-zinc-300 text-sm mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  Controlled sparring sessions to sharpen your skills under professional supervision.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

