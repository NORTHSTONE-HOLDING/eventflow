/**
 * Haptic + synthesizer beep for tablet POS under loud restaurant noise.
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  return audioCtx
}

/** Short clean beep via Web Audio API. */
export function playTapBeep(opts?: { freq?: number; ms?: number; gain?: number }) {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = opts?.freq ?? 880
    const now = ctx.currentTime
    const dur = (opts?.ms ?? 45) / 1000
    const g = opts?.gain ?? 0.08
    gain.gain.setValueAtTime(g, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + dur)
  } catch {
    // ignore autoplay / unsupported
  }
}

/** Native haptic pulse (ms). */
export function vibrateTap(ms = 15) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms)
    }
  } catch {
    // ignore
  }
}

/** Combined physical + audio confirmation for every POS tap. */
export function tapFeedback(kind: 'default' | 'success' | 'alert' | 'kds' = 'default') {
  if (kind === 'alert') {
    vibrateTap(40)
    playTapBeep({ freq: 420, ms: 90, gain: 0.12 })
    return
  }
  if (kind === 'success') {
    vibrateTap(20)
    playTapBeep({ freq: 1040, ms: 55, gain: 0.09 })
    return
  }
  if (kind === 'kds') {
    vibrateTap(18)
    playTapBeep({ freq: 660, ms: 50, gain: 0.1 })
    return
  }
  vibrateTap(15)
  playTapBeep({ freq: 880, ms: 40, gain: 0.08 })
}

/** Wrap click handler with tap feedback. */
export function withTapFeedback<T extends unknown[]>(
  fn: (...args: T) => void,
  kind: 'default' | 'success' | 'alert' | 'kds' = 'default',
) {
  return (...args: T) => {
    tapFeedback(kind)
    fn(...args)
  }
}
