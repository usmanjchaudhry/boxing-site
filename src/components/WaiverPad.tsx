'use client'

import { useRef, useState, useEffect } from 'react'

export default function WaiverPad({
  waiverText,
  participantId,
  participantName,
  onSign
}: {
  waiverText: string
  participantId: string
  participantName: string
  onSign: (signatureDataUrl: string, participantId: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSigned, setHasSigned] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Setup canvas context
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set white background
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'black'
  }, [])

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    setIsDrawing(true)
    const rect = canvas.getBoundingClientRect()
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY

    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY

    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
    setHasSigned(true)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearPad = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSigned(false)
  }

  const handleSubmit = async () => {
    if (!hasSigned) return
    const canvas = canvasRef.current
    if (!canvas) return
    
    setIsSubmitting(true)
    const dataUrl = canvas.toDataURL('image/png')
    
    try {
      await onSign(dataUrl, participantId)
      window.location.reload() // Force Next.js to re-render the Server Component and remove the Gatekeeper
    } catch (error: any) {
      alert("Failed to save waiver: " + error.message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-full">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-black/50">
          <h2 className="text-2xl font-black text-white">Release of Liability Waiver</h2>
          <p className="text-red-500 font-bold text-sm mt-1 uppercase tracking-wider">
            Required Signature for: {participantName}
          </p>
        </div>

        {/* Legal Text */}
        <div className="p-6 overflow-y-auto text-sm text-zinc-300 leading-relaxed max-h-[30vh]">
          {waiverText}
        </div>

        {/* Signature Area */}
        <div className="p-6 border-t border-white/10 bg-zinc-900 flex-shrink-0">
          <div className="flex justify-between items-end mb-2">
            <label className="text-sm font-semibold text-white">Draw Signature Below</label>
            <button 
              onClick={clearPad}
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Clear Pad
            </button>
          </div>
          
          <div className="rounded-xl overflow-hidden border-2 border-white/10 relative bg-white touch-none">
            <canvas
              ref={canvasRef}
              width={700}
              height={200}
              className="w-full cursor-crosshair h-[200px]"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!hasSigned || isSubmitting}
              className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${
                hasSigned && !isSubmitting
                ? 'bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-[0_0_20px_-5px_rgba(220,38,38,0.5)]' 
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Processing...' : 'I Agree & Sign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
