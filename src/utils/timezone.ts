/**
 * Facility-timezone date helpers.
 * Vercel runs in UTC, so "today" / "midnight" must be computed in the gym's
 * IANA timezone, never with Date#setHours.
 */

export const DEFAULT_TIMEZONE = 'America/Los_Angeles'

/** Wall-clock parts of `date` as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map(x => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second }
}

/** 'YYYY-MM-DD' for `date` in `timeZone`. */
export function localDateString(date: Date, timeZone: string): string {
  const { y, m, d } = zonedParts(date, timeZone)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Strict 'YYYY-MM-DD' check (real calendar date). */
export function isDateString(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** 'YYYY-MM-DD' shifted by `days` (pure calendar math, timezone-free). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (both 'YYYY-MM-DD'). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** UTC instant of local midnight at the start of `ymd` in `timeZone` (DST-safe). */
export function zonedMidnightUtc(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  let guess = target
  // Two passes settle the offset even on DST-change days
  for (let i = 0; i < 2; i++) {
    const seen = zonedParts(new Date(guess), timeZone)
    const seenAsUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.min, seen.s)
    guess += target - seenAsUtc
  }
  return new Date(guess)
}

/** UTC instant of local midnight "today" in `timeZone`. */
export function startOfTodayIn(timeZone: string): Date {
  return zonedMidnightUtc(localDateString(new Date(), timeZone), timeZone)
}
