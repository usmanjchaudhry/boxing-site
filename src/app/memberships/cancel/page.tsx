import Link from 'next/link'
import Navbar from '@/components/Navbar'

export default function MembershipCancelPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-white/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">←</span>
          </div>
          <h1 className="text-3xl font-black mb-3">No Worries</h1>
          <p className="text-zinc-400 mb-8">
            Your checkout was cancelled. No charges were made. Come back when you&apos;re ready.
          </p>
          <Link
            href="/memberships"
            className="inline-block px-8 py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-zinc-200 transition-colors active:scale-95"
          >
            View Plans Again
          </Link>
        </div>
      </main>
    </div>
  )
}
