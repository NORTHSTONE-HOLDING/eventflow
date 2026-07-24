/**
 * EventFlow CCTV → Supabase Storage bridge
 * ========================================
 *
 * Bucket: `cctv-recordings`
 * Path layout (required):
 *   cctv-recordings/{camera_id}/{YYYY-MM-DD}/{hour}.mp4
 *   e.g. cctv-recordings/cam_01/2026-07-24/14.mp4
 *
 * Lifecycle / retention (60 days ≈ 2 months):
 *   - Application purge: `purgeExpiredRecordings()` + `purgeRemoteExpiredRecordings()`
 *   - Bucket lifecycle: run cleanup every 24h; delete objects with age > 60 days
 *     (see `/supabase/cctv-recordings-policies.sql` for RLS + lifecycle SQL)
 *
 * Required env (already used by inventory cloud):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Dashboard setup checklist:
 *   1. Create private bucket named exactly `cctv-recordings`
 *   2. Apply SQL policies from `supabase/cctv-recordings-policies.sql`
 *   3. Enable Storage lifecycle rule: delete after 60 days (or cron edge function)
 *   4. Optional: service-role edge function for privileged purge (not shipped in anon client)
 */

import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  CCTV_RETENTION_DAYS,
  buildRecordingStoragePath,
  dayKeyFromIso,
  hourKeyFromIso,
  type CctvRecordingSegment,
} from './cctvEngine'

/** Dedicated Supabase Storage bucket for CCTV video chunks */
export const CCTV_STORAGE_BUCKET = 'cctv-recordings'

export const CCTV_STORAGE_PATH_PATTERN =
  `${CCTV_STORAGE_BUCKET}/{camera_id}/{YYYY-MM-DD}/{hour}.mp4` as const

export type CctvUploadResult =
  | { ok: true; path: string; publicUrl: string | null }
  | { ok: false; error: string; offline: boolean }

export function isCctvStorageReady(): boolean {
  return isSupabaseConfigured && Boolean(getSupabase())
}

export function resolveSegmentObjectPath(segment: CctvRecordingSegment): string {
  if (segment.storagePath?.startsWith(`${CCTV_STORAGE_BUCKET}/`)) {
    return segment.storagePath.slice(CCTV_STORAGE_BUCKET.length + 1)
  }
  if (segment.storagePath) return segment.storagePath
  const dayKey = segment.dayKey || dayKeyFromIso(segment.createdAt)
  const hourKey = segment.hourKey || hourKeyFromIso(segment.createdAt)
  return `${segment.cameraId}/${dayKey}/${hourKey}.mp4`
}

export function buildCctvObjectPath(
  cameraId: string,
  at: Date | string = new Date(),
): string {
  const iso = typeof at === 'string' ? at : at.toISOString()
  const dayKey = dayKeyFromIso(iso)
  const hourKey = hourKeyFromIso(iso)
  return `${cameraId}/${dayKey}/${hourKey}.mp4`
}

/**
 * Upload a video chunk (Blob/File) into the cctv-recordings bucket.
 * Safe no-op with structured error when Supabase is not configured.
 */
export async function uploadCctvRecordingChunk(opts: {
  cameraId: string
  blob: Blob
  at?: Date | string
  contentType?: string
  upsert?: boolean
}): Promise<CctvUploadResult> {
  const sb = getSupabase()
  if (!sb) {
    return {
      ok: false,
      offline: true,
      error:
        'Supabase není nakonfigurován — nastavte VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY',
    }
  }

  const objectPath = buildCctvObjectPath(opts.cameraId, opts.at)
  const { error } = await sb.storage.from(CCTV_STORAGE_BUCKET).upload(objectPath, opts.blob, {
    contentType: opts.contentType || 'video/mp4',
    upsert: opts.upsert ?? true,
    cacheControl: '3600',
  })

  if (error) {
    return { ok: false, offline: false, error: error.message }
  }

  const fullPath = buildRecordingStoragePath(
    opts.cameraId,
    dayKeyFromIso(typeof opts.at === 'string' ? opts.at : (opts.at ?? new Date()).toISOString()),
    hourKeyFromIso(typeof opts.at === 'string' ? opts.at : (opts.at ?? new Date()).toISOString()),
  )

  const { data } = sb.storage.from(CCTV_STORAGE_BUCKET).getPublicUrl(objectPath)
  return {
    ok: true,
    path: fullPath,
    publicUrl: data?.publicUrl ?? null,
  }
}

/** Signed playback URL for private bucket objects (1 hour). */
export async function createCctvSignedPlaybackUrl(
  segment: CctvRecordingSegment,
  expiresInSec = 3600,
): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return null
  const objectPath = resolveSegmentObjectPath(segment)
  const { data, error } = await sb.storage
    .from(CCTV_STORAGE_BUCKET)
    .createSignedUrl(objectPath, expiresInSec)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Best-effort remote purge of objects older than retention window.
 * Lists by camera prefix and removes aged hour chunks.
 * Primary capacity guard remains the Storage lifecycle rule (24h / 60 days).
 */
export async function purgeRemoteExpiredRecordings(
  cameraIds: string[],
  retentionDays = CCTV_RETENTION_DAYS,
): Promise<{ removed: number; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { removed: 0, error: 'Supabase offline' }

  const cutoff = Date.now() - retentionDays * 86400000
  let removed = 0

  for (const cameraId of cameraIds) {
    const { data: days, error } = await sb.storage.from(CCTV_STORAGE_BUCKET).list(cameraId, {
      limit: 1000,
    })
    if (error || !days?.length) continue

    for (const day of days) {
      if (!day.name || !/^\d{4}-\d{2}-\d{2}$/.test(day.name)) continue
      const dayTs = new Date(day.name + 'T00:00:00Z').getTime()
      if (Number.isNaN(dayTs) || dayTs >= cutoff) continue

      const prefix = `${cameraId}/${day.name}`
      const { data: files } = await sb.storage.from(CCTV_STORAGE_BUCKET).list(prefix, {
        limit: 48,
      })
      const paths = (files ?? [])
        .filter((f) => f.name?.endsWith('.mp4'))
        .map((f) => `${prefix}/${f.name}`)
      if (!paths.length) continue
      const { error: removeError } = await sb.storage.from(CCTV_STORAGE_BUCKET).remove(paths)
      if (!removeError) removed += paths.length
    }
  }

  return { removed }
}

export function cctvStorageStatusLabel(): string {
  if (!isSupabaseConfigured) {
    return 'Úložiště připraveno lokálně · Supabase bucket cctv-recordings čeká na ENV klíče'
  }
  return `Bucket „${CCTV_STORAGE_BUCKET}“ připojen · retence ${CCTV_RETENTION_DAYS} dní · cesta ${CCTV_STORAGE_PATH_PATTERN}`
}
