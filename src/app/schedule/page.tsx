import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { Clock, MapPin, Users, ChevronLeft, ChevronRight } from 'lucide-react'

// Class schedule data — replace with DB query later
const CLASSES = [
  // Monday
  { day: 'Monday',    time: '6:00 AM',  name: 'Morning Burn',       type: 'Cardio Boxing', duration: '45 min', coach: 'Coach Mike',  spots: 20, color: 'from-orange-600 to-red-600' },
  { day: 'Monday',    time: '12:00 PM', name: 'Lunch Grind',        type: 'Boxing Basics', duration: '60 min', coach: 'Coach Sarah', spots: 15, color: 'from-red-600 to-rose-600' },
  { day: 'Monday',    time: '5:30 PM',  name: 'Power Hour',         type: 'Strength & Conditioning', duration: '60 min', coach: 'Coach Mike', spots: 18, color: 'from-blue-600 to-indigo-600' },
  { day: 'Monday',    time: '7:00 PM',  name: 'Fight Night Prep',   type: 'Advanced Boxing', duration: '90 min', coach: 'Coach Ray',  spots: 12, color: 'from-purple-600 to-pink-600' },
  
  // Tuesday
  { day: 'Tuesday',   time: '6:00 AM',  name: 'Dawn Drills',        type: 'Boxing Basics', duration: '45 min', coach: 'Coach Sarah', spots: 20, color: 'from-red-600 to-rose-600' },
  { day: 'Tuesday',   time: '9:00 AM',  name: 'Mommy & Me Boxing',  type: 'Family Class',  duration: '45 min', coach: 'Coach Lisa',  spots: 10, color: 'from-pink-600 to-fuchsia-600' },
  { day: 'Tuesday',   time: '5:30 PM',  name: 'Cardio Knockout',    type: 'Cardio Boxing', duration: '60 min', coach: 'Coach Mike',  spots: 25, color: 'from-orange-600 to-red-600' },
  { day: 'Tuesday',   time: '7:00 PM',  name: 'Sparring Lab',       type: 'Sparring',      duration: '90 min', coach: 'Coach Ray',   spots: 8,  color: 'from-emerald-600 to-teal-600' },
  
  // Wednesday
  { day: 'Wednesday', time: '6:00 AM',  name: 'Morning Burn',       type: 'Cardio Boxing', duration: '45 min', coach: 'Coach Mike',  spots: 20, color: 'from-orange-600 to-red-600' },
  { day: 'Wednesday', time: '12:00 PM', name: 'Lunch Grind',        type: 'Boxing Basics', duration: '60 min', coach: 'Coach Sarah', spots: 15, color: 'from-red-600 to-rose-600' },
  { day: 'Wednesday', time: '4:00 PM',  name: 'Youth Boxing',       type: 'Kids (8-14)',   duration: '45 min', coach: 'Coach Lisa',  spots: 12, color: 'from-amber-500 to-orange-600' },
  { day: 'Wednesday', time: '5:30 PM',  name: 'Power Hour',         type: 'Strength & Conditioning', duration: '60 min', coach: 'Coach Mike', spots: 18, color: 'from-blue-600 to-indigo-600' },
  { day: 'Wednesday', time: '7:00 PM',  name: 'Fight Night Prep',   type: 'Advanced Boxing', duration: '90 min', coach: 'Coach Ray', spots: 12, color: 'from-purple-600 to-pink-600' },
  
  // Thursday
  { day: 'Thursday',  time: '6:00 AM',  name: 'Dawn Drills',        type: 'Boxing Basics', duration: '45 min', coach: 'Coach Sarah', spots: 20, color: 'from-red-600 to-rose-600' },
  { day: 'Thursday',  time: '9:00 AM',  name: 'Mommy & Me Boxing',  type: 'Family Class',  duration: '45 min', coach: 'Coach Lisa',  spots: 10, color: 'from-pink-600 to-fuchsia-600' },
  { day: 'Thursday',  time: '5:30 PM',  name: 'Cardio Knockout',    type: 'Cardio Boxing', duration: '60 min', coach: 'Coach Mike',  spots: 25, color: 'from-orange-600 to-red-600' },
  { day: 'Thursday',  time: '7:00 PM',  name: 'Sparring Lab',       type: 'Sparring',      duration: '90 min', coach: 'Coach Ray',   spots: 8,  color: 'from-emerald-600 to-teal-600' },
  
  // Friday
  { day: 'Friday',    time: '6:00 AM',  name: 'Morning Burn',       type: 'Cardio Boxing', duration: '45 min', coach: 'Coach Mike',  spots: 20, color: 'from-orange-600 to-red-600' },
  { day: 'Friday',    time: '12:00 PM', name: 'Lunch Grind',        type: 'Boxing Basics', duration: '60 min', coach: 'Coach Sarah', spots: 15, color: 'from-red-600 to-rose-600' },
  { day: 'Friday',    time: '5:30 PM',  name: 'TGIF Knockout',      type: 'Cardio Boxing', duration: '60 min', coach: 'Coach Mike',  spots: 30, color: 'from-orange-600 to-red-600' },
  
  // Saturday
  { day: 'Saturday',  time: '8:00 AM',  name: 'Weekend Warrior',    type: 'Advanced Boxing', duration: '90 min', coach: 'Coach Ray',  spots: 15, color: 'from-purple-600 to-pink-600' },
  { day: 'Saturday',  time: '10:00 AM', name: 'Youth Boxing',       type: 'Kids (8-14)',   duration: '45 min', coach: 'Coach Lisa',  spots: 12, color: 'from-amber-500 to-orange-600' },
  { day: 'Saturday',  time: '11:00 AM', name: 'Open Gym',           type: 'Open Gym',      duration: '120 min', coach: 'Self-Guided', spots: 30, color: 'from-zinc-600 to-zinc-700' },
  
  // Sunday
  { day: 'Sunday',    time: '9:00 AM',  name: 'Sunday Sweat',       type: 'Cardio Boxing', duration: '60 min', coach: 'Coach Sarah', spots: 25, color: 'from-orange-600 to-red-600' },
  { day: 'Sunday',    time: '11:00 AM', name: 'Open Gym',           type: 'Open Gym',      duration: '120 min', coach: 'Self-Guided', spots: 30, color: 'from-zinc-600 to-zinc-700' },
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const CLASS_TYPES = [
  { name: 'Boxing Basics', color: 'bg-red-500' },
  { name: 'Advanced Boxing', color: 'bg-purple-500' },
  { name: 'Cardio Boxing', color: 'bg-orange-500' },
  { name: 'Strength & Conditioning', color: 'bg-blue-500' },
  { name: 'Sparring', color: 'bg-emerald-500' },
  { name: 'Kids (8-14)', color: 'bg-amber-500' },
  { name: 'Family Class', color: 'bg-pink-500' },
  { name: 'Open Gym', color: 'bg-zinc-500' },
]

export default function SchedulePage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] opacity-20 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-orange-600 blur-[120px] rounded-full" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter mb-4">
              CLASS <span className="text-red-600">SCHEDULE</span>
            </h1>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              From beginner boxing to advanced sparring — find the class that fits your goals.
            </p>
          </div>

          {/* Class Type Legend */}
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {CLASS_TYPES.map(ct => (
              <div key={ct.name} className="flex items-center gap-2 text-xs text-zinc-400">
                <div className={`w-2.5 h-2.5 rounded-full ${ct.color}`} />
                {ct.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Schedule Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="space-y-6">
          {DAYS.map(day => {
            const dayClasses = CLASSES.filter(c => c.day === day)
            if (dayClasses.length === 0) return null
            
            const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === day

            return (
              <div key={day} className="rounded-2xl bg-zinc-950 border border-white/5 overflow-hidden">
                {/* Day Header */}
                <div className={`px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 flex items-center justify-between ${
                  isToday ? 'bg-red-600/5' : ''
                }`}>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg sm:text-xl font-black tracking-tight">{day}</h2>
                    {isToday && (
                      <span className="text-xs font-bold bg-red-600 text-white px-2.5 py-0.5 rounded-full animate-pulse">
                        TODAY
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600">{dayClasses.length} classes</span>
                </div>

                {/* Class Cards */}
                <div className="divide-y divide-white/5">
                  {dayClasses.map((cls, i) => (
                    <div key={i} className="px-4 sm:px-6 py-4 hover:bg-white/[0.02] transition-colors group">
                      <div className="flex items-start sm:items-center gap-4">
                        {/* Time */}
                        <div className="min-w-[70px] sm:min-w-[80px]">
                          <p className="text-sm sm:text-base font-bold text-white">{cls.time}</p>
                          <p className="text-xs text-zinc-600">{cls.duration}</p>
                        </div>

                        {/* Color Indicator */}
                        <div className={`hidden sm:block w-1 h-12 rounded-full bg-gradient-to-b ${cls.color} flex-shrink-0`} />

                        {/* Class Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-white text-sm sm:text-base">{cls.name}</h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/5">
                              {cls.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full" />
                              {cls.coach}
                            </span>
                            <span className="text-xs text-zinc-600 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {cls.spots} spots
                            </span>
                          </div>
                        </div>

                        {/* CTA */}
                        <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                            Coming Soon
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Gym Info */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-zinc-950 border border-white/5 p-6 text-center">
            <Clock className="w-6 h-6 text-red-500 mx-auto mb-3" />
            <h3 className="font-bold text-sm mb-1">Gym Hours</h3>
            <p className="text-xs text-zinc-400">Mon–Fri: 5 AM – 10 PM</p>
            <p className="text-xs text-zinc-400">Sat–Sun: 7 AM – 6 PM</p>
          </div>
          <div className="rounded-2xl bg-zinc-950 border border-white/5 p-6 text-center">
            <MapPin className="w-6 h-6 text-red-500 mx-auto mb-3" />
            <h3 className="font-bold text-sm mb-1">Location</h3>
            <p className="text-xs text-zinc-400">123 Main Street</p>
            <p className="text-xs text-zinc-400">Los Angeles, CA 90001</p>
          </div>
          <div className="rounded-2xl bg-zinc-950 border border-white/5 p-6 text-center">
            <Users className="w-6 h-6 text-red-500 mx-auto mb-3" />
            <h3 className="font-bold text-sm mb-1">Need Help?</h3>
            <p className="text-xs text-zinc-400">Contact us at</p>
            <p className="text-xs text-red-400 font-medium">info@titleboxing.com</p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-zinc-500 text-sm mb-4">Ready to get started?</p>
          <Link
            href="/memberships"
            className="inline-block bg-white text-black font-bold px-8 py-3 rounded-xl hover:bg-zinc-200 transition-all active:scale-95"
          >
            View Membership Plans
          </Link>
        </div>
      </section>
    </div>
  )
}
