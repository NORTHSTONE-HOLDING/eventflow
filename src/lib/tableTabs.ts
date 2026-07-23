import type { PosTableTab } from '../types'
import { uid } from './documentIds'

export const DEFAULT_TABLE_LABELS = [
  'Stůl 1',
  'Stůl 2',
  'Stůl 3',
  'Bar VIP',
  'Terasa',
] as const

export function createDefaultTables(): PosTableTab[] {
  const now = new Date().toISOString()
  return DEFAULT_TABLE_LABELS.map((label, i) => ({
    id: `table_default_${i + 1}`,
    label,
    lines: [],
    status: 'open' as const,
    updatedAt: now,
  }))
}

export function ensurePosTables(
  tables: PosTableTab[] | null | undefined
): PosTableTab[] {
  if (Array.isArray(tables) && tables.length > 0) {
    return tables.map((t) => ({
      ...t,
      lines: Array.isArray(t.lines) ? t.lines : [],
      status: t.status === 'paid' ? 'paid' : 'open',
      updatedAt: t.updatedAt || new Date().toISOString(),
    }))
  }
  return createDefaultTables()
}

export function tableOpenTotal(table: PosTableTab | null | undefined): number {
  if (!table || !Array.isArray(table.lines)) return 0
  return Math.round(
    table.lines.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0), 0)
  )
}

export function mergeCartLine(
  lines: PosTableTab['lines'],
  incoming: PosTableTab['lines'][number]
): PosTableTab['lines'] {
  const list = Array.isArray(lines) ? [...lines] : []
  // Custom items never merge — each is unique
  if (incoming.isCustom) {
    return [
      ...list,
      { ...incoming, lineId: incoming.lineId || uid('line'), qty: Math.max(1, incoming.qty) },
    ]
  }
  const idx = list.findIndex(
    (l) =>
      !l.isCustom &&
      l.cateringId === incoming.cateringId &&
      l.unitPrice === incoming.unitPrice &&
      l.vatRate === incoming.vatRate
  )
  if (idx >= 0) {
    list[idx] = { ...list[idx], qty: list[idx].qty + incoming.qty }
    return list
  }
  return [...list, { ...incoming, lineId: incoming.lineId || uid('line') }]
}

/**
 * Remove paid quantities from table lines.
 * Returns remaining lines after deducting `paid` qtys (matched by lineId or cateringId).
 */
export function subtractPaidLines(
  tableLines: PosTableTab['lines'],
  paidLines: PosTableTab['lines']
): PosTableTab['lines'] {
  const remaining = (tableLines ?? []).map((l) => ({ ...l }))
  for (const paid of paidLines ?? []) {
    let qtyLeft = paid.qty
    for (let i = 0; i < remaining.length && qtyLeft > 0; i++) {
      const row = remaining[i]
      const sameLine =
        (paid.lineId && row.lineId && paid.lineId === row.lineId) ||
        (!paid.isCustom &&
          !row.isCustom &&
          row.cateringId === paid.cateringId &&
          row.unitPrice === paid.unitPrice)
      if (!sameLine) continue
      const take = Math.min(row.qty, qtyLeft)
      row.qty -= take
      qtyLeft -= take
    }
  }
  return remaining.filter((l) => l.qty > 0)
}

export function calcCashChange(tendered: number, due: number): number {
  const t = Math.max(0, Number(tendered) || 0)
  const d = Math.max(0, Number(due) || 0)
  return Math.max(0, Math.round(t - d))
}
