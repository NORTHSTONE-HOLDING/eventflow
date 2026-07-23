import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null
let lastProbeOk: boolean | null = null
let lastProbeAt = 0

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export type SyncMode = 'online' | 'offline'

/** Keys present AND browser online (best-effort). */
export function getInventorySyncMode(): SyncMode {
  if (!isSupabaseConfigured) return 'offline'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  return 'online'
}

export function syncModeLabel(mode: SyncMode): string {
  return mode === 'online'
    ? 'Synchronizováno s cloudem'
    : 'Pracuji v lokálním režimu (Data chráněna)'
}

/** Light connectivity probe (cached ~20s). */
export async function probeSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured) {
    lastProbeOk = false
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    lastProbeOk = false
    return false
  }
  const now = Date.now()
  if (lastProbeOk != null && now - lastProbeAt < 20_000) return lastProbeOk

  const sb = getSupabase()
  if (!sb) {
    lastProbeOk = false
    lastProbeAt = now
    return false
  }
  try {
    const { error } = await sb.from('inventory').select('id').limit(1)
    lastProbeOk = !error
    lastProbeAt = now
    return lastProbeOk
  } catch {
    lastProbeOk = false
    lastProbeAt = now
    return false
  }
}

export function getLastProbeOk(): boolean | null {
  return lastProbeOk
}

export function subscribeConnectivity(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = () => onChange()
  window.addEventListener('online', handler)
  window.addEventListener('offline', handler)
  return () => {
    window.removeEventListener('online', handler)
    window.removeEventListener('offline', handler)
  }
}
