'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function checkLegacyPassword(password: string) {
  if (password !== 'deathbeforedishonor') {
    return { error: 'Invalid password' }
  }

  // Set a secure, HTTP-only cookie that expires in 1 hour
  const cookieStore = await cookies()
  cookieStore.set('legacy_access', 'granted', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60, // 1 hour
    path: '/'
  })

  // We don't need to return the plan ID here anymore, 
  // we just redirect them to the secret page!
  return { success: true }
}
