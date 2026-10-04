import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceClient } from '@/utils/auth/staff'
import { getDashboardSnapshot } from '@/utils/dashboard-snapshot'

/**
 * GET /api/dashboard/status
 * The signed-in member's live dashboard snapshot (unused passes + membership
 * status). The dashboard polls this so scans, cancellations, freezes and failed
 * payments show up without a manual refresh.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const snapshot = await getDashboardSnapshot(getServiceClient(), user.id)
  return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
}
