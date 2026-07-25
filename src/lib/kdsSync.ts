import type {
  CustomerDisplayState,
  KdsTicket,
  KdsTicketStatus,
  POSCartLine,
} from '../types'
import type { CctvWalkoutAlert } from './cctvEngine'
import { uid } from './documentIds'
import { splitCartByStation } from './printerHardware'

export const POS_CHANNEL = 'eventflow-pos-sync'

export type WaiterReadyPayload = {
  ticketId: string
  orderNumber: string
  tableLabel: string
  station: 'kitchen' | 'bar'
  waiterId: string
  waiterName: string
  message: string
}

export type PosBroadcastMessage =
  | { type: 'customer_display'; payload: CustomerDisplayState }
  | { type: 'kds_upsert'; payload: KdsTicket }
  | { type: 'kds_status'; payload: { id: string; status: KdsTicketStatus } }
  | { type: 'kds_snapshot'; payload: KdsTicket[] }
  | { type: 'waiter_ready'; payload: WaiterReadyPayload }
  | { type: 'security_alert'; payload: CctvWalkoutAlert }
  | {
      type: 'cashier_amber_alert'
      payload: { message: string; cameraId: string; cameraLabel: string }
    }
  | { type: 'ping' }

let sharedChannel: BroadcastChannel | null | undefined

/** Singleton BroadcastChannel — safe across POS / KDS windows. */
export function getPosChannel(): BroadcastChannel | null {
  if (sharedChannel !== undefined) return sharedChannel
  try {
    if (typeof BroadcastChannel === 'undefined') {
      sharedChannel = null
      return null
    }
    sharedChannel = new BroadcastChannel(POS_CHANNEL)
    return sharedChannel
  } catch {
    sharedChannel = null
    return null
  }
}

export function publishCustomerDisplay(state: CustomerDisplayState) {
  const ch = getPosChannel()
  ch?.postMessage({ type: 'customer_display', payload: state } satisfies PosBroadcastMessage)
  try {
    localStorage.setItem('eventflow-customer-display', JSON.stringify(state))
  } catch {
    // ignore quota
  }
}

export function publishKdsTicket(ticket: KdsTicket) {
  const ch = getPosChannel()
  ch?.postMessage({ type: 'kds_upsert', payload: ticket } satisfies PosBroadcastMessage)
  try {
    const raw = localStorage.getItem('eventflow-kds-tickets')
    const list = raw ? (JSON.parse(raw) as KdsTicket[]) : []
    const next = [ticket, ...(Array.isArray(list) ? list.filter((t) => t.id !== ticket.id) : [])].slice(
      0,
      80
    )
    localStorage.setItem('eventflow-kds-tickets', JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function publishKdsStatus(id: string, status: KdsTicketStatus) {
  const ch = getPosChannel()
  ch?.postMessage({ type: 'kds_status', payload: { id, status } } satisfies PosBroadcastMessage)
}

export function publishWaiterReady(payload: WaiterReadyPayload) {
  const ch = getPosChannel()
  ch?.postMessage({ type: 'waiter_ready', payload } satisfies PosBroadcastMessage)
  try {
    localStorage.setItem(
      'eventflow-waiter-ready',
      JSON.stringify({ ...payload, ts: Date.now() })
    )
  } catch {
    // ignore
  }
}

export function publishKdsSnapshot(tickets: KdsTicket[]) {
  const ch = getPosChannel()
  ch?.postMessage({
    type: 'kds_snapshot',
    payload: tickets,
  } satisfies PosBroadcastMessage)
}

export function buildKdsTicketsFromCart(opts: {
  projectId: string
  projectName: string
  receiptNumber: string
  tableLabel: string
  lines: POSCartLine[]
  waiterId?: string
  waiterName?: string
  orderId?: string
  tableId?: string
}): KdsTicket[] {
  const { kitchen, bar } = splitCartByStation(opts.lines ?? [])
  const tickets: KdsTicket[] = []
  const stamp = new Date().toISOString()

  const sumValue = (rows: POSCartLine[]) =>
    Math.round(
      rows.reduce(
        (s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0),
        0,
      ),
    )

  if (kitchen.length) {
    tickets.push({
      id: uid('kds'),
      projectId: opts.projectId,
      projectName: opts.projectName,
      receiptNumber: opts.receiptNumber,
      station: 'kitchen',
      tableLabel: opts.tableLabel,
      createdAt: stamp,
      status: 'new',
      lines: kitchen.map((l) => ({ name: l.name, qty: l.qty })),
      waiterId: opts.waiterId,
      waiterName: opts.waiterName,
      orderId: opts.orderId,
      tableId: opts.tableId,
      ticketValue: sumValue(kitchen),
      preparingAt: null,
      completedAt: null,
      prepDurationSec: null,
    })
  }
  if (bar.length) {
    tickets.push({
      id: uid('kds'),
      projectId: opts.projectId,
      projectName: opts.projectName,
      receiptNumber: opts.receiptNumber,
      station: 'bar',
      tableLabel: opts.tableLabel,
      createdAt: stamp,
      status: 'new',
      lines: bar.map((l) => ({ name: l.name, qty: l.qty })),
      waiterId: opts.waiterId,
      waiterName: opts.waiterName,
      orderId: opts.orderId,
      tableId: opts.tableId,
      ticketValue: sumValue(bar),
      preparingAt: null,
      completedAt: null,
      prepDurationSec: null,
    })
  }
  return tickets
}

/** Open / focus a secondary display window (Window Management API when available). */
export async function openPosDisplayWindow(
  path:
    | '/pos/customer'
    | '/pos/kds'
    | '/pos/kds/kitchen'
    | '/pos/kds/bar'
    | '/kds-kitchen'
    | '/kds-bar',
  preferredScreenIndex = 1
): Promise<Window | null> {
  const url = `${window.location.origin}${path}`
  let features = 'noopener,noreferrer,width=1280,height=800'

  try {
    const nav = navigator as Navigator & {
      getScreenDetails?: () => Promise<{
        screens: Array<{
          availLeft: number
          availTop: number
          availWidth: number
          availHeight: number
        }>
      }>
    }
    if (typeof nav.getScreenDetails === 'function') {
      const details = await nav.getScreenDetails()
      const screens = details?.screens ?? []
      const screen = screens[preferredScreenIndex] || screens[screens.length - 1]
      if (screen) {
        features =
          `noopener,noreferrer,left=${screen.availLeft + 40},top=${screen.availTop + 40},` +
          `width=${Math.max(800, screen.availWidth - 80)},height=${Math.max(600, screen.availHeight - 80)}`
      }
    }
  } catch {
    // Permission denied or unsupported — fall back to standard window.open
  }

  return window.open(url, path.replace(/\//g, '_'), features)
}

export function emptyCustomerDisplay(projectName = ''): CustomerDisplayState {
  return {
    projectName,
    lines: [],
    total: 0,
    phase: 'idle',
    message: 'Vítejte · EventFlow',
    updatedAt: new Date().toISOString(),
  }
}
