import type {
  POSCartLine,
  PosPrinter,
  PrinterRole,
} from '../types'
import { uid } from './documentIds'

declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice: (options: {
        acceptAllDevices?: boolean
        optionalServices?: string[]
        filters?: Array<{ namePrefix?: string; services?: string[] }>
      }) => Promise<{ id: string; name?: string; gatt?: { connect: () => Promise<unknown> } }>
    }
  }
}

export const DEFAULT_PRINTERS: PosPrinter[] = [
  {
    id: 'printer_kitchen',
    name: 'Tiskárna Kuchyň',
    role: 'kitchen',
    connection: 'simulated',
    address: 'BT:KITCHEN-80',
    paired: true,
    paperWidthMm: 80,
    lastSeen: null,
  },
  {
    id: 'printer_bar',
    name: 'Tiskárna Bar',
    role: 'bar',
    connection: 'simulated',
    address: 'BT:BAR-80',
    paired: true,
    paperWidthMm: 80,
    lastSeen: null,
  },
  {
    id: 'printer_receipt',
    name: 'Tiskárna Účtenky (Zákaznická)',
    role: 'receipt',
    connection: 'simulated',
    address: 'BT:RECEIPT-80',
    paired: true,
    paperWidthMm: 80,
    lastSeen: null,
  },
]

export function roleLabel(role: PrinterRole): string {
  switch (role) {
    case 'kitchen':
      return 'Tiskárna Kuchyň'
    case 'bar':
      return 'Tiskárna Bar'
    case 'receipt':
      return 'Tiskárna Účtenky (Zákaznická)'
    default:
      return role
  }
}

/** Simulated Web Bluetooth pairing for thermal printers. */
export async function pairBluetoothPrinter(role: PrinterRole): Promise<PosPrinter> {
  try {
    if (navigator.bluetooth?.requestDevice) {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
      })
      try {
        await device.gatt?.connect()
      } catch {
        // Some browsers allow selection without GATT in insecure contexts
      }
      return {
        id: uid('printer'),
        name: device.name || roleLabel(role),
        role,
        connection: 'bluetooth',
        address: `BT:${device.id || Date.now()}`,
        paired: true,
        paperWidthMm: 80,
        lastSeen: new Date().toISOString(),
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/User cancelled|canceled/i.test(msg)) {
      throw new Error('Párování Bluetooth zrušeno uživatelem')
    }
  }

  // Fallback simulation when Web Bluetooth is unavailable
  await new Promise((r) => setTimeout(r, 900))
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return {
    id: uid('printer'),
    name: `${roleLabel(role)} · ${suffix}`,
    role,
    connection: 'simulated',
    address: `SIM-BT:${role.toUpperCase()}-${suffix}`,
    paired: true,
    paperWidthMm: 80,
    lastSeen: new Date().toISOString(),
  }
}

export function splitCartByStation(lines: POSCartLine[]): {
  kitchen: POSCartLine[]
  bar: POSCartLine[]
} {
  const kitchen: POSCartLine[] = []
  const bar: POSCartLine[] = []
  for (const line of lines ?? []) {
    if (line.isCustom) continue // volná položka → jen zákaznická účtenka
    if (line.category === 'beverage') bar.push(line)
    else if (line.category === 'food') kitchen.push(line)
    else kitchen.push(line)
  }
  return { kitchen, bar }
}

export function formatKitchenTicket(opts: {
  projectName: string
  receiptNumber: string
  tableLabel: string
  lines: POSCartLine[]
  station: 'kitchen' | 'bar'
}): string {
  const title =
    opts.station === 'kitchen' ? 'KUCHYŇSKÁ OBJEDNÁVKA / BONIČKA' : 'BAROVÁ OBJEDNÁVKA'
  const stamp = new Date().toLocaleString('cs-CZ')
  const body = (opts.lines ?? [])
    .map((l) => `${String(l.qty).padStart(2, ' ')}×  ${l.name}`)
    .join('\n')
  return (
    `${title}\n` +
    `================================\n` +
    `Akce: ${opts.projectName}\n` +
    `Stůl/Zóna: ${opts.tableLabel}\n` +
    `Doklad: ${opts.receiptNumber}\n` +
    `Čas: ${stamp}\n` +
    `--------------------------------\n` +
    `${body || '(prázdné)'}\n` +
    `================================\n` +
    `80mm · EventFlow Dispatch\n`
  )
}

