import type { NextPayment } from '@/utils/next-payment'
import { formatMoney, intervalSuffix } from '@/utils/membership-billing'

/** "Dec 3" (adds the year when it isn't this year), from 'YYYY-MM-DD' without timezone shifts. */
function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' })
}

function inDays(n: number): string {
  if (n <= 0) return 'today'
  if (n === 1) return 'tomorrow'
  return `in ${n} days`
}

/** Members table cell: when the household's next payment is due. */
export default function NextPaymentCell({ next, paidBy }: { next: NextPayment | undefined; paidBy?: string | null }) {
  const sub = (text: string, className = 'text-zinc-500') => <span className={`block text-[11px] ${className}`}>{text}</span>
  const payer = paidBy ? sub(`Paid by ${paidBy}`, 'text-zinc-600') : null

  switch (next?.kind) {
    case 'renews':
      return (
        <div className="text-xs">
          <span className="font-semibold text-zinc-200">{next.daysLeft < 0 ? 'Renewing' : `Renews ${shortDate(next.date)}`}</span>
          {sub([next.amountCents != null ? `${formatMoney(next.amountCents)}${intervalSuffix(next.interval)}` : null, next.daysLeft >= 0 ? inDays(next.daysLeft) : null, 'card'].filter(Boolean).join(' · '))}
          {payer}
        </div>
      )
    case 'due': {
      const soon = next.daysLeft <= 3
      return (
        <div className="text-xs">
          <span className={`font-semibold ${soon ? 'text-amber-400' : 'text-zinc-200'}`}>Due {shortDate(next.date)}</span>
          {sub([next.amountCents != null ? formatMoney(next.amountCents) : null, `${next.daysLeft} day${next.daysLeft === 1 ? '' : 's'} left`, 'cash'].filter(Boolean).join(' · '), soon ? 'text-amber-400/80' : 'text-zinc-500')}
          {payer}
        </div>
      )
    }
    case 'overdue':
      return (
        <div className="text-xs">
          <span className="font-semibold text-red-400">
            {next.reason === 'card_failed' ? 'Payment failed' : `Expired ${next.date ? shortDate(next.date) : ''}`.trim()}
          </span>
          {sub(next.reason === 'card_failed' ? 'Card needs updating' : 'Cash renewal needed', 'text-red-400/70')}
          {payer}
        </div>
      )
    case 'frozen':
      return <span className="text-xs font-semibold text-blue-400">Frozen</span>
    case 'free':
      return <span className="text-xs text-zinc-400">Free (comp)</span>
    default:
      return <span className="text-xs text-zinc-600">—</span>
  }
}

