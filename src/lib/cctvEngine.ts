import type { PosOrder, PosTableTab } from '../types'
import { uid } from './documentIds'
import { getPosChannel, type PosBroadcastMessage } from './kdsSync'

export interface CctvCamera {
  id: string
  label: string
  zone: string
  linkedTableLabels: string[]
  status: 'online' | 'offline' | 'alert'
  /** Simulated stream color accent */
  accent: string
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
}

export const DEFAULT_CCTV_CAMERAS: CctvCamera[] = [
  {
    id: 'cam_01',
    label: 'Camera 01 — Hlavní vchod',
    zone: 'Vstupní zóna',
    linkedTableLabels: [],
    status: 'online',
    accent: '#D4AF37',
  },
  {
    id: 'cam_02',
    label: 'Camera 02 — Bar',
    zone: 'Bar / výčep',
    linkedTableLabels: ['Bar VIP', 'Bar'],
    status: 'online',
    accent: '#60a5fa',
  },
  {
    id: 'cam_03',
    label: 'Camera 03 — Terasa',
    zone: 'Venkovní terasa',
    linkedTableLabels: ['Terasa'],
    status: 'online',
    accent: '#34d399',
  },
  {
    id: 'cam_04',
    label: 'Camera 04 — Salonek A',
    zone: 'Salonek',
    linkedTableLabels: ['Stůl 1', 'Stůl 2'],
    status: 'online',
    accent: '#f472b6',
  },
  {
    id: 'cam_05',
    label: 'Camera 05 — Salonek B',
    zone: 'Salonek',
    linkedTableLabels: ['Stůl 3'],
    status: 'online',
    accent: '#a78bfa',
  },
  {
    id: 'cam_06',
    label: 'Camera 06 — Chodba k východu',
    zone: 'Úniková trasa',
    linkedTableLabels: [],
    status: 'online',
    accent: '#fbbf24',
  },
  {
    id: 'cam_07',
    label: 'Camera 07 — Kuchyň průhled',
    zone: 'Kuchyň',
    linkedTableLabels: [],
    status: 'online',
    accent: '#fb7185',
  },
  {
    id: 'cam_08',
    label: 'Camera 08 — VIP lounge',
    zone: 'VIP',
    linkedTableLabels: ['Bar VIP'],
    status: 'online',
    accent: '#D4AF37',
  },
  {
    id: 'cam_09',
    label: 'Camera 09 — Parkoviště',
    zone: 'Exteriér',
    linkedTableLabels: [],
    status: 'offline',
    accent: '#64748b',
  },
  {
    id: 'cam_10',
    label: 'Camera 10 — Pokladna / východ',
    zone: 'Pokladní zóna',
    linkedTableLabels: [],
    status: 'online',
    accent: '#f87171',
  },
]

/** Czech operational label for POS order / table open unpaid state. */
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

  const alert: CctvWalkoutAlert = {
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
  }
  return alert
}
