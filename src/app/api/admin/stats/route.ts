import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Verify the requesting user is admin or staff
async function verifyAdmin(requiredRole: 'staff' | 'admin' = 'staff') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminDb = getAdminSupabase()
  const { data: profile } = await adminDb
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) return null
  
  if (requiredRole === 'admin' && profile.role !== 'admin') return null
  if (requiredRole === 'staff' && !['admin', 'staff'].includes(profile.role)) return null
  
  return profile
}

// GET /api/admin/stats — Dashboard overview stats
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin('staff')
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = getAdminSupabase()

  // Get today's date range
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  // Parallel queries for performance
  const [
    membersResult,
    activeSubsResult,
    todayCheckinsResult,
    recentCheckinsResult
  ] = await Promise.all([
    // Total members
    db.from('profiles').select('id', { count: 'exact', head: true }),
    // Active subscriptions
    db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
    // Today's check-ins
    db.from('gym_checkins').select('id', { count: 'exact', head: true }).gte('scanned_at', todayISO),
    // Recent check-ins (last 20)
    db.from('gym_checkins')
      .select('id, scanned_at, checkin_method, status_flag, profiles(first_name, last_name)')
      .order('scanned_at', { ascending: false })
      .limit(20)
  ])

  return NextResponse.json({
    stats: {
      totalMembers: membersResult.count || 0,
      activeSubscriptions: activeSubsResult.count || 0,
      todayCheckins: todayCheckinsResult.count || 0,
    },
    recentCheckins: recentCheckinsResult.data || []
  })
}
