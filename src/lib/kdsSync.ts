import type {
  CustomerDisplayState,
  KdsTicket,
  KdsTicketStatus,
  POSCartLine,
} from '../types'
import { uid } from './documentIds'
import { splitCartByStation } from './printerHardware'

export const POS_CHANNEL = 'eventflow-pos-sync'

export type PosBroadcastMessage =
  | { type: 'customer_display'; payload: CustomerDisplayState }
  | { type: 'kds_upsert'; payload: KdsTicket }
  | { type: 'kds_status'; payload: { id: string; status: KdsTicketStatus } }
  | { type: 'kds_snapshot'; payload: KdsTicket[] }
  | { type: 'ping' }

export function getPosChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null
    return new BroadcastChannel(POS_CHANNEL)
  } catch {
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
}

export function publishKdsStatus(id: string, status: KdsTicketStatus) {
  const ch = getPosChannel()
  ch?.postMessage({ type: 'kds_status', payload: { id, status } } satisfies PosBroadcastMessage)
}

export function buildKdsTicketsFromCart(opts: {
  projectId: string
  projectName: string
  receiptNumber: string
  tableLabel: string
  lines: POSCartLine[]
}): KdsTicket[] {
  const { kitchen, bar } = splitCartByStation(opts.lines ?? [])
  const tickets: KdsTicket[] = []
  const stamp = new Date().toISOString()

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
    })
  }
  return tickets
}

/** Open / focus a secondary display window (Window Management API when available). */
export async function openPosDisplayWindow(
  path: '/pos/customer' | '/pos/kds',
  preferredScreenIndex = 1
): Promise<Window | null> {
  const url = `${window.location.origin}${path}`
  let features = 'noopener,noreferrer,width=1280,height=800'

  try {
    const nav = navigator as Navigator & {
      getScreenDetails?: () => Promise<{
        screens: Array<{ availLeft: number; availTop: number; availWidth: number; availHeight: number }>
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

  return window.open(url, path.replace('/', '_'), features)
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
