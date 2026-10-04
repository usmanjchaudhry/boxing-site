import { Users, CreditCard, ScanLine, ShieldCheck, Banknote, BarChart3, ClipboardList, BookOpen, type LucideIcon } from 'lucide-react'

/**
 * The admin dashboard tabs. One list drives both the tab bar and the
 * User's Guide's "what each tab is for" table, so they can never disagree.
 */
export type AdminTab = 'overview' | 'checkin' | 'checkins' | 'payments' | 'members' | 'cash' | 'reports' | 'guide'

export type StaffRole = 'admin' | 'staff'

export interface AdminTabDef {
  id: AdminTab
  label: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Plain-language purpose, shown in the User's Guide. */
  purpose: string
}

export const ADMIN_TABS: AdminTabDef[] = [
  { id: 'overview', label: 'Overview', icon: ShieldCheck, purpose: 'Quick numbers for today and the latest check-ins.' },
  { id: 'reports', label: 'Reports', icon: BarChart3, adminOnly: true, purpose: 'Charts of members, money, and visits over time.' },
  { id: 'checkin', label: 'Check-in Scanner', icon: ScanLine, purpose: 'Scan member QR codes at the front desk.' },
  { id: 'checkins', label: 'Check-ins', icon: ClipboardList, purpose: 'A list of everyone who scanned in, with dates and filters.' },
  { id: 'cash', label: 'Cash Payments', icon: Banknote, adminOnly: true, purpose: 'Turn on a membership for someone who paid in cash.' },
  { id: 'payments', label: 'Stripe Payments', icon: CreditCard, adminOnly: true, purpose: 'Card payments made on the website.' },
  { id: 'members', label: 'Members', icon: Users, purpose: 'Look up any member and their membership. Admins can freeze or cancel here.' },
  { id: 'guide', label: "User's Guide", icon: BookOpen, purpose: 'Step-by-step help (this page).' },
]

export const tabsForRole = (role: string): AdminTabDef[] =>
  ADMIN_TABS.filter(t => !t.adminOnly || role === 'admin')
