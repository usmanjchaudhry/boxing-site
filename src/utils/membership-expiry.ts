import { DEFAULT_TIMEZONE, localDateString } from '@/utils/timezone'

/**
 * When a cash membership ends. One rule shared by the scanner, the member's
 * dashboard, the admin member list and reports, so they always agree.
 *
 * A cash membership ends at the START of its end date in the gym's timezone:
 * paid Oct 1 for 30 days (end_date Oct 31) -> can train Oct 1 to Oct 30.
 * (Comparing to `new Date(end_date)` used UTC midnight, which in Los Angeles is
 * 5 PM the day before, so members lost their last evening.)
 *
 * Card (Stripe) memberships never end by date here: Stripe tells us through
 * webhooks when they're cancelled or a payment fails.
 */
export function cashMembershipEnded(
  sub: { status?: string | null; payment_method?: string | null; end_date?: string | null } | null | undefined,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): boolean {
  if (!sub || sub.status !== 'Active' || sub.payment_method !== 'cash' || !sub.end_date) return false
  return localDateString(now, timeZone) >= sub.end_date.slice(0, 10)
}

/** "Oct 31, 2026" for a 'YYYY-MM-DD' date, without timezone shifting. */
export function formatEndDate(endDate: string): string {
  return new Date(`${endDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
