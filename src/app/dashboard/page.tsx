export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import WaiverPad from '@/components/WaiverPad'
import { signWaiver } from './actions'
import Navbar from '@/components/Navbar'
import AddDependentForm from '@/components/AddDependentForm'
import MemberQRCode from '@/components/MemberQRCode'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 1. Get Primary User's Profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name')
    .eq('auth_user_id', user.id)
    .single()

  // 2. Fetch entire Household
  let householdMembers: any[] = []
  let householdId: string | null = null
  if (profile) {
    const { data: householdMember } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('profile_id', profile.id)
      .single()

    if (householdMember) {
      householdId = householdMember.household_id
      const { data } = await supabase
        .from('household_members')
        .select(`
          role,
          profile:profiles(id, first_name, last_name, date_of_birth)
        `)
        .eq('household_id', householdMember.household_id)
      
      householdMembers = data || []
    }
  }

  // 3. Fetch subscription status
  let subscription: any = null
  let planName: string | null = null
  if (householdId) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, end_date, plan_id, membership_plans(name)')
      .eq('household_id', householdId)
      .limit(1)
      .maybeSingle()

    if (sub) {
      subscription = sub
      planName = (sub.membership_plans as any)?.name || null
    }
  }

  // 4. Fetch waiver status for each member
  let waiverStatusMap: Record<string, boolean> = {}
  if (householdMembers.length > 0) {
    const { data: template } = await supabase
      .from('waiver_templates')
      .select('id')
      .eq('is_active', true)
      .single()

    if (template) {
      for (const member of householdMembers) {
        if (!member.profile) continue
        const { data: waivers } = await supabase
          .from('waivers')
          .select('id')
          .eq('participant_id', member.profile.id)
          .eq('waiver_template_id', template.id)
          .eq('is_valid', true)
          .limit(1)

        waiverStatusMap[member.profile.id] = (waivers && waivers.length > 0)
      }
    }
  }

  // 5. GATEKEEPER: Find the first member missing a waiver
  let missingWaiverFor: { id: string, name: string } | null = null
  let activeWaiverText = ""

  if (profile && householdMembers.length > 0) {
    const { data: template } = await supabase
      .from('waiver_templates')
      .select('id, body_text')
      .eq('is_active', true)
      .single()

    if (template) {
      for (const member of householdMembers) {
        if (!member.profile) continue
        if (!waiverStatusMap[member.profile.id]) {
          missingWaiverFor = {
            id: member.profile.id,
            name: `${member.profile.first_name} ${member.profile.last_name}`
          }
          activeWaiverText = template.body_text
          break
        }
      }
    }
  }

  const isActive = subscription?.status === 'Active'

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-white relative">
      
      {/* WAIVER OVERLAY */}
      {missingWaiverFor && (
        <WaiverPad 
          waiverText={activeWaiverText} 
          participantId={missingWaiverFor.id}
          participantName={missingWaiverFor.name}
          onSign={signWaiver} 
        />
      )}

      <Navbar />

      <main className={`max-w-7xl mx-auto px-6 py-12 ${missingWaiverFor ? 'blur-md pointer-events-none' : ''}`}>
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-2">Welcome back, {profile?.first_name || 'Champion'}.</h1>
          <p className="text-zinc-400">Manage your membership, book classes, and track your progress.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          
          {/* Membership Status Card */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/5 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-zinc-300">Membership Status</h3>
              <div className="flex items-end gap-3 mb-2">
                <span className={`text-3xl font-black ${isActive ? 'text-green-400' : 'text-white'}`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {isActive && planName && (
                <p className="text-sm text-zinc-400 mt-1">{planName}</p>
              )}
              {isActive && subscription?.end_date && (
                <p className="text-sm text-zinc-500 mt-1">
                  Renews: {new Date(subscription.end_date).toLocaleDateString()}
                </p>
              )}
              {!isActive && (
                <p className="text-sm text-zinc-500 mt-2">You do not have an active subscription.</p>
              )}
            </div>
            <Link 
              href="/memberships"
              className={`mt-6 w-full text-center text-sm font-bold py-3 rounded-xl transition-colors active:scale-95 block ${
                isActive 
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/5' 
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-[0_0_15px_-5px_rgba(220,38,38,0.5)]'
              }`}
            >
              {isActive ? 'Manage Plan' : 'View Memberships'}
            </Link>
          </div>

          {/* Next Class Card */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/5 relative overflow-hidden group flex flex-col justify-between">
            <h3 className="text-lg font-semibold mb-4 text-zinc-300 relative z-10">Next Class</h3>
            <div className="relative z-10">
              <p className="text-zinc-500 text-sm italic">No upcoming classes booked.</p>
            </div>
            <button className="mt-6 w-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold py-3 rounded-xl transition-colors border border-white/5 active:scale-95">
              View Schedule
            </button>
          </div>

          {/* Household Management */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/5 row-span-2">
            <h3 className="text-lg font-semibold mb-4 text-zinc-300">My Household</h3>
            
            {/* List Members */}
            <div className="space-y-3 mb-8">
              {householdMembers.map((m, i) => {
                const hasSigned = waiverStatusMap[m.profile?.id] || false
                return (
                  <div key={i} className="bg-black border border-white/5 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">{m.profile?.first_name} {m.profile?.last_name}</p>
                      <p className="text-xs text-zinc-500">{m.role}</p>
                    </div>
                    <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                      hasSigned 
                        ? 'bg-green-500/10 text-green-500' 
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      {hasSigned ? 'Waiver ✓' : 'Waiver Missing'}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-white/10 pt-6">
              <h4 className="text-sm font-semibold text-white mb-4">Add a Family Member</h4>
              <AddDependentForm />
            </div>
          </div>

          {/* QR Codes Card */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/5 md:col-span-2">
            <h3 className="text-lg font-semibold mb-4 text-zinc-300">Gym Check-in QR Codes</h3>
            <p className="text-sm text-zinc-500 mb-6">Show these QR codes at the front desk to check in.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {householdMembers.map((m, i) => (
                m.profile && (
                  <MemberQRCode 
                    key={i}
                    profileId={m.profile.id}
                    name={`${m.profile.first_name} ${m.profile.last_name}`}
                  />
                )
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
