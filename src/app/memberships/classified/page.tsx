import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PlanCard from '@/components/PlanCard'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export default async function ClassifiedPage() {
  const cookieStore = await cookies()
  const accessGranted = cookieStore.get('legacy_access')?.value === 'granted'

  if (!accessGranted) {
    redirect('/memberships')
  }

  // We need to bypass RLS to fetch the hidden Legacy plan
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Get Legacy Plan. order + limit(1) instead of .single(): .single() returns
  // nothing when two rows share the name, which showed "Legacy plan not found".
  const { data: plan } = await supabaseAdmin
    .from('membership_plans')
    .select('*')
    .eq('name', 'Legacy Unlimited')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!plan) {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex items-center justify-center">
        <p>Error: Legacy plan not found.</p>
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
            Access Authorized. This exclusive $100/mo legacy tier is completely hidden from the public. Your transfer has been approved.
          </p>
        </div>

        {/* Plans Grid (Just the one secret plan) */}
        <div className="flex justify-center mb-16">
          <div className="w-full max-w-md relative">
             <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-zinc-800 rounded-[2rem] blur-xl opacity-20 animate-pulse pointer-events-none"></div>
            <PlanCard
              plan={plan}
              isCurrentPlan={false}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
