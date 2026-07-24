import type {
  AgencyProfile,
  EventProject,
  POSCartLine,
  POSLiveMetrics,
  POSPaymentMethod,
  POSTransaction,
} from '../types'
import { formatCzechDate } from './czechDate'
import { uid } from './documentIds'
import { getLowStockItems } from './inventoryEngine'

let receiptSeq = 1

export function nextReceiptNumber(projectSequence: number): string {
  const n = String(receiptSeq++).padStart(4, '0')
  const seq = String(projectSequence || 1).padStart(3, '0')
  return `UC2026${seq}-${n}`
}

export function setReceiptSequence(n: number) {
  receiptSeq = Math.max(receiptSeq, n)
}

export function cartTotals(lines: POSCartLine[]) {
  const totalGross = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  const totalFoodCost = lines.reduce((s, l) => s + l.foodCostPerUnit * l.qty, 0)
  const portionsIssued = lines.reduce((s, l) => s + l.qty, 0)

  let totalNet = 0
  let totalVat = 0
  for (const l of lines) {
    const gross = l.unitPrice * l.qty
    const net = gross / (1 + l.vatRate / 100)
    totalNet += net
    totalVat += gross - net
  }

  return {
    totalGross: Math.round(totalGross),
    totalNet: Math.round(totalNet),
    totalVat: Math.round(totalVat),
    totalFoodCost: Math.round(totalFoodCost),
    portionsIssued,
  }
}

export function buildTransaction(
  lines: POSCartLine[],
  paymentMethod: POSPaymentMethod,
  projectSequence: number,
  extras?: {
    cashAmount?: number
    cardAmount?: number
    changeGiven?: number
    tableId?: string
    tableLabel?: string
  }
): POSTransaction {
  const totals = cartTotals(lines ?? [])
  const charged = paymentMethod !== 'all_inclusive'
  const appendedToInvoice = paymentMethod === 'invoice'
  const gross = paymentMethod === 'all_inclusive' ? 0 : totals.totalGross
  const net = paymentMethod === 'all_inclusive' ? 0 : totals.totalNet
  const vat = paymentMethod === 'all_inclusive' ? 0 : totals.totalVat

  return {
    id: uid('pos'),
    receiptNumber: nextReceiptNumber(projectSequence),
    timestamp: new Date().toISOString(),
    lines: (lines ?? []).map((l) => ({ ...l })),
    paymentMethod,
    totalGross: gross,
    totalNet: net,
    totalVat: vat,
    totalFoodCost: totals.totalFoodCost,
    portionsIssued: totals.portionsIssued,
    appendedToInvoice,
    charged,
    cashAmount: extras?.cashAmount,
    cardAmount: extras?.cardAmount,
    changeGiven: extras?.changeGiven,
    tableId: extras?.tableId,
    tableLabel: extras?.tableLabel,
  }
}

export function computePosLiveMetrics(project: EventProject): POSLiveMetrics {
  const txs = project.posTransactions ?? []
  const catering = project.catering ?? []

  const currentTurnover = txs
    .filter((t) => t.charged)
    .reduce((s, t) => s + t.totalGross, 0)

  const foodCost = txs.reduce((s, t) => s + t.totalFoodCost, 0)
  const realMarginPercent =
    currentTurnover > 0
      ? ((currentTurnover - foodCost) / currentTurnover) * 100
      : 0

  const portionsIssued =
    catering.reduce((s, c) => s + (c.soldPortions || 0), 0) ||
    txs.reduce((s, t) => s + t.portionsIssued, 0)

  const portionsPlanned = catering.reduce(
    (s, c) => s + (c.plannedPortions || c.portion || 0),
    0
  )

  const portionsRatioPercent =
    portionsPlanned > 0 ? (portionsIssued / portionsPlanned) * 100 : 0

  return {
    currentTurnover,
    realMarginPercent: Math.round(realMarginPercent * 10) / 10,
    portionsIssued,
    portionsPlanned,
    portionsRatioPercent: Math.round(portionsRatioPercent * 10) / 10,
    cardSales: txs
      .filter((t) => t.paymentMethod === 'card')
      .reduce((s, t) => s + t.totalGross, 0),
    invoiceSales: txs
      .filter((t) => t.paymentMethod === 'invoice')
      .reduce((s, t) => s + t.totalGross, 0),
    allInclusivePortions: txs
      .filter((t) => t.paymentMethod === 'all_inclusive')
      .reduce((s, t) => s + t.portionsIssued, 0),
    lowStockCount: getLowStockItems(project.warehouse ?? []).length,
  }
}

/** POS unlocks after client signature + deposit payment (lifecycle step 5). */
export function isPosUnlocked(project: EventProject | null | undefined): boolean {
  if (!project) return false
  return Boolean(project.clientSigned && project.depositPaid && !project.posClosed)
}

export function buildDoplatkovaFaktura(
  project: EventProject,
  profile: AgencyProfile
): { id: string; text: string; total: number } {
  const seq = String(project.documents?.sequence || 1).padStart(3, '0')
  const id = `DF2026${seq}`
  const contractBalance = Math.round((project.totalRevenue || 0) * 0.5)
  const extras = Math.round(project.posExtrasTotal || 0)
  const total = contractBalance + extras
  const date = formatCzechDate(new Date())

  const barLines = (project.posTransactions ?? [])
    .filter((t) => t.appendedToInvoice || t.paymentMethod === 'card')
    .flatMap((t) =>
      t.lines.map(
        (l) =>
          `  • ${l.name} × ${l.qty} — ${(l.unitPrice * l.qty).toLocaleString('cs-CZ')} Kč [${t.receiptNumber}]`
      )
    )
    .slice(0, 40)

  const text =
    `DOPLATKOVÁ FAKTURA ${id}\n` +
    `Datum vystavení: ${date}\n` +
    `Dodavatel: ${profile.companyName || 'EventFlow Agency'}\n` +
    `IČO: ${profile.ico || '—'}  DIČ: ${profile.dic || '—'}\n` +
    `Účet: ${profile.iban || `${profile.bankAccount || '—'}/${profile.bankCode || '—'}`}\n\n` +
    `Odběratel: ${project.clientName || 'Klient'}\n` +
    `Akce: ${project.name}\n` +
    `Smlouva: ${project.documents?.smlouva || '—'}\n` +
    `Zálohová faktura: ${project.documents?.faktura || '—'}\n\n` +
    `────────────────────────────────\n` +
    `Zůstatek smlouvy (50 % doplatek): ${contractBalance.toLocaleString('cs-CZ')} Kč\n` +
    `Extra prodeje POS / bar na akci: ${extras.toLocaleString('cs-CZ')} Kč\n` +
    `────────────────────────────────\n` +
    `CELKEM K ÚHRADĚ: ${total.toLocaleString('cs-CZ')} Kč\n\n` +
    `Položky z Event POS (výběr):\n` +
    (barLines.length ? barLines.join('\n') : '  (bez extra POS položek)') +
    `\n\nSplatnost: 7 dnů\n` +
    `Tento doklad byl automaticky vygenerován uzavřením Event POS / Kasy.`

  return { id, text, total }
}

export function paymentMethodLabel(method: POSPaymentMethod): string {
  switch (method) {
    case 'card':
      return 'Platba kartou / Terminál'
    case 'invoice':
      return 'Zapsat na celkovou fakturu'
    case 'all_inclusive':
      return 'Odkliknout porci / All-Inclusive'
    case 'cash':
      return 'Hotovost'
    case 'combined':
      return 'Kombinovaná platba (hotovost + karta)'
    default:
      return method
  }
}
