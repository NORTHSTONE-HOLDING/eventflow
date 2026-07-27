/**
 * Desktop POS / KDS protection — block accidental reload & backspace navigation
 * inside Tauri WebView (kitchen monitors, bartenders, floor tablets).
 */

import { isTauriDesktop } from './tauriEnv'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('[contenteditable="true"]'))
}

/**
 * Install global key guards. Returns cleanup.
 * Always safe in browser; only intercepts when running inside Tauri desktop shell.
 */
export function installDesktopNavigationGuards(): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (!isTauriDesktop()) return () => undefined

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key
    const mod = e.ctrlKey || e.metaKey

    // F5 / Ctrl+R / Cmd+R — protect active POS / KDS memory
    if (key === 'F5' || (mod && key.toLowerCase() === 'r')) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    // Ctrl+Shift+R hard reload
    if (mod && e.shiftKey && key.toLowerCase() === 'r') {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    // Backspace browser-back when not editing a field
    if (key === 'Backspace' && !isEditableTarget(e.target) && !mod) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // Block pull-to-refresh style middle-click reload on some WebViews
  const onAuxClick = (e: MouseEvent) => {
    if (e.button === 1) {
      // allow middle-click on links; block bare page reload contexts
      const t = e.target as HTMLElement | null
      if (t && !t.closest('a[href]')) {
        e.preventDefault()
      }
    }
  }

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('auxclick', onAuxClick, true)

  return () => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('auxclick', onAuxClick, true)
  }
}
