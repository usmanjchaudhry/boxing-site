import { createClient } from '@/utils/supabase/server'
import NavbarClient from './NavbarClient'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, role')
      .eq('auth_user_id', user.id)
      .single()
    profile = data
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'staff'

  return <NavbarClient profile={profile} isLoggedIn={!!user} isAdmin={isAdmin} />
}
