'use client'

import { QRCodeSVG } from 'qrcode.react'

export default function MemberQRCode({ profileId, name }: { profileId: string; name: string }) {
  return (
    <div className="flex flex-col items-center gap-3 bg-white rounded-2xl p-4 sm:p-6">
      <QRCodeSVG
        value={profileId}
        size={140}
        level="H"
        bgColor="#ffffff"
        fgColor="#000000"
        className="w-[120px] h-[120px] sm:w-[140px] sm:h-[140px]"
      />
      <p className="text-black text-xs font-bold text-center">{name}</p>
      <p className="text-zinc-400 text-[9px] sm:text-[10px] font-mono break-all text-center leading-tight">{profileId}</p>
    </div>
  )
}
