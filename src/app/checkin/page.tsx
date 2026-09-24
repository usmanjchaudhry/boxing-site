export const dynamic = 'force-dynamic'

import CheckinScanner from '@/components/CheckinScanner'
import Navbar from '@/components/Navbar'

export default function CheckinPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black mb-2">Front Desk Check-in</h1>
          <p className="text-zinc-400">Scan a member&apos;s QR code or enter their ID manually.</p>
        </div>
        <CheckinScanner />
      </main>
    </div>
  )
}
