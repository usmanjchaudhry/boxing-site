export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { stripe } from '@/utils/stripe/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function toDateString(val: any): string | null {
  if (!val) return null
  const ts = typeof val === 'number' ? val : (val?.seconds ?? val?.unix ?? null)
  if (!ts) return null
  try { return new Date(ts * 1000).toISOString().split('T')[0] } catch { return null }
}

export default async function MembershipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const params = await searchParams
  const sessionId = params.session_id

  // If we have a session_id, actively confirm the subscription in our DB
  // This is the belt-and-suspenders approach — don't wait for the webhook
  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId) as any
      const stripeSubscriptionId = session.subscription
      const householdId = session.metadata?.household_id
      const planId = session.metadata?.plan_id

      console.log('[success-page] Confirming checkout:', { sessionId, stripeSubscriptionId, householdId, planId })

      if (householdId && stripeSubscriptionId && planId) {
        const adminDb = getAdminDb()

        // Retrieve the subscription to get period dates
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any
        const startDate = toDateString(sub.current_period_start) || new Date().toISOString().split('T')[0]
        const endDate = toDateString(sub.current_period_end)

        // Upsert the subscription — same logic as webhook but guaranteed to run
        const { error } = await adminDb.from('subscriptions').upsert({
          household_id: householdId,
          plan_id: planId,
          status: 'Active',
          start_date: startDate,
          end_date: endDate,
          stripe_subscription_id: stripeSubscriptionId,
          payment_method: 'stripe',
        }, {
          onConflict: 'household_id'
        })

        if (error) {
          console.error('[success-page] Upsert error:', error)
        } else {
          console.log('[success-page] Subscription confirmed for household:', householdId)
        }
      }
    } catch (err: any) {
      console.error('[success-page] Error confirming subscription:', err.message)
      // Don't block the page — still show success
    }
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">✓</span>
          </div>
          <h1 className="text-3xl font-black mb-3">You&apos;re All Set!</h1>
          <p className="text-zinc-400 mb-8">
            Your membership is now active. Welcome to the team — let&apos;s get to work.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-8 py-3 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-colors active:scale-95 shadow-[0_0_20px_-5px_rgba(220,38,38,0.5)]"
          >
            Go to Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
