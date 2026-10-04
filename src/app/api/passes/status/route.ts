import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceClient } from '@/utils/auth/staff'
import { getAvailablePassIds } from '@/utils/household-members'

/**
 * GET /api/passes/status
 * Ids of the signed-in household's unused passes. The dashboard polls this so a
 * pass flips to "used" right after it's scanned at the front desk, no manual refresh.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const available = await getAvailablePassIds(getServiceClient(), user.id)
  return NextResponse.json({ available }, { headers: { 'Cache-Control': 'no-store' } })
}
