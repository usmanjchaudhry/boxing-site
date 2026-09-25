export const dynamic = 'force-dynamic'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PlanCard from '@/components/PlanCard'

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
        .select('plan_id, status')
        .eq('household_id', hm.household_id)
        .limit(1)
        .maybeSingle()

      if (sub && sub.status === 'Active') {
        currentPlanId = sub.plan_id
        subscriptionStatus = sub.status
      }
    }
  }

  // Get all active plans
  const { data: plans } = await supabase
    .from('membership_plans')
    .select('*')
    .eq('is_active', true)
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
            Unlock full gym access for yourself or your entire family. Cancel anytime.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {(plans || []).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={plan.id === currentPlanId}
            />
          ))}
        </div>

        {/* Fine Print */}
        <div className="mt-16 text-center text-zinc-600 text-xs space-y-1">
          <p>All plans are billed monthly. You can cancel anytime from your Stripe portal.</p>
          <p>Family plans cover all members in your household up to the plan limit.</p>
        </div>
      </main>
    </div>
  )
}
