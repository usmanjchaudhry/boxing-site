export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CheckinScanner from '@/components/CheckinScanner'
import { getStaffProfile } from '@/utils/auth/staff'

export const metadata: Metadata = {
  title: 'Front Desk Check-in | La Familia Showtime Boxing',
  robots: { index: false, follow: false },
}

/**
 * Dedicated front-desk kiosk view. No site navbar, so nothing on the page
 * can steal keyboard focus from the scanner. Staff/admin only.
 */
export default async function CheckinPage() {
  const staff = await getStaffProfile('staff')
  if (!staff) redirect('/login')

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-white">
      <header className="border-b border-white/5 bg-zinc-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Admin
          </Link>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
            La Familia <span className="text-red-500">·</span> Front Desk
          </p>
          <span className="w-16" />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="sr-only">Front Desk Check-in</h1>
        <CheckinScanner />
      </main>
    </div>
  )
}
