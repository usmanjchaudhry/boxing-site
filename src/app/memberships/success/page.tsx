import Link from 'next/link'
import Navbar from '@/components/Navbar'

export default function MembershipSuccessPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">✓</span>
          </div>
          <h1 className="text-3xl font-black mb-3">You&apos;re All Set!</h1>
          <p className="text-zinc-400 mb-8">
            Your membership is now active. Welcome to the team — let&apos;s get to work.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-8 py-3 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-colors active:scale-95 shadow-[0_0_20px_-5px_rgba(220,38,38,0.5)]"
          >
            Go to Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
