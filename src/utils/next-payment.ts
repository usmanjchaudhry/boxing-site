import { daysBetween } from '@/utils/timezone'

/**
 * When a household's next membership payment is due, for the admin Members page.
 * Pure and browser-safe so the server computes it and the page just displays it.
 *
 *   Card (Stripe): end_date is the end of the current billing period, i.e. the
 *                  next charge date. Webhooks + the nightly sync keep it current.
 *   Cash:          end_date is the first day they can NOT train, so that is the
 *                  day the next payment is due.
 */
export type NextPayment =
  /** Card membership that renews automatically. */
  | { kind: 'renews'; date: string; daysLeft: number; amountCents: number | null; interval: string | null }
  /** Cash membership: pay by this date to keep training. */
  | { kind: 'due'; date: string; daysLeft: number; amountCents: number | null }
  /** Card payment failed (Past_Due) or the cash membership already ended. */
  | { kind: 'overdue'; date: string | null; reason: 'card_failed' | 'cash_ended' }
  | { kind: 'frozen' }
  /** Comp (free) membership. */
  | { kind: 'free' }
  /** No membership, cancelled, or not covered by the household plan. */
  | { kind: 'none' }

export interface NextPaymentInput {
  status: string | null
  paymentMethod: string | null
  endDate: string | null
  /** What they pay each period (plan price; for cash, the last amount they paid). */
  amountCents: number | null
  interval: string | null
}

export function nextPayment(sub: NextPaymentInput | null, todayIso: string): NextPayment {
  if (!sub) return { kind: 'none' }
  const method = (sub.paymentMethod ?? '').trim().toLowerCase()
  const date = sub.endDate ? sub.endDate.slice(0, 10) : null

  if (sub.status === 'Frozen') return { kind: 'frozen' }
  if (sub.status === 'Past_Due') return { kind: 'overdue', date, reason: 'card_failed' }
  if (sub.status !== 'Active') return { kind: 'none' }
  if (method === 'comp') return { kind: 'free' }

  if (method === 'cash') {
    if (!date) return { kind: 'none' }
    const daysLeft = daysBetween(todayIso, date)
    if (daysLeft <= 0) return { kind: 'overdue', date, reason: 'cash_ended' }
    return { kind: 'due', date, daysLeft, amountCents: sub.amountCents }
  }

  // Card (and anything else billed automatically)
  if (!date) return { kind: 'none' }
  return { kind: 'renews', date, daysLeft: daysBetween(todayIso, date), amountCents: sub.amountCents, interval: sub.interval }
}

