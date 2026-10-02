export const dynamic = 'force-dynamic'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PlanCard from '@/components/PlanCard'
import PassCard from '@/components/PassCard'
import LegacyModal from '@/components/LegacyModal'
import DevModal from '@/components/DevModal'

import { syncSubscriptionWithStripe } from '@/utils/stripe-sync'

export default async function MembershipsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get current subscription status
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  let currentPlanId: string | null = null
  let subscriptionStatus: string | null = null

  if (profile) {
    const { data: hm } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('profile_id', profile.id)
      .single()

    if (hm) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_id, status, stripe_subscription_id, payment_method')
        .eq('household_id', hm.household_id)
        .limit(1)
        .maybeSingle()

      if (sub) {
        // Sync with Stripe to get the real status
        const synced = await syncSubscriptionWithStripe(sub, hm.household_id)
        
        if (synced.status === 'Active') {
          currentPlanId = synced.plan_id
          subscriptionStatus = synced.status
        }
      }
    }
  }

  // Get all active plans
  const { data: plans } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_cents', { ascending: true })

  // Get active day passes
  const { data: passes } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .in('category', ['DayPass'])
    .order('price_cents', { ascending: true })

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-16">
          <h1 className="text-3xl sm:text-5xl font-black mb-4 bg-gradient-to-r from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-zinc-400 text-sm sm:text-lg max-w-xl mx-auto">
            Unlock full gym access. Train with the best. Cancel anytime.
          </p>
        </div>

        {/* Current Subscription Banner */}
        {currentPlanId && subscriptionStatus === 'Active' && (
          <div className="mb-10 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-center">
            <p className="text-green-400 font-bold text-sm">
              ✓ You have an active subscription
            </p>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 max-w-3xl mx-auto mb-16">
          {(plans || []).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={plan.id === currentPlanId}
            />
          ))}
        </div>

        {/* Passes Section */}
        {passes && passes.length > 0 && (
          <div className="border-t border-white/10 pt-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-4xl font-black mb-4">Single Passes</h2>
              <p className="text-zinc-400 text-sm sm:text-lg">Just visiting? Grab a day pass and jump into the action.</p>
            </div>
            
            <div className="grid grid-cols-1 max-w-md mx-auto gap-4 sm:gap-6">
              {passes.map((pass) => (
                <PassCard key={pass.id} pass={pass} />
              ))}
            </div>
          </div>
        )}

        {/* Fine Print */}
        <div className="mt-16 text-center text-zinc-600 text-xs space-y-1">
          <p>All plans are billed monthly. You can cancel anytime from your Stripe portal.</p>
          <p>Family plans cover all members in your household up to the plan limit.</p>
          
          <div className="pt-8 flex items-center justify-center gap-6">
            <LegacyModal />
            <DevModal />
          </div>
        </div>
      </main>
    </div>
  )
}
