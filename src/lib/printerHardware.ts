import type {
  AgencyProfile,
  POSCartLine,
  PosPrinter,
  PrinterRole,
} from '../types'
import { uid } from './documentIds'
import { formatCzechDateTime } from './czechDate'
import {
  THERMAL_LOGO_SVG,
  buildVatBreakdown,
  formatKcPlain,
  formatTaxDocumentNumber,
  formatVenueAddress,
  isVatPayer,
  receiptPaymentLabel,
  receiptPrintedAtLabel,
} from './taxReceipt'
import type { POSPaymentMethod } from '../types'
import { openPrintCapableWindow, writeAndPrintHtml } from './safePrintWindow'

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
  const stamp = formatCzechDateTime(new Date())
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

export type CustomerReceiptProfile = Pick<
  AgencyProfile,
  'companyName' | 'ico' | 'dic' | 'street' | 'city' | 'zip' | 'logoUrl'
>

export interface CustomerReceiptOpts {
  profile: CustomerReceiptProfile
  projectName?: string
  tableLabel?: string
  receiptNumber: string
  projectSequence?: number
  lines: POSCartLine[]
  paymentMethod?: POSPaymentMethod
  /** Fallback when paymentMethod not provided */
  paymentLabel?: string
  printedAt?: Date
  openingHours?: string
}

/** Plain-text ZDD body (also embedded in HTML pre for thermal drivers). */
export function formatCustomerReceipt80mm(opts: CustomerReceiptOpts): string {
  const profile = opts.profile
  const company = (profile.companyName || 'EventFlow').trim()
  const address = formatVenueAddress(profile)
  const ico = String(profile.ico || '').trim() || '—'
  const dic = String(profile.dic || '').trim()
  const vatStatus = isVatPayer(dic) ? 'Plátce DPH' : 'Neplátce DPH'
  const hours = opts.openingHours || 'Po - Ne: 11:00 - 23:00'
  const docNo = formatTaxDocumentNumber({
    receiptNumber: opts.receiptNumber,
    projectSequence: opts.projectSequence,
  })
  const printedAt = receiptPrintedAtLabel(opts.printedAt || new Date())
  const payLabel =
    opts.paymentMethod != null
      ? receiptPaymentLabel(opts.paymentMethod)
      : opts.paymentLabel || 'Hotovost'

  const { rows, totalGross, printLines } = buildVatBreakdown(opts.lines ?? [])

  const itemBlock = printLines
    .map((l) => {
      const unit = formatKcPlain(l.unitPrice)
      const sum = formatKcPlain(l.lineGross)
      return (
        `${l.name}\n` +
        `  ${l.qty} ks × ${unit}  ${sum}  ${l.letter}`
      )
    })
    .join('\n')

  const vatBlock = rows.length
    ? rows
        .map(
          (r) =>
            `${r.letter} ${r.label}\n` +
            `  Základ: ${formatKcPlain(r.base)}\n` +
            `  Daň:    ${formatKcPlain(r.vat)}\n` +
            `  Celkem: ${formatKcPlain(r.gross)}`,
        )
        .join('\n')
    : '  (bez položek s DPH)'

  return (
    `${company}\n` +
    `${address}\n` +
    `IČO: ${ico}\n` +
    (dic ? `DIČ: ${dic}\n` : '') +
    `${vatStatus}\n` +
    `Otevírací doba: ${hours}\n` +
    `================================\n` +
    `ZJEDNODUŠENÝ DAŇOVÝ DOKLAD\n` +
    (opts.tableLabel ? `Stůl: ${opts.tableLabel}\n` : '') +
    (opts.projectName ? `Akce: ${opts.projectName}\n` : '') +
    `--------------------------------\n` +
    `${itemBlock || '(prázdný košík)'}\n` +
    `--------------------------------\n` +
    `CELKEM K ÚHRADĚ: ${formatKcPlain(totalGross)}\n` +
    `--------------------------------\n` +
    `ROZPIS DPH\n` +
    `${vatBlock}\n` +
    `================================\n` +
    `Číslo dokladu: ${docNo}\n` +
    `Datum a čas: ${printedAt}\n` +
    `Způsob úhrady: ${payLabel}\n` +
    `--------------------------------\n` +
    `Děkujeme za Vaši návštěvu!\n` +
    `Účtenka slouží jako zjednodušený\n` +
    `daňový doklad.\n`
  )
}

