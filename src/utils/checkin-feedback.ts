import type { CheckinResult } from '@/utils/checkin-code'

/**
 * How the front desk should read a check-in result: its color and the next
 * step for staff. Shared by the scanner and the staff User's Guide so the
 * guide always shows the same colors and advice as the scanner screen.
 */
export type CheckinTone = 'success' | 'warning' | 'error'

export function classify(result: Pick<CheckinResult, 'status' | 'flag'>): { tone: CheckinTone; staffAction?: string } {
  if (result.status === 'allowed') return { tone: 'success' }
  switch (result.flag) {
    case 'Waiver Required':
      return { tone: 'warning', staffAction: 'Have them open the app and sign the waiver, then scan again.' }
    case 'Payment Due':
      return { tone: 'warning', staffAction: 'Their card payment failed. Ask the owner to help update their card, or sell a day pass for today.' }
    case 'Membership Expired':
      return { tone: 'warning', staffAction: 'Offer a renewal or record a cash payment in Admin.' }
    case 'Daily Limit Reached':
      return { tone: 'warning', staffAction: 'Their plan has used today\u2019s household check-ins. Offer a day pass.' }
    case 'Membership Frozen':
      return { tone: 'error', staffAction: 'An admin can unfreeze it in Admin \u2192 Members. Or offer a day pass.' }
    case 'Membership Cancelled':
      return { tone: 'error', staffAction: 'Offer to re-subscribe, record a cash payment, or sell a day pass.' }
    case 'Day Pass Used':
      return { tone: 'error', staffAction: 'A day pass is one entry. They need another day pass or a membership.' }
    default:
      return { tone: 'error', staffAction: result.status === 'denied' ? 'Offer a day pass or a membership.' : undefined }
  }
}
