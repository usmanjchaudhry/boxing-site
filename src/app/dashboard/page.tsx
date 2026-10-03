export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import WaiverPad from '@/components/WaiverPad'
import { signWaiver } from './actions'
import Navbar from '@/components/Navbar'
import AddDependentForm from '@/components/AddDependentForm'
import MemberQRCode from '@/components/MemberQRCode'
import TicketCard from '@/components/TicketCard'

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
      .select('status, end_date, plan_id, payment_method, stripe_subscription_id, membership_plans(name)')
      .eq('household_id', householdId)
      .limit(1)
      .maybeSingle()

    if (sub) {
      // Auto-expire cash subscriptions past their end_date
      if (sub.status === 'Active' && sub.end_date && new Date(sub.end_date) < new Date()) {
        await supabase
          .from('subscriptions')
          .update({ status: 'Cancelled' })
          .eq('household_id', householdId)
          .eq('status', 'Active')
        
        subscription = { ...sub, status: 'Cancelled' }
      } else if (sub.stripe_subscription_id && sub.payment_method === 'stripe') {
        // Enterprise Stripe sync — verify against Stripe, detect re-subscribes
        try {
          const { syncSubscriptionWithStripe } = await import('@/utils/stripe-sync')
          const synced = await syncSubscriptionWithStripe(sub, householdId)

          if (synced.status !== sub.status || synced.plan_id !== sub.plan_id) {
            // Re-fetch to get updated plan name
            const { data: refreshedSub } = await supabase
              .from('subscriptions')
              .select('status, end_date, plan_id, payment_method, stripe_subscription_id, membership_plans(name)')
              .eq('household_id', householdId)
              .single()
            subscription = refreshedSub || { ...sub, status: synced.status }
            planName = (refreshedSub?.membership_plans as any)?.name || null
          } else {
            subscription = sub
          }
        } catch (syncErr: any) {
          console.error('Dashboard sync failed, using DB value:', syncErr.message)
          subscription = sub
        }
      } else {
        subscription = sub
      }
      planName = planName || (sub.membership_plans as any)?.name || null
    }
  }

  // 3.5 Fetch All Passes (Available & Past)
  let availablePasses: any[] = []
  let pastPasses: any[] = []
  if (householdMembers.length > 0) {
    const profileIds = householdMembers.map(m => m.profile?.id).filter(Boolean)
    if (profileIds.length > 0) {
      const { data: passes } = await supabase
        .from('passes')
        .select('id, pass_type, status, created_at, updated_at, profile_id')
        .in('profile_id', profileIds)
        .order('created_at', { ascending: false })
        
      // Map the profile name back for display
      if (passes) {
        const mappedPasses = passes.map(p => {
          const owner = householdMembers.find(m => m.profile?.id === p.profile_id)?.profile
          return {
            ...p,
            owner_name: owner ? `${owner.first_name} ${owner.last_name}` : 'Unknown'
          }
        })
        
        availablePasses = mappedPasses.filter(p => p.status === 'Available')
        pastPasses = mappedPasses.filter(p => p.status !== 'Available')
      }
        

    }
  }

  // 4. Fetch waiver status for each member
  let waiverStatusMap: Record<string, boolean> = {}
  if (householdMembers.length > 0) {
    const { data: template } = await supabase
      .from('waiver_templates')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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

        waiverStatusMap[member.profile.id] = !!(waivers && waivers.length > 0)
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
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 ${missingWaiverFor ? 'blur-md pointer-events-none' : ''}`}>
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Welcome back, {profile?.first_name || 'Champion'}.</h1>
          <p className="text-zinc-400 text-sm sm:text-base">Manage your membership, book classes, and track your progress.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          
          {/* Membership Status Card */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/5 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-zinc-300">Membership Status</h3>
              <div className="flex items-end gap-3 mb-2">
                <span className={`text-3xl font-black ${
                  isActive ? 'text-green-400' 
                  : subscription?.status === 'Past_Due' ? 'text-amber-400'
                  : subscription?.status === 'Cancelled' ? 'text-red-400'
                  : 'text-white'
                }`}>
                  {isActive ? 'Active' 
                   : subscription?.status === 'Past_Due' ? 'Past Due'
                   : subscription?.status === 'Cancelled' ? 'Cancelled'
                   : 'Inactive'}
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
              {subscription?.status === 'Past_Due' && (
                <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-400 font-medium">⚠ Your last payment failed. Please update your payment method to restore access.</p>
                </div>
              )}
              {subscription?.status === 'Cancelled' && (
                <div className="mt-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400 font-medium">Your subscription has been cancelled. Re-subscribe to regain gym access.</p>
                </div>
              )}
              {!subscription && (
                <p className="text-sm text-zinc-500 mt-2">You do not have a subscription yet.</p>
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
              {isActive ? 'Manage Plan' 
               : subscription?.status === 'Past_Due' ? 'Update Payment'
               : subscription?.status === 'Cancelled' ? 'Re-subscribe'
               : 'View Memberships'}
            </Link>
          </div>

          {/* Next Class Card */}
          <div className="p-6 rounded-3xl bg-zinc-950 border border-white/5 relative overflow-hidden group flex flex-col justify-between">
            <h3 className="text-lg font-semibold mb-4 text-zinc-300 relative z-10">Next Class</h3>
            <div className="relative z-10">
              <p className="text-zinc-500 text-sm italic">No upcoming classes booked.</p>
            </div>
            <Link href="/schedule" className="mt-6 w-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold py-3 rounded-xl transition-colors border border-white/5 active:scale-95 block text-center">
              View Schedule
            </Link>
          </div>

          {/* Passes Cards (If any exist) */}
          {(availablePasses.length > 0 || pastPasses.length > 0) && (
            <div className="p-6 rounded-3xl bg-zinc-950 border border-white/5 flex flex-col md:col-span-2">
              {availablePasses.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-4 text-zinc-300">Available Tickets</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availablePasses.map(pass => (
                      <TicketCard key={pass.id} pass={pass} />
                    ))}
                  </div>
                </div>
              )}

              {pastPasses.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-zinc-500">Ticket History</h3>
                  <div className="space-y-2">
                    {pastPasses.map(pass => (
                      <div key={pass.id} className="bg-black border border-white/5 p-3 rounded-lg flex items-center justify-between opacity-70">
                        <div>
                          <p className="font-semibold text-zinc-300 text-sm">{pass.pass_type} <span className="text-zinc-500 font-normal">({pass.owner_name})</span></p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">Bought: {new Date(pass.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold px-2 py-1 bg-zinc-800 text-zinc-400 rounded uppercase tracking-wider inline-block mb-1">
                            {pass.status}
                          </div>
                          <p className="text-[10px] text-zinc-500">
                            {pass.status === 'Consumed' ? `Used: ${new Date(pass.updated_at || pass.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
          <div id="qr-codes" className="p-6 rounded-3xl bg-zinc-950 border border-white/5 md:col-span-2 scroll-mt-24">
            <h3 className="text-lg font-semibold mb-4 text-zinc-300">Gym Check-in QR Codes</h3>
            <p className="text-sm text-zinc-500 mb-6">Show these QR codes at the front desk to check in.</p>
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-4">
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
