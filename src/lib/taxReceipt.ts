/**
 * Czech Zjednodušený daňový doklad (ZDD) — VAT breakdown & receipt helpers.
 * Gross prices (s DPH) → net / VAT with 2-decimal banker's rounding, Kč integers for print.
 */

import type { AgencyProfile, POSCartLine, POSPaymentMethod } from '../types'
import { formatCzechDateTimeFull } from './czechDate'

/** Statutory Czech VAT brackets used on POS menus. */
export type CzechVatRate = 21 | 12 | 0

export type VatLetter = 'A' | 'B' | 'C'

export interface VatBracketRow {
  letter: VatLetter
  rate: CzechVatRate
  label: string
  /** Základ daně (net) */
  base: number
  /** Výše daně */
  vat: number
  /** Celkem s DPH */
  gross: number
}

export interface ReceiptLinePrint {
  name: string
  qty: number
  unitPrice: number
  lineGross: number
  vatRate: CzechVatRate
  letter: VatLetter
}

/** Round half-up to 2 decimals (standard Czech invoice rounding). */
export function roundMoney2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** Whole Kč for thermal print (common POS practice). */
export function roundKc(n: number): number {
  return Math.round(Number(n) || 0)
}

export function normalizeVatRate(rate: number | null | undefined): CzechVatRate {
  const r = Number(rate)
  if (!Number.isFinite(r) || r <= 0) return 0
  if (r >= 18) return 21
  if (r >= 5) return 12
  return 0
}

export function vatLetter(rate: CzechVatRate): VatLetter {
  if (rate === 21) return 'A'
  if (rate === 12) return 'B'
  return 'C'
}

export function vatRateLabel(rate: CzechVatRate): string {
  switch (rate) {
    case 21:
      return '21% Základní'
    case 12:
      return '12% Snížená'
    case 0:
      return '0% Osvobozeno/Přenesená'
    default:
      return `${rate}%`
  }
}

/** Split gross (s DPH) into net + VAT for a single amount. */
export function splitGrossVat(gross: number, rate: CzechVatRate): { net: number; vat: number } {
  const g = Number(gross) || 0
  if (rate <= 0) return { net: roundMoney2(g), vat: 0 }
  const net = roundMoney2(g / (1 + rate / 100))
  const vat = roundMoney2(g - net)
  return { net, vat }
}

export function buildReceiptLines(lines: POSCartLine[]): ReceiptLinePrint[] {
  return (lines ?? []).map((l) => {
    const rate = normalizeVatRate(l.vatRate)
    const qty = Number(l.qty) || 0
    const unitPrice = Number(l.unitPrice) || 0
    const lineGross = roundMoney2(unitPrice * qty)
    return {
      name: l.name,
      qty,
      unitPrice,
      lineGross,
      vatRate: rate,
      letter: vatLetter(rate),
    }
  })
}

/**
 * Multi-rate VAT table under the total.
 * Reconciles bracket gross sum to cart total (fixes cumulative round-off).
 */
