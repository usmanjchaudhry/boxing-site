/**
 * Date-of-birth helpers shared by the client input and server actions.
 * All values are ISO calendar dates (YYYY-MM-DD) with no time zone.
 */

export const MIN_DOB_YEAR = 1900

/** Builds YYYY-MM-DD from parts, or '' if any part is missing. */
export function toIsoDob(month: string, day: string, year: string): string {
  if (!month || !day || year.length !== 4) return ''
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/** Returns an error message, or null if `iso` is a real, past date of birth. */
export function dobError(iso: string, now: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return 'Enter your full date of birth.'
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12) return 'Month must be between 1 and 12.'
  // Day 0 of next month = last day of this month (handles leap years)
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  if (d < 1 || d > daysInMonth) return `That month only has ${daysInMonth} days.`
  if (y < MIN_DOB_YEAR) return `Year must be ${MIN_DOB_YEAR} or later.`
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (iso > today) return "Date of birth can't be in the future."
  return null
}

/** Whole years between `iso` and today. Assumes `iso` is valid. */
export function ageFromDob(iso: string, now: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number)
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--
  return age
}
