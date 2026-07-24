import type { PosOrder, PosTableTab } from '../types'
import { uid } from './documentIds'
import { getPosChannel, type PosBroadcastMessage } from './kdsSync'

export const CCTV_RETENTION_DAYS = 60

export type CctvZoneCategory =
  | 'Exteriér'
  | 'Interiér'
  | 'VIP'
  | 'Kuchyň'
  | 'Bar'
  | 'Pokladna'

export const CCTV_ZONE_OPTIONS: CctvZoneCategory[] = [
  'Exteriér',
  'Interiér',
  'VIP',
  'Kuchyň',
  'Bar',
  'Pokladna',
]

export interface CctvCamera {
  id: string
  /** Display name — Název kamery */
  label: string
  /** Free-text placement note */
  zone: string
  /** Structured zone for AI rules */
  zoneCategory: CctvZoneCategory
  linkedTableLabels: string[]
  status: 'online' | 'offline' | 'alert'
  accent: string
  /** RTSP / IP stream address */
  rtspUrl: string
  /** Simulated continuous recording */
  recording: boolean
  resolution: string
  fps: number
}

export interface CctvWalkoutAlert {
  id: string
  cameraId: string
  cameraLabel: string
  tableId: string
  tableLabel: string
  projectId: string
  orderIds: string[]
  message: string
  createdAt: string
  acknowledged: boolean
  kind: 'walkout' | 'fight' | 'queue'
}

export interface CctvRecordingSegment {
  id: string
  cameraId: string
  cameraLabel: string
  /** ISO timestamp — used for 60-day retention purge */
  createdAt: string
  /** YYYY-MM-DD for archive day grouping */
  dayKey: string
  durationSec: number
  resolution: string
  fps: number
  sizeMb: number
  note: string
}

export interface CctvAiToggles {
  fightDetection: boolean
  heatmap: boolean
  walkoutDetection: boolean
}

export const DEFAULT_CCTV_AI_TOGGLES: CctvAiToggles = {
  fightDetection: true,
  heatmap: false,
  walkoutDetection: true,
}

export const DEFAULT_CCTV_CAMERAS: CctvCamera[] = [
  {
    id: 'cam_01',
    label: 'Hlavní vchod',
    zone: 'Vstupní zóna',
    zoneCategory: 'Exteriér',
    linkedTableLabels: [],
    status: 'online',
    accent: '#D4AF37',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.41:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_02',
    label: 'Pokladna Bar 1',
    zone: 'Bar / výčep',
    zoneCategory: 'Bar',
    linkedTableLabels: ['Bar VIP', 'Bar'],
    status: 'online',
    accent: '#60a5fa',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.42:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_03',
    label: 'Terasa',
    zone: 'Venkovní terasa',
    zoneCategory: 'Exteriér',
    linkedTableLabels: ['Terasa'],
    status: 'online',
    accent: '#34d399',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.43:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_04',
    label: 'Salonek A',
    zone: 'Salonek interiér',
    zoneCategory: 'Interiér',
    linkedTableLabels: ['Stůl 1', 'Stůl 2'],
    status: 'online',
    accent: '#f472b6',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.44:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_05',
    label: 'Salonek B',
    zone: 'Salonek interiér',
    zoneCategory: 'Interiér',
    linkedTableLabels: ['Stůl 3'],
    status: 'online',
    accent: '#a78bfa',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.45:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_06',
    label: 'Chodba k východu',
    zone: 'Úniková trasa',
    zoneCategory: 'Interiér',
    linkedTableLabels: [],
    status: 'online',
    accent: '#fbbf24',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.46:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_07',
    label: 'Kuchyň průhled',
    zone: 'Kuchyň',
    zoneCategory: 'Kuchyň',
    linkedTableLabels: [],
    status: 'online',
    accent: '#fb7185',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.47:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_08',
    label: 'VIP lounge',
    zone: 'VIP zóna',
    zoneCategory: 'VIP',
    linkedTableLabels: ['Bar VIP'],
    status: 'online',
    accent: '#D4AF37',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.48:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_09',
    label: 'Sklad alkohol',
    zone: 'Sklad',
    zoneCategory: 'Interiér',
    linkedTableLabels: [],
    status: 'offline',
    accent: '#64748b',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.49:554/stream1',
    recording: false,
    resolution: '1080p',
    fps: 25,
  },
  {
    id: 'cam_10',
    label: 'Pokladna / východ',
    zone: 'Pokladní zóna',
    zoneCategory: 'Pokladna',
    linkedTableLabels: [],
    status: 'online',
    accent: '#f87171',
    rtspUrl: 'rtsp://admin:eventflow@192.168.1.50:554/stream1',
    recording: true,
    resolution: '1080p',
    fps: 25,
  },
]

