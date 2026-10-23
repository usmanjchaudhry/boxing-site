import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/utils/stripe/server'
import { syncMemberships } from '@/utils/membership-sync'

/**
 * Nightly membership sync (Vercel Cron, see vercel.json): cancels cash
 * memberships whose time is up and corrects card memberships from Stripe.
 * Runs just after midnight gym time.
 */

// Protect this endpoint so only Vercel Cron can call it (same rule as the other crons)
function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  // Allow in development
  if (process.env.NODE_ENV === 'development') return true
  return false
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  try {
    const results = await syncMemberships(db, stripe)
    console.log('[cron/memberships] Done:', JSON.stringify(results))
    return NextResponse.json({ message: 'Memberships synced', results, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[cron/memberships] Failed:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
