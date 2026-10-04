import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The parts of a member's dashboard that can change from outside the page
 * (front-desk scans, Stripe webhooks, admin actions). The dashboard renders
 * with one snapshot and polls for a fresh one; any difference triggers a refresh.
 *
 * Callers pass a service-role client; everything is scoped to the signed-in
 * user's own household.
 */
export interface DashboardSnapshot {
  availablePassIds: string[]          // unused passes for anyone in the household
  membershipStatus: string | null     // 'Active' | 'Frozen' | 'Past_Due' | 'Cancelled' | null (no membership)
}

export const EMPTY_SNAPSHOT: DashboardSnapshot = { availablePassIds: [], membershipStatus: null }

export async function getDashboardSnapshot(db: SupabaseClient, authUserId: string): Promise<DashboardSnapshot> {
  const { data: me } = await db.from('profiles').select('id').eq('auth_user_id', authUserId).maybeSingle()
  if (!me) return EMPTY_SNAPSHOT

  const { data: hm } = await db.from('household_members').select('household_id').eq('profile_id', me.id).maybeSingle()
  if (!hm) {
    return { availablePassIds: await availablePassIds(db, [me.id]), membershipStatus: null }
  }

  const [{ data: members }, { data: sub }] = await Promise.all([
    db.from('household_members').select('profile_id').eq('household_id', hm.household_id),
    db.from('subscriptions').select('status').eq('household_id', hm.household_id).limit(1).maybeSingle(),
  ])
  const ids = (members ?? []).map(m => m.profile_id)
  return {
    availablePassIds: await availablePassIds(db, ids.length ? ids : [me.id]),
    membershipStatus: sub?.status ?? null,
  }
}

async function availablePassIds(db: SupabaseClient, profileIds: string[]): Promise<string[]> {
  const { data } = await db.from('passes').select('id').in('profile_id', profileIds).eq('status', 'Available')
  return (data ?? []).map(p => p.id).sort()
}
