'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/utils/stripe/server'
import { revalidatePath } from 'next/cache'

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Not an admin')
  
  // Return a powerful admin client for DB operations to bypass RLS
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function freezeSubscription(householdId: string, resumesAtDateString?: string | null) {
  const supabase = await checkAdmin()

  // 1. Get the stripe subscription ID
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('household_id', householdId)
    .single()

  if (!sub?.stripe_subscription_id) throw new Error('No Stripe subscription found')

  // 2. Configure pause collection
  const pauseCollection: any = { behavior: 'void' }
  
  if (resumesAtDateString) {
    // Convert YYYY-MM-DD to unix timestamp
    pauseCollection.resumes_at = Math.floor(new Date(resumesAtDateString).getTime() / 1000)
  }

  // 3. Pause collection in Stripe
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    pause_collection: pauseCollection,
  })

  // 4. Update local DB instantly so UI reflects it (webhook will also fire as a backup)
  await supabase
    .from('subscriptions')
    .update({ status: 'Frozen' })
    .eq('household_id', householdId)

  revalidatePath('/admin')
}

export async function unfreezeSubscription(householdId: string) {
  const supabase = await checkAdmin()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('household_id', householdId)
    .single()

  if (!sub?.stripe_subscription_id) throw new Error('No Stripe subscription found')

  // Pass an empty string to remove the pause_collection rule
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    pause_collection: '' as any, // Stripe API expects empty string to clear
  })

  await supabase
    .from('subscriptions')
    .update({ status: 'Active' })
    .eq('household_id', householdId)

  revalidatePath('/admin')
}

export async function cancelSubscription(householdId: string) {
  const supabase = await checkAdmin()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('household_id', householdId)
    .single()

  if (!sub?.stripe_subscription_id) throw new Error('No Stripe subscription found')

  // Cancel in Stripe
  await stripe.subscriptions.cancel(sub.stripe_subscription_id)

  await supabase
    .from('subscriptions')
    .update({ status: 'Cancelled' })
    .eq('household_id', householdId)

  revalidatePath('/admin')
}