export function normalizeCamera(cam: Partial<CctvCamera> & { id: string }): CctvCamera {
  const fallback = DEFAULT_CCTV_CAMERAS.find((c) => c.id === cam.id)
  return {
    id: cam.id,
    label: cam.label || fallback?.label || `Kamera ${cam.id}`,
    zone: cam.zone || fallback?.zone || 'Interiér',
    zoneCategory: cam.zoneCategory || fallback?.zoneCategory || 'Interiér',
    linkedTableLabels: Array.isArray(cam.linkedTableLabels)
      ? cam.linkedTableLabels
      : fallback?.linkedTableLabels || [],
    status: cam.status || fallback?.status || 'offline',
    accent: cam.accent || fallback?.accent || '#D4AF37',
    rtspUrl: cam.rtspUrl || fallback?.rtspUrl || '',
    recording: cam.recording ?? fallback?.recording ?? false,
    resolution: cam.resolution || fallback?.resolution || '1080p',
    fps: cam.fps || fallback?.fps || 25,
  }
}

export function isTableUnpaidOpen(
  table: PosTableTab,
  orders: PosOrder[]
): boolean {
  const hasOpenLines =
    table.status === 'open' && (table.lines ?? []).length > 0
  if (hasOpenLines) return true
  const related = (orders ?? []).filter((o) => o.tableId === table.id)
  return related.some((o) => o.status !== 'paid' && o.status !== 'served')
}

export function czechOrderStatus(status: PosOrder['status'] | 'open'): string {
  const map: Record<string, string> = {
    open: 'OTEVŘENO',
    sent: 'ODESLÁNO',
    preparing: 'PŘIPRAVUJE SE',
    ready: 'PŘIPRAVENO',
    served: 'VYDÁNO',
    paid: 'ZAPLACENO',
  }
  return map[status] || status.toUpperCase()
}

export function buildWalkoutAlertMessage(tableLabel: string): string {
  return `🚨 POPLACH: Podezření na útěk bez placení ze STOLU ${tableLabel}!`
}

export function buildFightAlertMessage(cameraLabel: string, zone: string): string {
  return `⚠️ VAROVÁNÍ: Detekce rvačky / konfliktu — ${cameraLabel} (${zone})!`
}

export function buildWalkoutWhatsAppMessage(opts: {
  tableLabel: string
  cameraLabel: string
  companyName: string
  locationHint?: string
}): string {
  return (
    `🚨 POPLACH EVENTFLOW CCTV\n\n` +
    `Podezření na útěk bez placení!\n` +
    `Stůl: ${opts.tableLabel}\n` +
    `Kamera: ${opts.cameraLabel}\n` +
    `${opts.locationHint ? `Zóna: ${opts.locationHint}\n` : ''}` +
    `Stav účtu: OTEVŘENO (neuhrazeno)\n\n` +
    `Okamžitě zkontrolujte východ a stůl.\n` +
    `— ${opts.companyName || 'EventFlow Security'}`
  )
}

export function publishSecurityAlert(alert: CctvWalkoutAlert) {
  const ch = getPosChannel()
  ch?.postMessage({
    type: 'security_alert',
    payload: alert,
  } satisfies PosBroadcastMessage)
  try {
    localStorage.setItem(
      'eventflow-security-alert',
      JSON.stringify({ ...alert, ts: Date.now() })
    )
  } catch {
    // ignore
  }
}

/** Amber cashier warning for fight / conflict detection */
export function publishCashierAmberAlert(payload: {
  message: string
  cameraId: string
  cameraLabel: string
}) {
  const ch = getPosChannel()
  ch?.postMessage({
    type: 'cashier_amber_alert',
    payload,
  } satisfies PosBroadcastMessage)
  try {
    localStorage.setItem(
      'eventflow-cashier-amber',
      JSON.stringify({ ...payload, ts: Date.now() })
    )
  } catch {
    // ignore
  }
}

export function simulateWalkoutDetection(opts: {
  cameras: CctvCamera[]
  tables: PosTableTab[]
  orders: PosOrder[]
  projectId: string
}): CctvWalkoutAlert | null {
  const unpaid = (opts.tables ?? []).filter((t) =>
    isTableUnpaidOpen(t, opts.orders ?? [])
  )
  if (!unpaid.length) return null

  const table = unpaid[Math.floor(Math.random() * unpaid.length)]
  const online = (opts.cameras ?? []).filter((c) => c.status !== 'offline')
  const cam =
    online.find((c) =>
      c.linkedTableLabels.some((l) =>
        table.label.toLowerCase().includes(l.toLowerCase().replace(/bar vip/i, 'bar'))
      )
    ) ||
    online.find((c) => /vchod|východ|pokladna|chodba/i.test(c.label)) ||
    online[0]

  if (!cam) return null

  const relatedOrders = (opts.orders ?? [])
    .filter((o) => o.tableId === table.id && o.status !== 'paid')
    .map((o) => o.id)

  return {
    id: uid('cctv'),
    cameraId: cam.id,
    cameraLabel: cam.label,
    tableId: table.id,
    tableLabel: table.label,
    projectId: opts.projectId,
    orderIds: relatedOrders,
    message: buildWalkoutAlertMessage(table.label),
    createdAt: new Date().toISOString(),
    acknowledged: false,
    kind: 'walkout',
  }
}

