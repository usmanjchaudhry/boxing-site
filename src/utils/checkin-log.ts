import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, localDateString, zonedMidnightUtc } from '@/utils/timezone'

/**
 * Check-in log (read model for the staff "Check-ins" tab).
 *
 * gym_checkins records every scan. How someone got in is derived from the row:
 *   - Success with a pass_id    -> they used a pass (Day Pass, Guest Pass, ...)
 *   - Success without a pass_id -> their household membership
 *   - not Success               -> denied, nothing was used (a denied scan may still
 *                                  carry the pass it would have used; it isn't consumed)
 */

export type AccessKind = 'day_pass' | 'membership' | 'none'
export type ResultFilter = 'all' | 'allowed' | 'denied'
export type AccessFilter = 'all' | 'membership' | 'day_pass'

export interface CheckinLogFilters {
  from: string          // 'YYYY-MM-DD' (facility local date, inclusive)
  to: string            // 'YYYY-MM-DD' (facility local date, inclusive)
  result: ResultFilter
  access: AccessFilter
  q: string             // member name search
  offset: number
  limit: number
}

export interface CheckinLogRow {
  id: string
  scannedAt: string     // ISO timestamp
  localDate: string     // 'YYYY-MM-DD' in facility timezone (for day grouping)
  localTime: string     // e.g. '3:42 PM' in facility timezone
  method: string
  allowed: boolean
  statusFlag: string
  reason: string | null // human reason when denied
  member: { id: string; name: string }
  access: { kind: AccessKind; label: string; detail: string | null }
}

export interface CheckinLogSummary {
  total: number
  allowed: number
  denied: number
  membership: number
  dayPass: number
}

export interface CheckinLogResponse {
  rows: CheckinLogRow[]
  total: number         // rows matching all filters
  hasMore: boolean
  summary: CheckinLogSummary // date range + search only (ignores result/access filters)
  range: { from: string; to: string; today: string; timezone: string }
}

export const MAX_RANGE_DAYS = 366
export const MAX_PAGE_SIZE = 200

const DENIED_REASONS: Record<string, string> = {
  'Waiver Expired': 'No signed waiver',
  'Payment Due': 'Payment due',
  'No Active Pass': 'No active membership or pass',
}

/** Pure: how a logged scan got (or didn't get) access. */
export function describeAccess(
  row: { status_flag: string; pass_id: string | null },
  passType: string | null,
  planName: string | null
): CheckinLogRow['access'] {
  if (row.status_flag !== 'Success') return { kind: 'none', label: 'None', detail: null }
  if (row.pass_id) return { kind: 'day_pass', label: passType || 'Day Pass', detail: null }
  return { kind: 'membership', label: 'Membership', detail: planName }
}

