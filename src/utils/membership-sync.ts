import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { cashMembershipEnded } from '@/utils/membership-expiry'
import { DEFAULT_TIMEZONE } from '@/utils/timezone'
import { type LocalStatus } from '@/utils/stripe-status'
import { isCardMembership, verifyCardMembership } from '@/utils/card-membership'
import { fetchAll } from '@/utils/supabase-paging'

/**
 * Nightly safety net that brings every membership in line with reality, even
 * if nobody scans in or opens a page:
 *
 *   - Cash: an Active cash membership whose end date has arrived (gym time), or
 *     that has no end date at all, is set to Cancelled. The scanner already
 *     refuses it; this makes the dashboard, admin list and reports agree.
 *   - Card (Stripe): each membership is compared with its live Stripe
 *     subscription. If a webhook was missed (outage, bad secret, deploy), a
 *     failed payment still turns into Past_Due here, a paid one back into
 *     Active, and a cancelled/deleted one into Cancelled. A card membership with
 *     no Stripe subscription on record is looked up by Stripe customer, and
 *     cancelled if nothing is paying for it. Unknown payment methods are
 *     treated as card: they must be backed by Stripe.
 *
 * Comp (free) memberships are left alone.
 */

export interface SyncChange {
  householdId: string
  from: string
  to: LocalStatus
  reason: string
}

export interface SyncResult {
  checked: number
  updated: number
  errors: number
  changes: SyncChange[]
}

type Row = {
  household_id: string
  status: string
  payment_method: string | null
  end_date: string | null
  stripe_subscription_id: string | null
}

const SYNCED_STATUSES = ['Active', 'Past_Due', 'Frozen']

export async function syncMemberships(db: SupabaseClient, stripe: Stripe, now: Date = new Date()): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, updated: 0, errors: 0, changes: [] }

  const { data: facility } = await db.from('facilities').select('timezone').limit(1).maybeSingle()
  const timeZone = facility?.timezone || DEFAULT_TIMEZONE

  let rows: Row[]
  let households: { id: string; stripe_customer_id: string | null }[]
  try {
    ;[rows, households] = await Promise.all([
      fetchAll<Row>((from, to) => db
        .from('subscriptions')
        .select('household_id, status, payment_method, end_date, stripe_subscription_id')
        .in('status', SYNCED_STATUSES)
        .order('household_id')
        .range(from, to)),
      fetchAll<{ id: string; stripe_customer_id: string | null }>((from, to) => db
        .from('households')
        .select('id, stripe_customer_id')
        .not('stripe_customer_id', 'is', null)
        .order('id')
        .range(from, to)),
    ])
  } catch (e) {
    throw new Error(`Could not load memberships: ${(e as Error).message}`)
  }
  const customerByHousehold = new Map(households.map(h => [h.id, h.stripe_customer_id]))

  const apply = async (row: Row, values: Record<string, unknown>, to: LocalStatus, reason: string) => {
    // Only change the row if it still looks the way we read it (another update may have just landed)
    const { error: updateError } = await db
      .from('subscriptions')
      .update(values)
      .eq('household_id', row.household_id)
      .eq('status', row.status)
    if (updateError) {
      result.errors++
      console.error('[membership-sync] Update failed for', row.household_id, updateError.message)
      return
    }
    if (row.status !== to) {
      result.updated++
      result.changes.push({ householdId: row.household_id, from: row.status, to, reason })
    }
  }

  for (const row of rows) {
    result.checked++
    const method = (row.payment_method ?? '').trim().toLowerCase()

    try {
      if (method === 'cash') {
        if (cashMembershipEnded(row, now, timeZone)) {
          await apply(row, { status: 'Cancelled' }, 'Cancelled', row.end_date ? `cash membership ended ${row.end_date.slice(0, 10)}` : 'cash membership has no end date')
        }
        continue
      }
      if (!isCardMembership(row)) continue // comp

      const v = await verifyCardMembership(stripe, row, customerByHousehold.get(row.household_id) ?? null)
      const endChanged = 'end_date' in v.update && v.update.end_date !== row.end_date?.slice(0, 10)
      const idChanged = 'stripe_subscription_id' in v.update
      if (row.status !== v.status || endChanged || idChanged) await apply(row, v.update, v.status, v.reason)
    } catch (err) {
      result.errors++
      console.error('[membership-sync] Could not check', row.household_id, (err as Error).message)
    }
  }

  return result
}