export function simulateFightDetection(cameras: CctvCamera[]): CctvWalkoutAlert | null {
  const barCams = (cameras ?? []).filter(
    (c) =>
      c.status !== 'offline' &&
      (c.zoneCategory === 'Bar' || /bar/i.test(c.label) || /bar/i.test(c.zone))
  )
  const cam = barCams[0] || cameras.find((c) => c.status === 'online')
  if (!cam) return null
  return {
    id: uid('fight'),
    cameraId: cam.id,
    cameraLabel: cam.label,
    tableId: '',
    tableLabel: cam.zone,
    projectId: '',
    orderIds: [],
    message: buildFightAlertMessage(cam.label, cam.zoneCategory),
    createdAt: new Date().toISOString(),
    acknowledged: false,
    kind: 'fight',
  }
}

export function dayKeyFromIso(iso: string): string {
  return iso.slice(0, 10)
}

/** Seed simulated archive segments across recent days (and a few expired). */
export function seedRecordingArchive(cameras: CctvCamera[]): CctvRecordingSegment[] {
  const now = Date.now()
  const segments: CctvRecordingSegment[] = []
  const active = cameras.filter((c) => c.status !== 'offline')

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const ts = new Date(now - dayOffset * 86400000)
    const dayKey = ts.toISOString().slice(0, 10)
    for (const cam of active.slice(0, 6)) {
      const createdAt = new Date(
        ts.getFullYear(),
        ts.getMonth(),
        ts.getDate(),
        10 + (dayOffset % 8),
        (dayOffset * 7) % 60
      ).toISOString()
      segments.push({
        id: uid('rec'),
        cameraId: cam.id,
        cameraLabel: cam.label,
        createdAt,
        dayKey,
        durationSec: 3600 + (dayOffset % 3) * 900,
        resolution: cam.resolution,
        fps: cam.fps,
        sizeMb: 420 + dayOffset * 12,
        note: `Automatický segment · ${cam.zoneCategory}`,
      })
    }
  }

  // Expired samples (>60 days) — will be purged by retention engine
  for (let i = 0; i < 4; i++) {
    const cam = active[i % Math.max(1, active.length)]
    if (!cam) continue
    const old = new Date(now - (65 + i) * 86400000)
    segments.push({
      id: uid('rec_old'),
      cameraId: cam.id,
      cameraLabel: cam.label,
      createdAt: old.toISOString(),
      dayKey: old.toISOString().slice(0, 10),
      durationSec: 1800,
      resolution: '1080p',
      fps: 25,
      sizeMb: 280,
      note: 'Expirovaný segment (test retenční politiky)',
    })
  }

  return segments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/** Permanently purge segments older than retention window. */
export function purgeExpiredRecordings(
  segments: CctvRecordingSegment[],
  retentionDays = CCTV_RETENTION_DAYS
): { kept: CctvRecordingSegment[]; purgedCount: number; purgedIds: string[] } {
  const cutoff = Date.now() - retentionDays * 86400000
  const kept: CctvRecordingSegment[] = []
  const purgedIds: string[] = []
  for (const seg of segments ?? []) {
    const t = new Date(seg.createdAt).getTime()
    if (Number.isNaN(t) || t < cutoff) {
      purgedIds.push(seg.id)
    } else {
      kept.push(seg)
    }
  }
  return { kept, purgedCount: purgedIds.length, purgedIds }
}

export function groupRecordingsByDay(
  segments: CctvRecordingSegment[]
): Array<{ dayKey: string; items: CctvRecordingSegment[]; totalMb: number }> {
  const map = new Map<string, CctvRecordingSegment[]>()
  for (const seg of segments ?? []) {
    const list = map.get(seg.dayKey) ?? []
    list.push(seg)
    map.set(seg.dayKey, list)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, items]) => ({
      dayKey,
      items: items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      totalMb: Math.round(items.reduce((s, i) => s + i.sizeMb, 0)),
    }))
}

/** Append a live “REC tick” segment for online recording cameras. */
export function createLiveRecordingTick(camera: CctvCamera): CctvRecordingSegment {
  const createdAt = new Date().toISOString()
  return {
    id: uid('rec_live'),
    cameraId: camera.id,
    cameraLabel: camera.label,
    createdAt,
    dayKey: dayKeyFromIso(createdAt),
    durationSec: 300,
    resolution: camera.resolution,
    fps: camera.fps,
    sizeMb: 35,
    note: 'Živý cyklický záznam',
  }
}