/** Profile ids whose name matches every word of `q` (case-insensitive). */
async function searchProfileIds(db: SupabaseClient, q: string): Promise<string[]> {
  // Only letters, digits, spaces, apostrophes and hyphens: keeps the PostgREST filter safe
  const words = q.toLowerCase().replace(/[^\p{L}\p{N}' -]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 4)
  if (words.length === 0) return []
  const or = words.flatMap(w => [`first_name.ilike.*${w}*`, `last_name.ilike.*${w}*`]).join(',')
  const { data } = await db.from('profiles').select('id, first_name, last_name').or(or).limit(500)
  return (data ?? [])
    .filter(p => {
      const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase()
      return words.every(w => full.includes(w))
    })
    .map(p => p.id)
}

/** Current plan name per profile (via household subscription). */
async function planNamesFor(db: SupabaseClient, profileIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (profileIds.length === 0) return out
  const { data: hms } = await db
    .from('household_members')
    .select('profile_id, household_id')
    .in('profile_id', profileIds)
  const householdIds = [...new Set((hms ?? []).map(h => h.household_id))]
  if (householdIds.length === 0) return out
  const { data: subs } = await db
    .from('subscriptions')
    .select('household_id, membership_plans(name)')
    .in('household_id', householdIds)
  const planByHousehold = new Map<string, string>()
  for (const s of subs ?? []) {
    const joined = s.membership_plans as unknown
    const plan = (Array.isArray(joined) ? joined[0] : joined) as { name?: string } | null
    if (plan?.name) planByHousehold.set(s.household_id, plan.name)
  }
  for (const h of hms ?? []) {
    const name = planByHousehold.get(h.household_id)
    if (name) out.set(h.profile_id, name)
  }
  return out
}

export async function listCheckins(
  db: SupabaseClient,
  filters: CheckinLogFilters,
  timeZone: string
): Promise<CheckinLogResponse> {
  const today = localDateString(new Date(), timeZone)
  const range = { from: filters.from, to: filters.to, today, timezone: timeZone }
  const empty: CheckinLogResponse = {
    rows: [], total: 0, hasMore: false,
    summary: { total: 0, allowed: 0, denied: 0, membership: 0, dayPass: 0 },
    range,
  }

  const startIso = zonedMidnightUtc(filters.from, timeZone).toISOString()
  const endIso = zonedMidnightUtc(addDays(filters.to, 1), timeZone).toISOString()

  let profileIds: string[] | null = null
  if (filters.q.trim()) {
    profileIds = await searchProfileIds(db, filters.q)
    if (profileIds.length === 0) return empty
  }

  // Scope shared by every query: date range (+ name search)
  type Q = ReturnType<ReturnType<SupabaseClient['from']>['select']>
  const scoped = (q: Q): Q => {
    let s = q.gte('scanned_at', startIso).lt('scanned_at', endIso)
    if (profileIds) s = s.in('profile_id', profileIds)
    return s
  }
  const count = (apply: (q: Q) => Q = q => q) =>
    apply(scoped(db.from('gym_checkins').select('id', { count: 'exact', head: true })))
  const withResult = (q: Q, r: ResultFilter): Q =>
    r === 'allowed' ? q.eq('status_flag', 'Success') : r === 'denied' ? q.neq('status_flag', 'Success') : q
  const withAccess = (q: Q, a: AccessFilter): Q =>
    a === 'day_pass' ? q.not('pass_id', 'is', null).eq('status_flag', 'Success')
      : a === 'membership' ? q.is('pass_id', null).eq('status_flag', 'Success')
      : q

  const pageQuery = withAccess(
    withResult(
      scoped(db.from('gym_checkins').select(
        'id, scanned_at, checkin_method, status_flag, pass_id, profile_id, profiles(id, first_name, last_name), passes(pass_type)',
        { count: 'exact' }
      )),
      filters.result
    ),
    filters.access
  )
    .order('scanned_at', { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1)

  const [page, total, allowed, membership, dayPass] = await Promise.all([
    pageQuery,
    count(),
    count(q => q.eq('status_flag', 'Success')),
    count(q => q.is('pass_id', null).eq('status_flag', 'Success')),
    count(q => q.not('pass_id', 'is', null).eq('status_flag', 'Success')),
  ])
  if (page.error) throw new Error(page.error.message)

  type Raw = {
    id: string; scanned_at: string; checkin_method: string; status_flag: string
    pass_id: string | null; profile_id: string
    profiles: unknown; passes: unknown
  }
  const raw = (page.data ?? []) as unknown as Raw[]
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null

  const membershipProfileIds = [...new Set(raw.filter(r => !r.pass_id && r.status_flag === 'Success').map(r => r.profile_id))]
  const plans = await planNamesFor(db, membershipProfileIds)

  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
  const rows: CheckinLogRow[] = raw.map(r => {
    const p = one<{ id: string; first_name: string | null; last_name: string | null }>(r.profiles)
    const pass = one<{ pass_type: string | null }>(r.passes)
    const when = new Date(r.scanned_at)
    const allowedRow = r.status_flag === 'Success'
    return {
      id: r.id,
      scannedAt: r.scanned_at,
      localDate: localDateString(when, timeZone),
      localTime: timeFmt.format(when),
      method: r.checkin_method,
      allowed: allowedRow,
      statusFlag: r.status_flag,
      reason: allowedRow ? null : (DENIED_REASONS[r.status_flag] ?? r.status_flag),
      member: { id: r.profile_id, name: p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Member' : 'Unknown member' },
      access: describeAccess(r, pass?.pass_type ?? null, plans.get(r.profile_id) ?? null),
    }
  })

  const matching = page.count ?? rows.length
  const totalCount = total.count ?? 0
  const allowedCount = allowed.count ?? 0
  return {
    rows,
    total: matching,
    hasMore: filters.offset + rows.length < matching,
    summary: {
      total: totalCount,
      allowed: allowedCount,
      denied: totalCount - allowedCount,
      membership: membership.count ?? 0,
      dayPass: dayPass.count ?? 0,
    },
    range,
  }
}
