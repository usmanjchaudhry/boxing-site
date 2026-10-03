'use client'

import { useEffect, useRef } from 'react'

interface Options {
  /** Called with the full scanned string */
  onScan: (code: string) => void
  /** Ignore bursts shorter than this (filters stray key presses). Default 8 */
  minLength?: number
  /** Max ms between keystrokes for them to count as one scan. Scanners type ~5-30ms/char. Default 80 */
  maxGapMs?: number
  /** Flush without a terminator after this idle time, for scanners with no Enter suffix. Default 120 */
  idleFlushMs?: number
  enabled?: boolean
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.dataset.scannerIgnore === 'false') return false // our own inputs opt back in
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/**
 * Listens for a USB / Bluetooth "keyboard wedge" barcode scanner (e.g. Eyoyo EY-2200).
 *
 * The scanner "types" the code very fast and usually ends with Enter. We buffer
 * keystrokes at window level, so the page never needs an input focused, and
 * separate scanner bursts from human typing by inter-key timing.
 * Typing into normal form fields is left alone.
 */
export function useBarcodeScanner({
  onScan,
  minLength = 8,
  maxGapMs = 80,
  idleFlushMs = 120,
  enabled = true,
}: Options) {
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) return

    let buffer = ''
    let lastKeyAt = 0
    let idleTimer: ReturnType<typeof setTimeout> | undefined

    const flush = () => {
      clearTimeout(idleTimer)
      const code = buffer
      buffer = ''
      if (code.length >= minLength) onScanRef.current(code)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const now = performance.now()
      if (now - lastKeyAt > maxGapMs) buffer = '' // too slow -> a human, start over
      lastKeyAt = now

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= minLength) {
          e.preventDefault()
          flush()
        } else {
          buffer = ''
        }
        return
      }

      if (e.key.length === 1) {
        buffer += e.key
        clearTimeout(idleTimer)
        idleTimer = setTimeout(flush, idleFlushMs)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      clearTimeout(idleTimer)
    }
  }, [enabled, minLength, maxGapMs, idleFlushMs])
}
