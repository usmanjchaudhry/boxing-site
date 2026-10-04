import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Household lookups for buying a day pass on behalf of a family member.
 * Callers should pass a service-role client: these are server-side billing
 * reads, and prod RLS policies on households/household_members differ from dev.
 */

export type PassRecipient = { id: string; name: string; isSelf: boolean }

/** Everyone in the signed-in user's household a day pass can be bought for (self first). */
export async function getPassRecipients(db: SupabaseClient, authUserId: string): Promise<PassRecipient[]> {
  const { data: me } = await db
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (!me) return []

  const self: PassRecipient = { id: me.id, name: fullName(me), isSelf: true }

  const { data: hm } = await db
    .from('household_members')
    .select('household_id')
    .eq('profile_id', me.id)
    .maybeSingle()
  if (!hm) return [self]

  const { data: members } = await db
    .from('household_members')
    .select('profile_id')
    .eq('household_id', hm.household_id)
  const otherIds = (members ?? []).map(m => m.profile_id).filter(id => id !== me.id)
  if (otherIds.length === 0) return [self]

  const { data: others } = await db
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', otherIds)
    .is('deleted_at', null)
    .order('first_name', { ascending: true })

  return [self, ...(others ?? []).map(p => ({ id: p.id, name: fullName(p), isSelf: false }))]
}

/** True when `profileId` belongs to `householdId`. Used to stop buying passes for strangers. */
export async function isInHousehold(db: SupabaseClient, householdId: string, profileId: string): Promise<boolean> {
  const { data } = await db
    .from('household_members')
    .select('profile_id')
    .eq('household_id', householdId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return !!data
}

function fullName(p: { first_name: string | null; last_name: string | null }) {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Member'
}
