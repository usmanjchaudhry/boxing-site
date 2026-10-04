export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PlanCard from '@/components/PlanCard'
import PassCard from '@/components/PassCard'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export default async function DevPage() {
  // Check cookie
  const cookieStore = await cookies()
  const accessGranted = cookieStore.get('dev_access')?.value === 'granted'
  if (!accessGranted) redirect('/memberships')

  // Double-check: verify the logged-in user is admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== 'usmanjc98@gmail.com') redirect('/memberships')

  // Fetch dev products using admin client (they have is_active: false)
  const adminDb = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // order + limit(1) instead of .single(): .single() returns nothing if a name is ever duplicated.
  const { data: devPlan } = await adminDb
    .from('membership_plans')
    .select('*')
    .eq('name', 'Dev Membership')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: devDoublePlan } = await adminDb
    .from('membership_plans')
    .select('*')
    .eq('name', 'Dev Double Membership')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: devPass } = await adminDb
    .from('products')
    .select('*')
    .eq('name', 'Dev Day Pass')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-green-500 selection:text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-16">
          <h1 className="text-3xl sm:text-5xl font-black mb-4 font-mono tracking-widest text-green-500">
            {'>'} DEV PORTAL _
          </h1>
          <p className="text-zinc-400 text-sm sm:text-lg max-w-xl mx-auto border border-green-900/50 bg-green-950/20 p-4 rounded-xl">
            Admin testing environment. $1 products for checkout testing. Only accessible by authorized accounts.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
          {/* Dev Membership */}
          {devPlan && (
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-green-600 to-zinc-800 rounded-[2rem] blur-xl opacity-20 animate-pulse" />
              <PlanCard
                plan={devPlan}
                isCurrentPlan={false}
              />
            </div>
          )}

          {/* Dev Double Membership */}
          {devDoublePlan && (
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-green-600 to-zinc-800 rounded-[2rem] blur-xl opacity-20 animate-pulse" />
              <PlanCard
                plan={devDoublePlan}
                isCurrentPlan={false}
              />
            </div>
          )}

          {/* Dev Day Pass */}
          {devPass && (
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-green-600 to-zinc-800 rounded-[2rem] blur-xl opacity-20 animate-pulse" />
              <PassCard pass={devPass} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
