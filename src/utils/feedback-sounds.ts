'use client'

/**
 * Short audio cues for the front desk. Staff often aren't looking at the screen
 * while a member scans, so they need to hear the result.
 * Uses Web Audio (no asset files). Browsers only allow sound after a user
 * gesture, so call `unlockAudio()` from a click handler once.
 */
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

export function unlockAudio() {
  const c = getCtx()
  if (c && c.state === 'suspended') c.resume()
}

export function isAudioUnlocked() {
  return !!ctx && ctx.state === 'running'
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.18) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = c.currentTime + start
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export const feedbackSounds = {
  /** Bright rising two-note chime */
  success() {
    tone(880, 0, 0.12)
    tone(1318.5, 0.1, 0.22)
  },
  /** Soft single note for "already checked in" */
  info() {
    tone(988, 0, 0.18)
  },
  /** Low double buzz */
  denied() {
    tone(196, 0, 0.18, 'square', 0.12)
    tone(165, 0.22, 0.28, 'square', 0.12)
  },
}
