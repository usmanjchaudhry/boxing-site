'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Finger / mouse / stylus signature pad.
 * Uses pointer events and scales coordinates to the canvas, so the ink lands
 * under the finger on any screen size (the old pad drifted on phones).
 * Calls onChange with a PNG data URL after each stroke, or null when cleared.
 */
export default function SignaturePad({
  onChange,
  id = 'signature-pad',
}: {
  onChange: (dataUrl: string | null) => void
  id?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const inkRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  const paintBackground = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    paintBackground()
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const p = point(e)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = Math.max(2, canvas.width / 260)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!inkRef.current) {
      inkRef.current = true
      setHasInk(true)
    }
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (inkRef.current) onChange(canvasRef.current!.toDataURL('image/png'))
  }

  const clear = () => {
    paintBackground()
    inkRef.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <label htmlFor={id} className="text-sm font-semibold text-white">Draw your signature</label>
        <button
          type="button"
          id={`${id}-clear`}
          onClick={clear}
          className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="relative rounded-xl overflow-hidden border-2 border-white/15 bg-white">
        <canvas
          ref={canvasRef}
          id={id}
          aria-label="Signature pad"
          className="block w-full h-[150px] sm:h-[180px] cursor-crosshair touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-zinc-300 text-left text-xs text-zinc-400 pb-1">
            ✕ Sign here
          </span>
        )}
      </div>
    </div>
  )
}