export function formatCustomerReceipt80mm(opts: {
  companyName: string
  projectName: string
  receiptNumber: string
  lines: POSCartLine[]
  totalGross: number
  totalVat: number
  paymentLabel: string
}): string {
  const stamp = new Date().toLocaleString('cs-CZ')
  const body = (opts.lines ?? [])
    .map(
      (l) =>
        `${l.name}\n  ${l.qty} × ${l.unitPrice.toLocaleString('cs-CZ')} = ${(l.qty * l.unitPrice).toLocaleString('cs-CZ')}`
    )
    .join('\n')
  return (
    `${opts.companyName}\n` +
    `EventFlow POS · Účtenka\n` +
    `${opts.projectName}\n` +
    `================================\n` +
    `${opts.receiptNumber}\n` +
    `${stamp}\n` +
    `${opts.paymentLabel}\n` +
    `--------------------------------\n` +
    `${body}\n` +
    `--------------------------------\n` +
    `DPH: ${opts.totalVat.toLocaleString('cs-CZ')} Kč\n` +
    `CELKEM: ${opts.totalGross.toLocaleString('cs-CZ')} Kč\n` +
    `================================\n` +
    `Děkujeme · 80mm\n`
  )
}

/** Route print jobs to role-assigned printers and open 80mm print windows. */
export function dispatchPrintJobs(opts: {
  printers: PosPrinter[]
  projectName: string
  receiptNumber: string
  tableLabel: string
  lines: POSCartLine[]
  companyName: string
  totalGross: number
  totalVat: number
  paymentLabel: string
  printCustomerReceipt: boolean
}): { jobs: Array<{ role: PrinterRole; printerName: string; ok: boolean }> } {
  const printers = Array.isArray(opts.printers) ? opts.printers : []
  const { kitchen, bar } = splitCartByStation(opts.lines)
  const jobs: Array<{ role: PrinterRole; printerName: string; ok: boolean }> = []

  const send = (role: PrinterRole, content: string, hasContent: boolean) => {
    if (!hasContent) return
    const printer =
      printers.find((p) => p.role === role && p.paired) ||
      printers.find((p) => p.role === role)
    const name = printer?.name || roleLabel(role)
    openThermalPrintWindow(content, name)
    jobs.push({ role, printerName: name, ok: Boolean(printer?.paired ?? true) })
  }

  send(
    'kitchen',
    formatKitchenTicket({
      projectName: opts.projectName,
      receiptNumber: opts.receiptNumber,
      tableLabel: opts.tableLabel,
      lines: kitchen,
      station: 'kitchen',
    }),
    kitchen.length > 0
  )

  send(
    'bar',
    formatKitchenTicket({
      projectName: opts.projectName,
      receiptNumber: opts.receiptNumber,
      tableLabel: opts.tableLabel,
      lines: bar,
      station: 'bar',
    }),
    bar.length > 0
  )

  if (opts.printCustomerReceipt) {
    send(
      'receipt',
      formatCustomerReceipt80mm({
        companyName: opts.companyName,
        projectName: opts.projectName,
        receiptNumber: opts.receiptNumber,
        lines: opts.lines,
        totalGross: opts.totalGross,
        totalVat: opts.totalVat,
        paymentLabel: opts.paymentLabel,
      }),
      true
    )
  }

  return { jobs }
}

export function openThermalPrintWindow(content: string, title: string) {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=360,height=640')
  if (!win) return
  const safe = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  win.document.write(`<!doctype html><html><head><title>${title}</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  body { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #000; background: #fff; width: 72mm; margin: 0 auto; white-space: pre-wrap; }
  h1 { font-size: 13px; margin: 0 0 8px; }
</style></head><body><h1>${title}</h1><pre>${safe}</pre>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`)
  win.document.close()
}
