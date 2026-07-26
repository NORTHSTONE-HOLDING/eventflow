/**
 * Active-shift financial metrics for Uzávěrka & Směna.
 * All amounts in whole Kč.
 */

import type {
  EventProject,
  KdsTicket,
  POSTransaction,
  ShiftCashExpense,
  ShiftCashExpenseKind,
} from '../types'
import { formatCurrency } from './documentIds'
import { formatCzechDateTime } from './czechDate'

export interface ShiftRevenueBreakdown {
  kitchen: number
  bar: number
  cash: number
  card: number
  total: number
}

export interface ShiftCashBalance {
  cashRevenue: number
  goods: number
  advances: number
  payouts: number
  /** (Tržba Hotovost) − zboží − zálohy − výplaty */
  finalCash: number
}

function txInShift(tx: POSTransaction, shiftStartedAt: string): boolean {
  const t = new Date(tx.timestamp || '').getTime()
  const start = new Date(shiftStartedAt).getTime()
  if (!Number.isFinite(t) || !Number.isFinite(start)) return false
  return t >= start
}

/** Sum sold kitchen/bar lines + cash/card from POS txs since shift start. */
export function computeShiftRevenue(
  project: EventProject | null | undefined,
  shiftStartedAt: string,
): ShiftRevenueBreakdown {
  const txs = project?.posTransactions ?? []
  let kitchen = 0
  let bar = 0
  let cash = 0
  let card = 0

  for (const tx of txs) {
    if (!txInShift(tx, shiftStartedAt)) continue
    for (const line of tx.lines ?? []) {
      const lineTotal =
        (Number(line.unitPrice) || 0) * (Number(line.qty) || 0)
      if (line.category === 'beverage') bar += lineTotal
      else kitchen += lineTotal
    }
    const amount = Number(tx.totalGross) || 0
    if (tx.paymentMethod === 'cash') {
      cash += amount
    } else if (tx.paymentMethod === 'combined') {
      cash += Number(tx.cashAmount) || 0
      card += Number(tx.cardAmount) || amount - (Number(tx.cashAmount) || 0)
    } else if (
      tx.paymentMethod === 'card' ||
      tx.paymentMethod === 'apple_pay' ||
      tx.paymentMethod === 'google_pay' ||
      tx.paymentMethod === 'invoice' ||
      tx.paymentMethod === 'all_inclusive'
    ) {
      card += amount
    } else {
      card += amount
    }
  }

  return {
    kitchen: Math.round(kitchen),
    bar: Math.round(bar),
    cash: Math.round(cash),
    card: Math.round(card),
    total: Math.round(cash + card),
  }
}

export function sumExpensesByKind(
  expenses: ShiftCashExpense[],
  kind: ShiftCashExpenseKind,
): number {
  return Math.round(
    (expenses ?? [])
      .filter((e) => e.kind === kind)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
  )
}

export function computeCashBalance(
  cashRevenue: number,
  expenses: ShiftCashExpense[],
): ShiftCashBalance {
  const goods = sumExpensesByKind(expenses, 'goods_cash')
  const advances = sumExpensesByKind(expenses, 'staff_advance')
  const payouts = sumExpensesByKind(expenses, 'staff_payout')
  return {
    cashRevenue: Math.round(cashRevenue),
    goods,
    advances,
    payouts,
    finalCash: Math.round(cashRevenue - goods - advances - payouts),
  }
}

/** Completed tickets belonging to the active shift window. */
export function filterShiftCompletedTickets(
  tickets: KdsTicket[],
  shiftStartedAt: string,
  station?: 'kitchen' | 'bar' | 'all',
): KdsTicket[] {
  const start = new Date(shiftStartedAt).getTime()
  return (tickets ?? [])
    .filter((t) => t.status === 'done')
    .filter((t) => {
      const origin = new Date(t.completedAt || t.dispatchedAt || t.createdAt).getTime()
      return Number.isFinite(origin) && Number.isFinite(start) && origin >= start
    })
    .filter((t) =>
      !station || station === 'all' ? true : t.station === station,
    )
    .sort(
      (a, b) =>
        new Date(b.completedAt || b.createdAt).getTime() -
        new Date(a.completedAt || a.createdAt).getTime(),
    )
}

export function formatPrepDurationLabel(prepDurationSec: number | null | undefined): string {
  const sec = Math.max(0, Math.round(Number(prepDurationSec) || 0))
  if (sec < 60) return `Vydáno za ${sec} s`
  const mins = Math.max(1, Math.round(sec / 60))
  return `Vydáno za ${mins} min`
}

export function expenseKindLabel(kind: ShiftCashExpenseKind): string {
  switch (kind) {
    case 'goods_cash':
      return 'Platba zboží v hotovosti'
    case 'staff_advance':
      return 'Záloha zaměstnanci'
    case 'staff_payout':
      return 'Výplata zaměstnanci'
    default:
      return kind
  }
}

/** Professional 80mm black-and-white thermal closure layout (plain text). */
export function buildShiftClosureThermal(opts: {
  venueName: string
  managerName: string
  closedAt: Date | string
  revenue: ShiftRevenueBreakdown
  balance: ShiftCashBalance
  expenses: ShiftCashExpense[]
  shiftId: string
}): string {
  const when = formatCzechDateTime(opts.closedAt)
  const pad = (label: string, value: string) => {
    const room = Math.max(1, 32 - label.length - value.length)
    return `${label}${' '.repeat(room)}${value}`
  }
  const lines: string[] = [
    '================================',
    '     DENNÍ UZÁVĚRKA SMĚNY',
    '================================',
    opts.venueName || 'EventFlow',
    `Datum a čas: ${when}`,
    `Vedoucí směny: ${opts.managerName}`,
    `ID směny: ${opts.shiftId.slice(-8).toUpperCase()}`,
    '--------------------------------',
    'TRŽBY',
    pad('Tržba KUCHYŇ:', formatCurrency(opts.revenue.kitchen)),
    pad('Tržba BAR:', formatCurrency(opts.revenue.bar)),
    pad('Tržba HOTOVOST:', formatCurrency(opts.revenue.cash)),
    pad('Tržba TERMINÁL:', formatCurrency(opts.revenue.card)),
    pad('TRŽBA CELKEM:', formatCurrency(opts.revenue.total)),
    '--------------------------------',
    'ODEPISY Z HOTOVOSTI',
  ]

  if (!opts.expenses.length) {
    lines.push('(bez hotovostních výdejů)')
  } else {
    for (const e of opts.expenses) {
      const who = e.staffName ? ` · ${e.staffName}` : ''
      lines.push(`${expenseKindLabel(e.kind)}${who}`)
      lines.push(pad('  ', formatCurrency(e.amount)))
      if (e.note) lines.push(`  ${e.note}`)
    }
  }

  lines.push('--------------------------------')
  lines.push(pad('Platba zboží:', formatCurrency(opts.balance.goods)))
  lines.push(pad('Zálohy:', formatCurrency(opts.balance.advances)))
  lines.push(pad('Výplaty:', formatCurrency(opts.balance.payouts)))
  lines.push('================================')
  lines.push('KONEČNÝ STAV POKLADNY')
  lines.push('(Hotovost k předání)')
  lines.push(formatCurrency(opts.balance.finalCash))
  lines.push('================================')
  lines.push('')
  lines.push('Předal(a): ....................')
  lines.push('')
  lines.push('Převzal(a): ...................')
  lines.push('')
  lines.push('Podpis: .......................')
  lines.push('')
  lines.push('EventFlow · uzávěrka směny')
  lines.push('')
  return lines.join('\n')
}
