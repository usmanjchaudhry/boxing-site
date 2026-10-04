import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getStaffProfile } from '@/utils/auth/staff'

/**
 * Staff-only lock for this endpoint.
 * The list includes hidden plans (Dev $1, Legacy) and their IDs, so it must not be public.
 * Its only caller is the admin Cash Payments tab.
 * To undo: set this to false (or `git revert` the commit that added it).
 */
const REQUIRE_STAFF = true

// GET /api/stripe/plans: return all membership plans (including hidden ones) for admin tools
export async function GET() {
  if (REQUIRE_STAFF) {
    const staff = await getStaffProfile('staff')
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

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
