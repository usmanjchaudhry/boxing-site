import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveDailyLimit } from '@/utils/plan-rules'
import { LEGACY_ACCESS_CODE, LEGACY_PLAN_NAME, LEGACY_ACCESS_MAX_AGE_SECONDS } from '@/utils/legacy-access'

/**
 * Live facts the staff User's Guide shows (prices, who a plan covers, the
 * Legacy code), read from the same tables the site sells from so the guide
 * never drifts from reality. Server-only: pass the result to the client as props.
 */
export interface GuidePlan {
  name: string
  price: string            // "$225"
  /** Different household members the plan lets in per day (null = no limit). */
  peoplePerDay: number | null
  individual: boolean      // covers the account holder only
}

export interface GuideFacts {
  plans: GuidePlan[]
  dayPass: { name: string; price: string } | null
  legacy: { name: string; price: string; code: string; unlockMinutes: number } | null
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

type PlanRow = {
  name: string
  price_cents: number
  max_dependents: number | null
  max_daily_checkins: number | null
}

const toGuidePlan = (p: PlanRow): GuidePlan => ({
  name: p.name,
  price: money(p.price_cents),
  peoplePerDay: effectiveDailyLimit(p),
  individual: p.max_dependents === 0,
})

export async function getGuideFacts(db: SupabaseClient): Promise<GuideFacts> {
  const [{ data: plans }, { data: legacy }, { data: passes }] = await Promise.all([
    // Plans customers can buy on the Memberships page
    db.from('membership_plans')
      .select('name, price_cents, max_dependents, max_daily_checkins')
      .eq('is_active', true)
      .not('stripe_price_id', 'is', null)
      .order('price_cents', { ascending: true }),
    // Hidden plan unlocked with the Legacy code (same lookup as the hidden page)
    db.from('membership_plans')
      .select('name, price_cents, max_dependents, max_daily_checkins')
      .eq('name', LEGACY_PLAN_NAME)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    db.from('products')
      .select('name, price_cents')
      .eq('is_active', true)
      .eq('category', 'DayPass')
      .order('price_cents', { ascending: true })
      .limit(1),
  ])

  const pass = passes?.[0]
  return {
    plans: (plans ?? []).map(toGuidePlan),
    dayPass: pass ? { name: pass.name, price: money(pass.price_cents) } : null,
    legacy: legacy
      ? {
          name: legacy.name,
          price: money(legacy.price_cents),
          code: LEGACY_ACCESS_CODE,
          unlockMinutes: Math.round(LEGACY_ACCESS_MAX_AGE_SECONDS / 60),
        }
      : null,
  }
}
