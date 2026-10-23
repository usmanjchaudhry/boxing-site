import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { cashMembershipEnded } from '@/utils/membership-expiry'
import { DEFAULT_TIMEZONE } from '@/utils/timezone'
import { currentPeriod, localStatusFromStripe, type LocalStatus } from '@/utils/stripe-status'

/**
 * Nightly safety net that brings every membership in line with reality, even
 * if nobody scans in or opens a page:
 *
 *   - Cash: an Active cash membership whose end date has arrived (gym time) is
 *     set to Cancelled. The scanner already refuses it from 12:00 AM on the end
 *     date; this makes the dashboard, admin list and reports agree.
 *   - Card (Stripe): each membership is compared with its live Stripe
 *     subscription. If a webhook was missed (outage, bad secret, deploy), a
 *     failed payment still turns into Past_Due here, a paid one back into
 *     Active, and a cancelled/deleted one into Cancelled.
 *
 * Comp memberships are left alone.
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

function isMissingInStripe(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string }
  return e?.statusCode === 404 || e?.code === 'resource_missing'
}

export async function syncMemberships(db: SupabaseClient, stripe: Stripe, now: Date = new Date()): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, updated: 0, errors: 0, changes: [] }

  const { data: facility } = await db.from('facilities').select('timezone').limit(1).maybeSingle()
  const timeZone = facility?.timezone || DEFAULT_TIMEZONE

  const { data: rows, error } = await db
    .from('subscriptions')
    .select('household_id, status, payment_method, end_date, stripe_subscription_id')
    .in('status', SYNCED_STATUSES)
  if (error) throw new Error(`Could not load memberships: ${error.message}`)

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

  for (const row of (rows ?? []) as Row[]) {
    result.checked++
    const method = (row.payment_method ?? '').toLowerCase()

    try {
      if (method === 'cash') {
        if (cashMembershipEnded(row, now, timeZone)) {
          await apply(row, { status: 'Cancelled' }, 'Cancelled', `cash membership ended ${row.end_date?.slice(0, 10)}`)
        }
        continue
      }
      if (method === 'comp' || !row.stripe_subscription_id) continue

      let to: LocalStatus
      let values: Record<string, unknown>
      let reason: string
      try {
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
        to = localStatusFromStripe(sub)
        const { start, end } = currentPeriod(sub)
        values = { status: to, ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) }
        reason = `Stripe status ${sub.status}`
      } catch (err) {
        if (!isMissingInStripe(err)) throw err
        to = 'Cancelled'
        values = { status: 'Cancelled' }
        reason = 'Stripe subscription no longer exists'
      }

      const endChanged = 'end_date' in values && values.end_date !== row.end_date?.slice(0, 10)
      if (row.status !== to || endChanged) await apply(row, values, to, reason)
    } catch (err) {
      result.errors++
      console.error('[membership-sync] Could not check', row.household_id, (err as Error).message)
    }
  }

  return result
}
