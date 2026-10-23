/**
 * Check-in code parsing — shared by the browser (scanner UI) and the server (API).
 *
 * Member QR codes currently encode the raw profile UUID. We extract the first
 * UUID found anywhere in the scanned text so the system keeps working if the
 * QR payload format ever changes (e.g. to a URL like https://…/m/<uuid>), and
 * so stray prefix/suffix characters from a misconfigured scanner are ignored.
 */
import type { MembershipSummary } from '@/utils/membership-billing'

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function extractProfileId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.trim().match(UUID_PATTERN)
  return match ? match[0].toLowerCase() : null
}

export type CheckinMethod = 'qr_scanner' | 'front_desk_manual'

export type CheckinStatus = 'allowed' | 'denied' | 'error'

/** Shape returned by POST /api/checkin */
export interface CheckinResult {
  status: CheckinStatus
  flag: string
  message: string
  member?: { id: string; first_name: string; last_name: string; date_of_birth: string | null }
  plan?: { name: string }
  /**
   * The household membership behind this scan (plan, how it's paid, amount,
   * cash end date). Present whenever the member's household has a membership,
   * on allowed AND denied scans. Absent for day-pass entries and people with
   * no membership.
   */
  membership?: MembershipSummary
  /** true when the member was already checked in moments ago (no new log row, no pass consumed) */
  duplicate?: boolean
}
