// Audio-haptic feedback for touch POS buttons.
// Uses the Web Audio API for a clean synthesized beep and navigator.vibrate for haptics.

let audioCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  return audioCtx
}

export function beep(frequency = 880, durationMs = 90): void {
  const ctx = getContext()
  if (!ctx) return
  // Some browsers start the context suspended until a user gesture resumes it.
  if (ctx.state === 'suspended') void ctx.resume()

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, ctx.currentTime)

  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durationMs / 1000)
}

export function haptic(pattern: number | number[] = 15): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern)
  }
}

// Combined tactile feedback used by every key POS button.
export function tap(frequency = 880): void {
  haptic(15)
  beep(frequency)
}

export function alarm(): void {
  haptic([80, 60, 80, 60, 200])
  beep(220, 220)
  setTimeout(() => beep(180, 260), 180)
}
