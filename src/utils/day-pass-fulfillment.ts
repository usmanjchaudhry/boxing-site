import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Day pass fulfilment (server-only), shared by the Stripe webhook and the
 * checkout success page so a paid checkout gives exactly ONE pass:
 *
 *   - Only call this for a checkout session whose payment_status is 'paid'.
 *   - The pass id is derived from the checkout session id, so whichever of the
 *     webhook / success page runs second (or a reload of the success page, or a
 *     re-delivered webhook) hits the same primary key and adds nothing.
 */

/** Deterministic UUID for the pass bought in this checkout session. */
export function dayPassIdForSession(sessionId: string): string {
  const h = createHash('sha256').update(`day-pass:${sessionId}`).digest('hex')
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Mint the pass for a paid checkout. 'already' when it was minted before. */
export async function fulfillDayPass(
  db: SupabaseClient,
  sessionId: string,
  profileId: string
): Promise<'minted' | 'already'> {
  const { error } = await db.from('passes').insert({
    id: dayPassIdForSession(sessionId),
    profile_id: profileId,
    pass_type: 'Day Pass',
    status: 'Available',
  })
  if (!error) return 'minted'
  if (error.code === '23505') return 'already' // same session already fulfilled
  throw new Error(`Failed to mint pass: ${error.message}`)
}

