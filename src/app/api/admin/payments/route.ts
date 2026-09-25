import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/utils/stripe/server'

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = getAdminSupabase()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') return null
  return profile
}

// GET /api/admin/payments — Recent payments from Stripe
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    // Fetch recent charges from Stripe
    const charges = await stripe.charges.list({ limit: 20 })
    
    const payments = charges.data.map(charge => ({
      id: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      status: charge.status,
      created: charge.created,
      customerEmail: charge.billing_details?.email || charge.receipt_email || 'N/A',
      customerName: charge.billing_details?.name || 'N/A',
      description: charge.description || 'Subscription payment',
      receiptUrl: charge.receipt_url,
    }))

    return NextResponse.json({ payments })
  } catch (err: any) {
    console.error('Failed to fetch payments:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
