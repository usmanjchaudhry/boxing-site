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
    .select('stripe_subscription_id, payment_method')
    .eq('household_id', householdId)
    .single()

  if (!sub) throw new Error('No subscription found in database')

  // For cash subscriptions, just update local DB
  if (sub.payment_method === 'cash' || sub.payment_method === 'comp') {
    await supabase
      .from('subscriptions')
      .update({ status: 'Active' })
      .eq('household_id', householdId)
    revalidatePath('/admin')
    return
  }

  if (!sub.stripe_subscription_id) throw new Error('No Stripe subscription found')

  // Try to update in Stripe — if the sub was deleted, catch and mark as Cancelled
  try {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    const subData = ('data' in stripeSub ? (stripeSub as any).data : stripeSub) as any

    if (subData.status === 'canceled') {
      // Subscription was already cancelled in Stripe — sync local DB
      await supabase
        .from('subscriptions')
        .update({ status: 'Cancelled' })
        .eq('household_id', householdId)
      revalidatePath('/admin')
      throw new Error('This subscription was already cancelled in Stripe. Status has been updated.')
    }

    // Still active in Stripe — remove the pause
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      pause_collection: '' as any,
    })
  } catch (err: any) {
    // If Stripe says "resource_missing", the subscription was deleted
    if (err?.type === 'StripeInvalidRequestError' || err?.statusCode === 404) {
      await supabase
        .from('subscriptions')
        .update({ status: 'Cancelled' })
        .eq('household_id', householdId)
      revalidatePath('/admin')
      throw new Error('This subscription no longer exists in Stripe. Status has been updated to Cancelled.')
    }
    throw err
  }

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
    .select('stripe_subscription_id, payment_method')
    .eq('household_id', householdId)
    .single()

  if (!sub) throw new Error('No subscription found in database')

  // For cash subscriptions, just cancel locally
  if (sub.payment_method === 'cash' || sub.payment_method === 'comp') {
    await supabase
      .from('subscriptions')
      .update({ status: 'Cancelled' })
      .eq('household_id', householdId)
    revalidatePath('/admin')
    return
  }

  if (!sub.stripe_subscription_id) throw new Error('No Stripe subscription found')

  // Try to cancel in Stripe — if already gone, just update local DB
  try {
    await stripe.subscriptions.cancel(sub.stripe_subscription_id)
  } catch (err: any) {
    // Already cancelled/deleted in Stripe — that's fine, just update locally
    console.log('Stripe cancel error (likely already cancelled):', err.message)
  }

  await supabase
    .from('subscriptions')
    .update({ status: 'Cancelled' })
    .eq('household_id', householdId)

  revalidatePath('/admin')
}

