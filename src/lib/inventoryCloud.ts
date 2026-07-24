import type { InventoryItem, InventoryLog, RecipeIngredientRecord } from '../types'
import { getSupabase, isSupabaseConfigured } from './supabase'
import {
  createEmptyInventoryItem,
  createInventoryLog,
  DEFAULT_USER_ID,
} from './inventoryModels'

function mapRowToItem(row: Record<string, unknown>): InventoryItem {
  return createEmptyInventoryItem({
    id: String(row.id),
    user_id: String(row.user_id || DEFAULT_USER_ID),
    name: String(row.name || ''),
    barcode: (row.barcode as string | null) ?? null,
    category: String(row.category || 'raw'),
    subcategory: String(row.subcategory || 'ostatni'),
    supplier: String(row.supplier || ''),
    purchase_price: Number(row.purchase_price) || 0,
    average_price: Number(row.average_price) || 0,
    sale_price: Number(row.sale_price) || 0,
    vat_rate: Number(row.vat_rate) || 12,
    unit: String(row.unit || 'ks'),
    current_quantity: Number(row.current_quantity) || 0,
    minimum_quantity: Number(row.minimum_quantity) || 0,
    pack_volume: row.pack_volume == null ? null : Number(row.pack_volume) || null,
    open_pack_remaining:
      row.open_pack_remaining == null ? null : Number(row.open_pack_remaining),
    image_url: row.image_url == null ? null : String(row.image_url) || null,
    shelf_life: (row.shelf_life as string | null) ?? null,
    warehouse_section: String(row.warehouse_section || 'Hlavní sklad'),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  })
}

function mapRowToLog(row: Record<string, unknown>): InventoryLog {
  return {
    id: String(row.id),
    item_id: String(row.item_id),
    type: row.type as InventoryLog['type'],
    quantity_changed: Number(row.quantity_changed) || 0,
    user_id: String(row.user_id || DEFAULT_USER_ID),
    timestamp: String(row.timestamp || new Date().toISOString()),
    note: row.note ? String(row.note) : undefined,
    unit_price: row.unit_price != null ? Number(row.unit_price) : undefined,
  }
}

export async function fetchInventoryRemote(
  userId = DEFAULT_USER_ID
): Promise<{ ok: boolean; items: InventoryItem[]; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, items: [], error: 'Supabase není nakonfigurován' }
  try {
    const { data, error } = await sb
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .order('name')
    if (error) return { ok: false, items: [], error: error.message }
    return {
      ok: true,
      items: (data ?? []).map((r) => mapRowToItem(r as Record<string, unknown>)),
    }
  } catch (e) {
    return {
      ok: false,
      items: [],
      error: e instanceof Error ? e.message : 'Chyba načtení skladu',
    }
  }
}

export async function fetchInventoryLogsRemote(
  userId = DEFAULT_USER_ID
): Promise<{ ok: boolean; logs: InventoryLog[]; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, logs: [], error: 'Supabase není nakonfigurován' }
  try {
    const { data, error } = await sb
      .from('inventory_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(200)
    if (error) return { ok: false, logs: [], error: error.message }
    return {
      ok: true,
      logs: (data ?? []).map((r) => mapRowToLog(r as Record<string, unknown>)),
    }
  } catch (e) {
    return {
      ok: false,
      logs: [],
      error: e instanceof Error ? e.message : 'Chyba načtení logů',
    }
  }
}

export async function upsertInventoryRemote(
  item: InventoryItem
): Promise<{ ok: boolean; item?: InventoryItem; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'offline' }
  try {
    const payload = {
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
      shelf_life: item.shelf_life,
      warehouse_section: item.warehouse_section,
      updated_at: new Date().toISOString(),
      created_at: item.created_at,
    }
    const { data, error } = await sb
      .from('inventory')
      .upsert(payload)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, item: mapRowToItem(data as Record<string, unknown>) }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Chyba zápisu položky',
    }
  }
}

export async function insertInventoryLogRemote(
  log: InventoryLog
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'offline' }
  try {
    const { error } = await sb.from('inventory_logs').insert({
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
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Chyba zápisu logu',
    }
  }
}

export async function pushInventorySnapshot(
  items: InventoryItem[],
  logs: InventoryLog[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'offline' }
  for (const item of items) {
    const res = await upsertInventoryRemote(item)
    if (!res.ok) return { ok: false, error: res.error }
  }
  for (const log of logs.slice(0, 50)) {
    await insertInventoryLogRemote(log)
  }
  return { ok: true }
}

export function createLocalLog(
  itemId: string,
  type: InventoryLog['type'],
  quantityChanged: number,
  extras?: { note?: string; unit_price?: number; user_id?: string }
): InventoryLog {
  return createInventoryLog({
    item_id: itemId,
    type,
    quantity_changed: quantityChanged,
    note: extras?.note,
    unit_price: extras?.unit_price,
    user_id: extras?.user_id,
  })
}

function mapRowToRecipe(row: Record<string, unknown>): RecipeIngredientRecord {
  return {
    id: String(row.id),
    catering_id: String(row.catering_id),
    catering_name: String(row.catering_name || ''),
    inventory_item_id: row.inventory_item_id ? String(row.inventory_item_id) : null,
    ingredient_name: String(row.ingredient_name || ''),
    qty_per_portion: Number(row.qty_per_portion) || 0,
    unit: String(row.unit || 'ks'),
    user_id: String(row.user_id || DEFAULT_USER_ID),
    updated_at: String(row.updated_at || new Date().toISOString()),
  }
}

export async function fetchRecipesRemote(
  userId = DEFAULT_USER_ID
): Promise<{ ok: boolean; recipes: RecipeIngredientRecord[]; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, recipes: [], error: 'Supabase není nakonfigurován' }
  try {
    const { data, error } = await sb
      .from('recipe_ingredients')
      .select('*')
      .eq('user_id', userId)
    if (error) return { ok: false, recipes: [], error: error.message }
    return {
      ok: true,
      recipes: (data ?? []).map((r) => mapRowToRecipe(r as Record<string, unknown>)),
    }
  } catch (e) {
    return {
      ok: false,
      recipes: [],
      error: e instanceof Error ? e.message : 'Chyba načtení receptur',
    }
  }
}

export async function upsertRecipeRemote(
  row: RecipeIngredientRecord
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'offline' }
  try {
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
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Chyba zápisu receptury',
    }
  }
}
