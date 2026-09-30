'use client'

import { useState } from 'react'
import MemberQRCode from './MemberQRCode'

export default function TicketCard({ pass }: { pass: any }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative bg-gradient-to-br from-red-950/30 to-black border border-red-500/30 rounded-xl overflow-hidden transition-all duration-300">
      <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>
      
      <div className="p-4 flex items-center justify-between relative z-10">
        <div>
          <p className="font-black text-red-400 uppercase tracking-wide text-sm">{pass.pass_type}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Valid for: {pass.owner_name}</p>
          <p className="text-[10px] text-zinc-500 mt-1">Bought: {new Date(pass.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500 shadow-[0_0_15px_-3px_rgba(220,38,38,0.4)] active:scale-95 transition-all"
        >
          {isOpen ? 'Close' : 'Use Ticket'}
        </button>
      </div>

      {/* Expanded QR Code Section */}
      <div className={`transition-all duration-500 ease-in-out overflow-hidden bg-black/50 ${isOpen ? 'max-h-[400px] border-t border-red-500/20' : 'max-h-0'}`}>
        <div className="p-6 flex flex-col items-center justify-center">
          <p className="text-zinc-400 text-xs mb-4 text-center">Scan this code at the front desk to enter.</p>
          <MemberQRCode profileId={pass.profile_id} name={pass.owner_name} />
        </div>
      </div>
    </div>
  )
}
