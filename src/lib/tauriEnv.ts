/**
 * Detect Tauri v2 desktop shell (macOS AppKit / Windows WebView2).
 */

export function isTauriDesktop(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
    isTauri?: boolean
  }
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri)
}

export function desktopShellLabel(): string {
  if (!isTauriDesktop()) return 'Web'
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Windows/i.test(ua)) return 'Windows Desktop'
  if (/Mac/i.test(ua)) return 'macOS Desktop'
  if (/Linux/i.test(ua)) return 'Linux Desktop'
  return 'Desktop'
}
