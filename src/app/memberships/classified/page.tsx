import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PlanCard from '@/components/PlanCard'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { CODE_UNLOCKED_PLAN_NAMES } from '@/utils/legacy-access'

export const dynamic = 'force-dynamic'

export default async function ClassifiedPage() {
  const cookieStore = await cookies()
  const accessGranted = cookieStore.get('legacy_access')?.value === 'granted'

  if (!accessGranted) {
    redirect('/memberships')
  }

  // We need to bypass RLS to fetch the hidden plans
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // All hidden plans the code unlocks. Oldest row first so that, if two rows
  // ever share a name, we consistently pick the original (the old .single()
  // lookup showed "plan not found" in that case).
  const { data: rows } = await supabaseAdmin
    .from('membership_plans')
    .select('*')
    .in('name', [...CODE_UNLOCKED_PLAN_NAMES])
    .order('created_at', { ascending: true })

  // One plan per name, shown in the order of CODE_UNLOCKED_PLAN_NAMES.
  // Plans that haven't been created yet are simply left out.
  const plans = CODE_UNLOCKED_PLAN_NAMES
    .map(name => rows?.find(p => p.name === name))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  if (plans.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex items-center justify-center">
        <p>Error: No hidden plans found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-16">
          <h1 className="text-3xl sm:text-5xl font-black mb-4 font-mono tracking-widest text-red-600">
            [ CLASSIFIED PORTAL ]
          </h1>
          <p className="text-zinc-400 text-sm sm:text-lg max-w-xl mx-auto border border-red-900/50 bg-red-950/20 p-4 rounded-xl">
            Access Authorized. These exclusive plans are completely hidden from the public. Choose the one that fits you.
          </p>
        </div>

        {/* Hidden plans */}
        <div
          id="classified-plans"
          className={`grid gap-8 mb-16 mx-auto ${
            plans.length === 1
              ? 'max-w-md'
              : plans.length === 2
                ? 'max-w-3xl sm:grid-cols-2'
                : 'max-w-6xl sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {plans.map(plan => (
            <div key={plan.id} className="relative pt-3 grid">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-zinc-800 rounded-[2rem] blur-xl opacity-20 animate-pulse pointer-events-none"></div>
              <PlanCard plan={plan} isCurrentPlan={false} />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