export function buildVatBreakdown(lines: POSCartLine[]): {
  rows: VatBracketRow[]
  totalGross: number
  totalNet: number
  totalVat: number
  printLines: ReceiptLinePrint[]
} {
  const printLines = buildReceiptLines(lines)
  const buckets = new Map<CzechVatRate, { gross: number; net: number; vat: number }>()
  for (const rate of [21, 12, 0] as CzechVatRate[]) {
    buckets.set(rate, { gross: 0, net: 0, vat: 0 })
  }

  for (const line of printLines) {
    const split = splitGrossVat(line.lineGross, line.vatRate)
    const b = buckets.get(line.vatRate)!
    b.gross = roundMoney2(b.gross + line.lineGross)
    b.net = roundMoney2(b.net + split.net)
    b.vat = roundMoney2(b.vat + split.vat)
  }

  // Reconcile: gross should equal sum of line grosses
  const totalGrossExact = roundMoney2(
    printLines.reduce((s, l) => s + l.lineGross, 0),
  )
  let sumGross = roundMoney2(
    [...buckets.values()].reduce((s, b) => s + b.gross, 0),
  )
  if (sumGross !== totalGrossExact) {
    const delta = roundMoney2(totalGrossExact - sumGross)
    const primary = buckets.get(21)!.gross > 0 ? 21 : buckets.get(12)!.gross > 0 ? 12 : 0
    const b = buckets.get(primary)!
    b.gross = roundMoney2(b.gross + delta)
    const split = splitGrossVat(b.gross, primary)
    b.net = split.net
    b.vat = split.vat
    sumGross = totalGrossExact
  }

  // Reconcile net+vat === gross per bracket
  for (const [rate, b] of buckets) {
    const expectVat = roundMoney2(b.gross - b.net)
    if (expectVat !== b.vat) b.vat = expectVat
    const check = roundMoney2(b.net + b.vat)
    if (check !== b.gross) {
      b.net = roundMoney2(b.gross - b.vat)
    }
    void rate
  }

  const rows: VatBracketRow[] = ([21, 12, 0] as CzechVatRate[])
    .map((rate) => {
      const b = buckets.get(rate)!
      return {
        letter: vatLetter(rate),
        rate,
        label: vatRateLabel(rate),
        base: roundKc(b.net),
        vat: roundKc(b.vat),
        gross: roundKc(b.gross),
      }
    })
    .filter((r) => r.gross !== 0 || r.base !== 0 || r.vat !== 0)

  const totalGross = roundKc(totalGrossExact)
  const totalNet = roundKc(rows.reduce((s, r) => s + r.base, 0))
  let totalVat = roundKc(rows.reduce((s, r) => s + r.vat, 0))
  // Final integer reconcile: net + vat == gross
  if (totalNet + totalVat !== totalGross) {
    totalVat = totalGross - totalNet
  }

  return { rows, totalGross, totalNet, totalVat, printLines }
}

export function formatKcPlain(n: number): string {
  return `${roundKc(n).toLocaleString('cs-CZ')} Kč`
}

export function receiptPaymentLabel(method: POSPaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Hotovost'
    case 'card':
      return 'Karta'
    case 'combined':
      return 'Hotovost + Karta'
    case 'invoice':
      return 'Na účet akce'
    case 'all_inclusive':
      return 'Na účet akce'
    default:
      return 'Hotovost'
  }
}

export function formatVenueAddress(profile: Pick<AgencyProfile, 'street' | 'city' | 'zip'>): string {
  const parts = [profile.street, [profile.zip, profile.city].filter(Boolean).join(' ')]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  return parts.join(', ') || '—'
}

export function isVatPayer(dic: string | null | undefined): boolean {
  return Boolean(String(dic || '').trim())
}

/** Sequential F2026XXXX tax document number from project + local receipt seq. */
export function formatTaxDocumentNumber(opts: {
  projectSequence?: number
  receiptNumber?: string
  sequential?: number
}): string {
  // Prefer already-assigned F2026… numbers
  const existing = String(opts.receiptNumber || '')
  if (/^F20\d{2}\d+$/i.test(existing)) return existing.toUpperCase()

  const year = new Date().getFullYear()
  const seq = Math.max(
    1,
    Number(opts.sequential) ||
      Number(opts.projectSequence) ||
      Number(String(existing).replace(/\D/g, '').slice(-4)) ||
      1,
  )
  return `F${year}${String(seq).padStart(4, '0')}`
}

export function receiptPrintedAtLabel(date: Date = new Date()): string {
  return formatCzechDateTimeFull(date)
}

/** Monochrome EventFlow "E" spark mark as inline SVG for thermal HTML. */
export const THERMAL_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 64 64" aria-label="EventFlow">
  <rect width="64" height="64" rx="10" fill="#000"/>
  <path d="M16 14h32v5.5H24.5v9H44v5.5H24.5v14.5H16V14z" fill="#fff"/>
  <path d="M48 8l1.5 4.5L54 14l-4.5 1.5L48 20l-1.5-4.5L42 14l4.5-1.5L48 8z" fill="#fff"/>
</svg>
`.trim()
