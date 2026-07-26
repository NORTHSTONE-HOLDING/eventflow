import type { PosTableTab } from '../types'
import { uid } from './documentIds'

export const DEFAULT_TABLE_LABELS = [
  { label: 'Stůl 1', billingKind: 'restaurant' as const },
  { label: 'Stůl 2', billingKind: 'restaurant' as const },
  { label: 'Stůl 3', billingKind: 'event' as const },
  { label: 'Bar VIP', billingKind: 'event' as const },
  { label: 'Terasa', billingKind: 'restaurant' as const },
] as const

const DEFAULT_SPACE_CYCLE = ['space_salon', 'space_garden', 'space_main'] as const

export const MIN_SEAT_CAPACITY = 1
export const MAX_SEAT_CAPACITY = 16
export const DEFAULT_SEAT_CAPACITY = 4

export function clampSeatCapacity(n: number | null | undefined): number {
  const v = Math.round(Number(n) || DEFAULT_SEAT_CAPACITY)
  return Math.min(MAX_SEAT_CAPACITY, Math.max(MIN_SEAT_CAPACITY, v))
}

/** null = Celý stůl (společný účet) */
export function sameSeat(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  const na = a == null || a <= 0 ? null : a
  const nb = b == null || b <= 0 ? null : b
  return na === nb
}

export function seatLabel(seatIndex: number | null | undefined): string {
  if (seatIndex == null || seatIndex <= 0) return 'Celý stůl'
  return `Židle ${seatIndex}`
}

export function createDefaultTables(): PosTableTab[] {
  const now = new Date().toISOString()
  return DEFAULT_TABLE_LABELS.map((row, i) => ({
    id: `table_default_${i + 1}`,
    label: row.label,
    lines: [],
    status: 'open' as const,
    updatedAt: now,
    billingKind: row.billingKind,
    spaceId: DEFAULT_SPACE_CYCLE[i % DEFAULT_SPACE_CYCLE.length],
    seatCapacity: i === 3 ? 6 : DEFAULT_SEAT_CAPACITY,
  }))
}

export function ensurePosTables(
  tables: PosTableTab[] | null | undefined
): PosTableTab[] {
  if (Array.isArray(tables) && tables.length > 0) {
    return tables.map((t, i) => ({
      ...t,
      lines: Array.isArray(t.lines) ? t.lines : [],
      status: t.status === 'paid' ? 'paid' : 'open',
      updatedAt: t.updatedAt || new Date().toISOString(),
      spaceId: t.spaceId || DEFAULT_SPACE_CYCLE[i % DEFAULT_SPACE_CYCLE.length],
      billingKind:
        t.billingKind ||
        ( /vip|event|salon/i.test(t.label) || i === 2
          ? 'event'
          : 'restaurant'),
      seatCapacity: clampSeatCapacity(t.seatCapacity),
    }))
  }
  return createDefaultTables()
}

export function tablesInSpace(
  tables: PosTableTab[] | null | undefined,
  spaceId: string,
): PosTableTab[] {
  return ensurePosTables(tables).filter((t) => (t.spaceId || 'space_main') === spaceId)
}

/** Resolve a valid table id — never keep orphaned activeTableId. */
export function resolveActiveTableId(
  tables: PosTableTab[] | null | undefined,
  preferredId: string | null | undefined
): string | null {
  const list = ensurePosTables(tables)
  if (!list.length) return null
  if (preferredId && list.some((t) => t.id === preferredId)) return preferredId
  return list[0].id
}

export function tableOpenTotal(table: PosTableTab | null | undefined): number {
  if (!table || !Array.isArray(table.lines)) return 0
  return Math.round(
    table.lines.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0), 0)
  )
}

/** True when line is locked after KDS dispatch. */
export function isSentCartLine(line: PosTableTab['lines'][number]): boolean {
  return line.cartState === 'sent' || line.sentToKds === true
}

export function mergeCartLine(
  lines: PosTableTab['lines'],
  incoming: PosTableTab['lines'][number]
): PosTableTab['lines'] {
  const list = Array.isArray(lines) ? [...lines] : []
  const draftIncoming = {
    ...incoming,
    lineId: incoming.lineId || uid('line'),
    qty: Math.max(1, incoming.qty),
    cartState: 'draft' as const,
    sentToKds: false,
    sentAt: null,
    kdsTicketIds: [],
  }
  // Custom items never merge — each is unique
  if (incoming.isCustom) {
    return [...list, draftIncoming]
  }
  // Only merge into other DRAFT lines — never unlock / mutate Sent rows
  // Seat-scoped: Židle N never merges into Celý stůl or another seat
  const idx = list.findIndex(
    (l) =>
      !l.isCustom &&
      !isSentCartLine(l) &&
      l.cateringId === incoming.cateringId &&
      l.unitPrice === incoming.unitPrice &&
      l.vatRate === incoming.vatRate &&
      sameSeat(l.seatIndex, incoming.seatIndex)
  )
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      qty: list[idx].qty + incoming.qty,
      cartState: 'draft',
      sentToKds: false,
      sentAt: null,
      waiterId: incoming.waiterId || list[idx].waiterId,
      waiterName: incoming.waiterName || list[idx].waiterName,
    }
    return list
  }
  return [...list, draftIncoming]
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
