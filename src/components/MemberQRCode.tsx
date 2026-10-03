'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Maximize2, X, Sun } from 'lucide-react'

/**
 * Member check-in QR code.
 *
 * Built to be read from a phone screen by a 2D imager like the Eyoyo EY-2200:
 * - Error correction 'M': fewer, larger modules than 'H', so it's easier to read off a glossy screen
 * - A real quiet zone (white margin) around the code, which scanners need to find it
 * - Tap to open full screen: biggest code, pure white background, no other UI
 */
export default function MemberQRCode({ profileId, name }: { profileId: string; name: string }) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  return (
    <>
      <button
        type="button"
        id={`qr-open-${profileId}`}
        onClick={() => setFullscreen(true)}
        aria-label={`Show ${name}'s check-in code full screen`}
        className="group relative flex flex-col items-center gap-3 bg-white rounded-2xl p-4 sm:p-6 w-full transition-transform active:scale-[0.98] hover:shadow-[0_0_30px_-8px_rgba(255,255,255,0.35)]"
      >
        <QRCodeSVG
          value={profileId}
          size={180}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
          className="w-[150px] h-[150px] sm:w-[170px] sm:h-[170px]"
        />
        <p className="text-black text-sm font-bold text-center">{name}</p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 group-hover:text-black transition-colors">
          <Maximize2 className="w-3 h-3" /> Tap to enlarge for check-in
        </span>
      </button>

      {fullscreen && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} check-in code`}
          onClick={() => setFullscreen(false)}
          className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-black animate-[qrFade_.15s_ease-out]"
        >
          <button
            id="qr-close"
            onClick={() => setFullscreen(false)}
            aria-label="Close"
            className="absolute top-5 right-5 p-3 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-400 mb-6">La Familia · Check-in</p>
          <QRCodeSVG
            value={profileId}
            size={512}
            level="M"
            marginSize={4}
            bgColor="#ffffff"
            fgColor="#000000"
            className="w-[min(82vw,60vh,420px)] h-[min(82vw,60vh,420px)]"
          />
          <p className="mt-6 text-2xl sm:text-3xl font-black text-center">{name}</p>
          <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500 text-center">
            <Sun className="w-4 h-4" /> Turn brightness up and hold 4–8 in. from the scanner
          </p>
          <style>{`@keyframes qrFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </div>,
        document.body
      )}
    </>
  )
}
