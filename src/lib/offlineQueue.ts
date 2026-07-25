import type {
  InventoryItem,
  InventoryLog,
  OfflineQueueEntry,
  OfflineQueueKind,
  RecipeIngredientRecord,
  StaffAdvance,
  StaffPayrollLock,
  StaffShiftRecord,
} from '../types'
import { uid } from './documentIds'
import { getInventorySyncMode, getSupabase, probeSupabaseConnection } from './supabase'

const QUEUE_KEY = 'eventflow-offline-queue'

function readQueue(): OfflineQueueEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OfflineQueueEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(entries: OfflineQueueEntry[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(0, 400)))
  } catch {
    // quota — drop oldest
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(0, 100)))
    } catch {
      // ignore
    }
  }
}

export function enqueueOffline(
  kind: OfflineQueueKind,
  payload: unknown
): OfflineQueueEntry {
  const entry: OfflineQueueEntry = {
    id: uid('oq'),
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  }
  const q = readQueue()
  q.push(entry)
  writeQueue(q)
  return entry
}

export function getOfflineQueueSize(): number {
  return readQueue().length
}

export function peekOfflineQueue(): OfflineQueueEntry[] {
  return readQueue()
}

async function flushOne(entry: OfflineQueueEntry): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'offline' }

  try {
    if (entry.kind === 'inventory_upsert') {
      const item = entry.payload as InventoryItem
      const { error } = await sb.from('inventory').upsert({
        id: item.id,
        user_id: item.user_id,
        name: item.name,
        barcode: item.barcode,
        category: item.category,
        subcategory: item.subcategory,
        supplier: item.supplier,
        purchase_price: item.purchase_price,
        average_price: item.average_price,
        sale_price: item.sale_price,
        vat_rate: item.vat_rate,
        unit: item.unit,
        current_quantity: item.current_quantity,
        minimum_quantity: item.minimum_quantity,
        pack_volume: item.pack_volume,
        open_pack_remaining: item.open_pack_remaining,
        image_url: item.image_url,
        pos_visible: Boolean(item.pos_visible),
        is_raw_material: Boolean(item.is_raw_material),
        shelf_life: item.shelf_life,
        warehouse_section: item.warehouse_section,
        updated_at: item.updated_at,
        created_at: item.created_at,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'inventory_delete') {
      const payload = entry.payload as { id: string }
      const { error } = await sb.from('inventory').delete().eq('id', payload.id)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'inventory_log') {
      const log = entry.payload as InventoryLog
      const { error } = await sb.from('inventory_logs').upsert({
        id: log.id,
        item_id: log.item_id,
        type: log.type,
        quantity_changed: log.quantity_changed,
        user_id: log.user_id,
        timestamp: log.timestamp,
        note: log.note ?? null,
        unit_price: log.unit_price ?? null,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'recipe_upsert') {
      const row = entry.payload as RecipeIngredientRecord
      const { error } = await sb.from('recipe_ingredients').upsert({
        id: row.id,
        catering_id: row.catering_id,
        catering_name: row.catering_name,
        inventory_item_id: row.inventory_item_id,
        ingredient_name: row.ingredient_name,
        qty_per_portion: row.qty_per_portion,
        unit: row.unit,
        user_id: row.user_id,
        updated_at: row.updated_at,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'document_sequence') {
      const payload = entry.payload as { id: string; year: number; last_sequence: number }
      const { error } = await sb.from('document_sequences').upsert({
        id: payload.id,
        year: payload.year,
        last_sequence: payload.last_sequence,
        updated_at: new Date().toISOString(),
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'staff_shift_upsert') {
      const s = entry.payload as StaffShiftRecord
      const { error } = await sb.from('staff_shifts').upsert({
        id: s.id,
        user_id: s.user_id,
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        date: s.date,
        shift_start: s.shift_start,
        shift_end: s.shift_end,
        hours: s.hours,
        hourly_wage: s.hourly_wage,
        labor_cost: s.labor_cost,
        source: s.source,
        project_id: s.project_id,
        note: s.note,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'staff_shift_delete') {
      const payload = entry.payload as { id: string }
      const { error } = await sb.from('staff_shifts').delete().eq('id', payload.id)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'staff_advance_upsert') {
      const a = entry.payload as StaffAdvance
      const { error } = await sb.from('staff_advances').upsert({
        id: a.id,
        user_id: a.user_id,
        staff_id: a.staff_id,
        staff_name: a.staff_name,
        amount: a.amount,
        month_key: a.month_key,
        note: a.note,
        created_at: a.created_at,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    if (entry.kind === 'staff_payroll_upsert') {
      const p = entry.payload as StaffPayrollLock
      const { error } = await sb.from('staff_payroll').upsert({
        id: p.id,
        user_id: p.user_id,
        staff_id: p.staff_id,
        staff_name: p.staff_name,
        role: p.role,
        month_key: p.month_key,
        hours: p.hours,
        gross_wage: p.gross_wage,
        advances: p.advances,
        payout: p.payout,
        paid: p.paid,
        paid_at: p.paid_at,
        updated_at: p.updated_at,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    return { ok: false, error: 'Neznámý typ fronty' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Flush selhal' }
  }
}

/** Replay offline queue when cloud is reachable. */
export async function flushOfflineQueue(): Promise<{
  flushed: number
  remaining: number
  error?: string
}> {
  if (getInventorySyncMode() !== 'online') {
    return { flushed: 0, remaining: getOfflineQueueSize() }
  }
  const reachable = await probeSupabaseConnection()
  if (!reachable) {
    return { flushed: 0, remaining: getOfflineQueueSize(), error: 'Cloud nedostupný' }
  }

  let queue = readQueue()
  let flushed = 0
  const kept: OfflineQueueEntry[] = []

  for (const entry of queue) {
    const res = await flushOne(entry)
    if (res.ok) {
      flushed += 1
    } else {
      kept.push({
        ...entry,
        attempts: entry.attempts + 1,
        lastError: res.error,
      })
    }
  }

  writeQueue(kept)
  return { flushed, remaining: kept.length }
}

/** Persist to cloud or enqueue offline. */
export async function persistOrQueue(
  kind: OfflineQueueKind,
  payload: unknown
): Promise<{ mode: 'online' | 'queued'; error?: string }> {
  if (getInventorySyncMode() !== 'online') {
    enqueueOffline(kind, payload)
    return { mode: 'queued' }
  }
  const reachable = await probeSupabaseConnection()
  if (!reachable) {
    enqueueOffline(kind, payload)
    return { mode: 'queued', error: 'Cloud nedostupný — uloženo lokálně' }
  }
  const fake: OfflineQueueEntry = {
    id: 'direct',
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  }
  const res = await flushOne(fake)
  if (!res.ok) {
    enqueueOffline(kind, payload)
    return { mode: 'queued', error: res.error }
  }
  return { mode: 'online' }
}
