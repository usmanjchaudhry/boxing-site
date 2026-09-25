import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// GET /api/stripe/plans — Return all active membership plans
export async function GET() {
  const db = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: plans, error } = await db
    .from('membership_plans')
    .select('id, name, price_cents, billing_interval, max_dependents')
    .order('price_cents', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ plans: plans || [] })
}
