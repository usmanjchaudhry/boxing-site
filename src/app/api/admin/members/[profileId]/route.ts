import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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

// PATCH /api/admin/members/[profileId] — Update member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params

  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })
  }

  const { role } = await request.json()

  if (!['member', 'staff', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const db = getAdminSupabase()

  // Only allow role changes on profiles with an auth_user_id (logged-in users, not dependents)
  const { data: target } = await db
    .from('profiles')
    .select('id, auth_user_id, first_name, last_name')
    .eq('id', profileId)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (!target.auth_user_id) {
    return NextResponse.json({ 
      error: `${target.first_name} ${target.last_name} is a dependent without a login account. Only users with login access can be assigned roles.` 
    }, { status: 400 })
  }

  // Prevent admins from demoting themselves
  if (target.id === admin.id && role !== 'admin') {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
  }

  const { error } = await db
    .from('profiles')
    .update({ role })
    .eq('id', profileId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ 
    success: true, 
    message: `${target.first_name} ${target.last_name} is now a ${role}` 
  })
}
