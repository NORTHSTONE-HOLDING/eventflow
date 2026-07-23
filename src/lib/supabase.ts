import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

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

export function getInventorySyncMode(): SyncMode {
  return isSupabaseConfigured ? 'online' : 'offline'
}

export function syncModeLabel(mode: SyncMode): string {
  return mode === 'online'
    ? 'Supabase online'
    : 'Offline režim (lokální záloha)'
}
