import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export type StaffRole = 'staff' | 'admin'

/** Service-role client that bypasses RLS. Server-only. */
export function getServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Returns the signed-in user's profile if they hold at least `minRole`, otherwise null.
 * 'staff' allows staff + admin; 'admin' allows admin only.
 */
export async function getStaffProfile(minRole: StaffRole = 'staff') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await getServiceClient()
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) return null
  const allowed = minRole === 'admin' ? ['admin'] : ['admin', 'staff']
  return allowed.includes(profile.role) ? profile : null
}