/** High-contrast HTML thermal receipt — black on white, centered headers. */
export function buildCustomerReceiptHtml(opts: CustomerReceiptOpts): string {
  try {
    return buildCustomerReceiptHtmlInner(opts)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Neznámá chyba tisku'
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8"/><title>Účtenka</title></head>
<body style="font-family:monospace;padding:16px;background:#fff;color:#000">
<strong>Tisk účtenky selhal</strong><br/>${escapeHtml(msg)}<br/>Zkontrolujte data dokladu.
</body></html>`
  }
}

function buildCustomerReceiptHtmlInner(opts: CustomerReceiptOpts): string {
  const profile = opts?.profile ?? {
    companyName: 'EventFlow',
    ico: '',
    dic: '',
    street: '',
    city: '',
    zip: '',
    logoUrl: null,
  }
  const company = escapeHtml(String(profile.companyName || 'EventFlow').trim() || 'EventFlow')
  const address = escapeHtml(formatVenueAddress(profile) || '—')
  const ico = escapeHtml(String(profile.ico || '').trim() || '—')
  const dicRaw = String(profile.dic || '').trim()
  const dic = escapeHtml(dicRaw)
  const vatStatus = isVatPayer(dicRaw) ? 'Plátce DPH' : 'Neplátce DPH'
  const hours = escapeHtml(opts.openingHours || 'Po - Ne: 11:00 - 23:00')
  const docNo = escapeHtml(
    formatTaxDocumentNumber({
      receiptNumber: opts.receiptNumber || 'F20260001',
      projectSequence: opts.projectSequence,
    }) || 'F20260001',
  )
  const printedAt = escapeHtml(receiptPrintedAtLabel(opts.printedAt || new Date()) || '—')
  const payLabel = escapeHtml(
    opts.paymentMethod != null
      ? receiptPaymentLabel(opts.paymentMethod)
      : opts.paymentLabel || 'Hotovost',
  )

  const { rows, totalGross, printLines } = buildVatBreakdown(
    Array.isArray(opts.lines) ? opts.lines : [],
  )

  const itemsHtml = printLines
    .map((l) => {
      return `<div class="line">
  <div class="line-name">${escapeHtml(l.name)}</div>
  <div class="line-row">
    <span>${l.qty}&nbsp;ks × ${escapeHtml(formatKcPlain(l.unitPrice))}</span>
    <span class="line-sum">${escapeHtml(formatKcPlain(l.lineGross))}&nbsp;<b>${l.letter}</b></span>
  </div>
</div>`
    })
    .join('\n')

  const vatHtml = rows
    .map(
      (r) => `<tr>
  <td class="c">${r.letter}<br/><span class="small">${escapeHtml(r.label)}</span></td>
  <td class="r">${escapeHtml(formatKcPlain(r.base))}</td>
  <td class="r">${escapeHtml(formatKcPlain(r.vat))}</td>
  <td class="r">${escapeHtml(formatKcPlain(r.gross))}</td>
</tr>`,
    )
    .join('\n')

  const logoBlock = profile.logoUrl
    ? `<img class="logo" src="${escapeAttr(profile.logoUrl)}" alt="Logo" />`
    : `<div class="logo-svg">${THERMAL_LOGO_SVG}</div>`

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8"/>
<title>Účtenka ${docNo}</title>
<style>
  :root { color-scheme: only light; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff !important;
    color: #000 !important;
    font-family: "Courier New", ui-monospace, Menlo, monospace;
    font-size: 12px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt {
    width: 72mm;
    max-width: 72mm;
    margin: 0 auto;
    padding: 2mm;
    background: #fff !important;
    color: #000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  .center { text-align: center; }
  .logo, .logo-svg { display: block; margin: 0 auto 6px; width: 48px; height: 48px; }
  .logo-svg svg { width: 48px; height: 48px; display: block; margin: 0 auto; }
  .company { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.02em; }
  .meta { font-size: 11px; margin-top: 2px; }
  .rule { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  .rule-solid { border: none; border-top: 2px solid #000; margin: 8px 0; }
  .title { font-weight: 900; font-size: 12px; letter-spacing: 0.04em; }
  .line { margin-bottom: 6px; }
  .line-name { font-weight: 700; }
  .line-row { display: flex; justify-content: space-between; gap: 6px; }
  .line-sum { font-weight: 700; white-space: nowrap; }
  .total {
    font-size: 15px;
    font-weight: 900;
    display: flex;
    justify-content: space-between;
    margin: 8px 0;
  }
  table.vat {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    margin-top: 4px;
  }
  table.vat th, table.vat td {
    border-bottom: 1px solid #000;
    padding: 3px 2px;
    vertical-align: top;
  }
  table.vat th { font-weight: 900; text-align: left; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; }
  .small { font-size: 9px; font-weight: 400; }
  .footer { font-size: 11px; margin-top: 6px; }
  .footer strong { font-weight: 900; }
  .legal { font-size: 10px; margin-top: 8px; }

  @media print {
    @page { size: 80mm auto; margin: 2mm; }
    html, body {
      background: #fff !important;
      color: #000 !important;
      width: 80mm;
    }
    .receipt {
      width: 72mm;
      background: #fff !important;
      color: #000 !important;
      box-shadow: none !important;
      text-shadow: none !important;
      filter: none !important;
    }
    * {
      background: transparent !important;
      box-shadow: none !important;
      text-shadow: none !important;
      color: #000 !important;
    }
    .logo-svg svg rect { fill: #000 !important; }
    .logo-svg svg path { fill: #fff !important; stroke: none !important; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      ${logoBlock}
      <div class="company">${company}</div>
      <div class="meta">${address}</div>
      <div class="meta">IČO: ${ico}</div>
      ${dicRaw ? `<div class="meta">DIČ: ${dic}</div>` : ''}
      <div class="meta"><strong>${vatStatus}</strong></div>
      <div class="meta">Otevírací doba: ${hours}</div>
    </div>

    <hr class="rule-solid"/>
    <div class="center title">ZJEDNODUŠENÝ DAŇOVÝ DOKLAD</div>
    ${opts.tableLabel ? `<div class="center meta">Stůl: ${escapeHtml(opts.tableLabel)}</div>` : ''}
    ${opts.projectName ? `<div class="center meta">Akce: ${escapeHtml(opts.projectName)}</div>` : ''}
    <hr class="rule"/>

    ${itemsHtml || '<div class="center">(prázdný košík)</div>'}

    <hr class="rule"/>
    <div class="total">
      <span>CELKEM K ÚHRADĚ</span>
      <span>${escapeHtml(formatKcPlain(totalGross))}</span>
    </div>
    <hr class="rule"/>

    <div class="center title">ROZPIS DPH</div>
    <table class="vat">
      <thead>
        <tr>
          <th class="c">Sazba</th>
          <th class="r">Základ</th>
          <th class="r">Daň</th>
          <th class="r">Celkem</th>
        </tr>
      </thead>
      <tbody>
        ${vatHtml || '<tr><td colspan="4" class="c">—</td></tr>'}
      </tbody>
    </table>

    <hr class="rule-solid"/>
    <div class="footer center">
      <div><strong>Číslo dokladu:</strong> ${docNo}</div>
      <div><strong>Datum a čas:</strong> ${printedAt}</div>
      <div><strong>Způsob úhrady:</strong> ${payLabel}</div>
    </div>
    <hr class="rule"/>
    <div class="legal center">
      Děkujeme za Vaši návštěvu!<br/>
      Účtenka slouží jako zjednodušený daňový doklad.
    </div>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 220);
    };
  </script>
</body>
</html>`
}

function escapeHtml(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string | number | null | undefined): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
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
  /** Full venue profile for statutory ZDD header (preferred). */
  profile?: CustomerReceiptProfile | null
  paymentMethod?: POSPaymentMethod
  projectSequence?: number
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

  const sendHtml = (role: PrinterRole, html: string, hasContent: boolean) => {
    if (!hasContent) return
    const printer =
      printers.find((p) => p.role === role && p.paired) ||
      printers.find((p) => p.role === role)
    const name = printer?.name || roleLabel(role)
    openThermalHtmlPrintWindow(html, name)
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
    kitchen.length > 0,
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
    bar.length > 0,
  )

  if (opts.printCustomerReceipt) {
    const profile: CustomerReceiptProfile = opts.profile ?? {
      companyName: opts.companyName || 'EventFlow',
      ico: '',
      dic: '',
      street: '',
      city: '',
      zip: '',
      logoUrl: null,
    }
    const receiptOpts: CustomerReceiptOpts = {
      profile: {
        ...profile,
        companyName: profile.companyName || opts.companyName || 'EventFlow',
      },
      projectName: opts.projectName,
      tableLabel: opts.tableLabel,
      receiptNumber: opts.receiptNumber,
      projectSequence: opts.projectSequence,
      lines: opts.lines,
      paymentMethod: opts.paymentMethod,
      paymentLabel: opts.paymentLabel,
    }
    sendHtml('receipt', buildCustomerReceiptHtml(receiptOpts), true)
  }

  return { jobs }
}

