'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button
      type="button"
      id="print-waiver"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black hover:bg-zinc-200"
    >
      <Printer className="w-4 h-4" /> Print / Save PDF
    </button>
  )
}
