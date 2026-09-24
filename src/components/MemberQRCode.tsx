'use client'

import { QRCodeSVG } from 'qrcode.react'

export default function MemberQRCode({ profileId, name }: { profileId: string; name: string }) {
  const checkinUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/checkin?scan=${profileId}`

  return (
    <div className="flex flex-col items-center gap-3 bg-white rounded-2xl p-6">
      <QRCodeSVG
        value={profileId}
        size={160}
        level="H"
        bgColor="#ffffff"
        fgColor="#000000"
      />
      <p className="text-black text-xs font-bold text-center">{name}</p>
      <p className="text-zinc-400 text-[10px] font-mono break-all text-center">{profileId}</p>
    </div>
  )
}