/** Plain-text thermal popup (kitchen / bar / closure). */
export function openThermalPrintWindow(content: string, title: string) {
  const win = openPrintCapableWindow({ width: 360, height: 640 })
  if (!win) {
    console.warn('Tiskové okno bylo zablokováno prohlížečem')
    return
  }
  const safeTitle = escapeHtml(String(title || 'Tisk'))
  const safe = String(content ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  writeAndPrintHtml(
    win,
    `<!doctype html><html lang="cs"><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>
  :root { color-scheme: only light; }
  @page { size: 80mm auto; margin: 2mm; }
  html, body {
    font-family: "Courier New", ui-monospace, Menlo, monospace;
    font-size: 12px;
    color: #000 !important;
    background: #fff !important;
    width: 72mm;
    margin: 0 auto;
    white-space: pre-wrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 13px; margin: 0 0 8px; text-align: center; color: #000 !important; }
  @media print {
    html, body { background: #fff !important; color: #000 !important; box-shadow: none !important; }
    * { box-shadow: none !important; text-shadow: none !important; }
  }
</style></head><body><h1>${safeTitle}</h1><pre>${safe || '(prázdný doklad)'}</pre>
</body></html>`,
    220,
  )
}

/** Statutory customer receipt HTML print (ZDD). */
export function openThermalHtmlPrintWindow(html: string, _title: string) {
  const win = openPrintCapableWindow({ width: 380, height: 720 })
  if (!win) {
    console.warn('Tiskové okno účtenky bylo zablokováno prohlížečem')
    return
  }
  const safeHtml =
    String(html || '').trim() ||
    `<!doctype html><html lang="cs"><head><meta charset="utf-8"/><title>Účtenka</title></head>
<body style="font-family:monospace;padding:12px;color:#000;background:#fff">
<strong>Účtenka není k dispozici</strong><br/>Chybí data dokladu.
</body></html>`
  writeAndPrintHtml(win, safeHtml, 240)
}
