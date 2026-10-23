import { formatEndDate } from '@/utils/membership-expiry'
import { addDays } from '@/utils/timezone'

/**
 * How a household's membership is paid for, in one place, so the scanner
 * (and anything added later) describes billing the same way.
 *
 * Safe to import in the browser: no server-only dependencies.
 *
 * Where each number comes from:
 *   - Stripe: the plan's price. Each Stripe price has its own plan row (new
 *     prices get new rows, e.g. "Legacy Unlimited"), so the plan price is what
 *     Stripe charges. Stripe discounts/coupons are not reflected.
 *   - Cash:   the most recent cash payment recorded for this membership (staff
 *     can enter a custom amount), or the plan price if none is recorded.
 *   - Comp:   free.
 */

/** subscriptions.payment_method values we know. Anything else shows as "other". */
export type PaymentType = 'stripe' | 'cash' | 'comp' | 'other'

export interface MembershipSummary {
  planName: string
  /** subscriptions.status, e.g. Active, Past_Due, Frozen, Cancelled */
  status: string
  paymentType: PaymentType
  /** The raw payment_method, so a new value still shows something sensible. */
  paymentMethod: string | null
  /** What they pay each period, in cents. null when unknown. */
  amountCents: number | null
  /** membership_plans.billing_interval. null = monthly (how every plan is sold today). */
  interval: string | null
  /** Cash only: date of the most recent cash payment (YYYY-MM-DD). */
  lastPaidOn: string | null
  /** Cash only: the membership ends at the START of this date, gym time (YYYY-MM-DD). */
  endDate: string | null
  /**
   * Cash only: days they can still train, counting today (gym time).
   * 1 = today is the last day, 0 or less = already ended.
   */
  daysLeft: number | null
  /** household_members.role: Primary or Dependent. */
  householdRole: string | null
}

export function paymentTypeOf(paymentMethod: string | null | undefined): PaymentType {
  switch ((paymentMethod ?? '').trim().toLowerCase()) {
    case 'stripe': return 'stripe'
    case 'cash': return 'cash'
    case 'comp': return 'comp'
    default: return 'other'
  }
}

export function paymentTypeLabel(type: PaymentType, raw?: string | null): string {
  switch (type) {
    case 'stripe': return 'Card (Stripe)'
    case 'cash': return 'Cash'
    case 'comp': return 'Comp (free)'
    default: return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Unknown payment'
  }
}

/** "$225" or "$225.50" */
export function formatMoney(cents: number): string {
  const whole = cents % 100 === 0
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

/** "/mo", "/yr", "/wk". Unknown/null intervals are treated as monthly, matching the rest of the site. */
export function intervalSuffix(interval: string | null | undefined): string {
  switch ((interval ?? '').trim().toLowerCase()) {
    case '':
    case 'month': return '/mo'
    case 'year': return '/yr'
    case 'week': return '/wk'
    case 'day': return '/day'
    default: return `/${interval}`
  }
}

export function householdRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null
  if (role === 'Primary') return 'Account holder'
  if (role === 'Dependent') return 'Household member'
  return role
}

/** "12 days left", "last day tomorrow", "last day today", or null once ended. */
export function daysLeftLabel(daysLeft: number | null): string | null {
  if (daysLeft == null || daysLeft <= 0) return null
  if (daysLeft === 1) return 'last day today'
  if (daysLeft === 2) return 'last day tomorrow'
  return `${daysLeft} days left`
}

export interface BillingDetail {
  /** Stable id for the fact, for styling/tests: method, amount, paid, end, role */
  key: 'method' | 'amount' | 'paid' | 'end' | 'role'
  text: string
  /** Draw attention (e.g. a cash membership about to run out, or already ended). */
  warn?: boolean
}

/**
 * Short billing facts for staff, in display order, e.g.
 *   Stripe: Card (Stripe) · $225/mo · Account holder
 *   Cash:   Cash · Paid $200 on Oct 1, 2026 · Good through Oct 30, 2026 (10 days left) · Household member
 *   Comp:   Comp (free) · Account holder
 */
export function billingDetails(m: MembershipSummary): BillingDetail[] {
  const parts: BillingDetail[] = [{ key: 'method', text: paymentTypeLabel(m.paymentType, m.paymentMethod) }]

  if (m.paymentType === 'cash') {
    if (m.amountCents != null) {
      parts.push({ key: 'paid', text: `Paid ${formatMoney(m.amountCents)}${m.lastPaidOn ? ` on ${formatEndDate(m.lastPaidOn)}` : ''}` })
    }
    if (!m.endDate) {
      parts.push({ key: 'end', text: 'No end date set', warn: true })
    } else if (m.daysLeft != null && m.daysLeft <= 0) {
      parts.push({ key: 'end', text: `Ended ${formatEndDate(m.endDate)}`, warn: true })
    } else {
      // end_date is the first day they can NOT train, so show the day before.
      const left = daysLeftLabel(m.daysLeft)
      parts.push({
        key: 'end',
        text: `Good through ${formatEndDate(addDays(m.endDate.slice(0, 10), -1))}${left ? ` (${left})` : ''}`,
        warn: endsSoon(m),
      })
    }
  } else if (m.paymentType !== 'comp' && m.amountCents != null) {
    parts.push({ key: 'amount', text: `${formatMoney(m.amountCents)}${intervalSuffix(m.interval)}` })
  }

  const role = householdRoleLabel(m.householdRole)
  if (role) parts.push({ key: 'role', text: role })

  return parts
}

/** True when a cash membership has `days` or fewer training days left (remind them to renew). */
export function endsSoon(m: MembershipSummary, days = 3): boolean {
  return m.paymentType === 'cash' && m.daysLeft != null && m.daysLeft >= 1 && m.daysLeft <= days
}
