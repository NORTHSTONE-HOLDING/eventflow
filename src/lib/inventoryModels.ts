import type {
  InventoryItem,
  InventoryLog,
  InventoryLogType,
  InventoryUnit,
} from '../types'
import { uid } from './documentIds'

export const DEFAULT_USER_ID = 'eventflow_local'

export function normalizeUnit(unit: string | null | undefined): InventoryUnit | string {
  const u = String(unit || 'ks').trim().toLowerCase()
  if (u === 'ks' || u === 'kg' || u === 'l' || u === 'ml' || u === 'g' || u === 'porce') {
    return u
  }
  if (u === 'lit' || u === 'litr' || u === 'litry') return 'l'
  if (u === 'kus' || u === 'kusy' || u === 'bal') return 'ks'
  return u || 'ks'
}

export function normalizeName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function matchInventoryItem(
  items: InventoryItem[],
  opts: { name?: string; barcode?: string | null; unit?: string }
): InventoryItem | undefined {
  const list = Array.isArray(items) ? items : []
  const barcode = opts.barcode?.trim()
  if (barcode) {
    const byBarcode = list.find((i) => i.barcode && i.barcode === barcode)
    if (byBarcode) return byBarcode
  }
  const nameKey = normalizeName(opts.name || '')
  if (!nameKey) return undefined
  const unit = opts.unit ? normalizeUnit(opts.unit) : null
  return (
    list.find(
      (i) =>
        normalizeName(i.name) === nameKey &&
        (!unit || normalizeUnit(i.unit) === unit)
    ) || list.find((i) => normalizeName(i.name) === nameKey)
  )
}

export function createEmptyInventoryItem(
  partial: Partial<InventoryItem> & { name: string }
): InventoryItem {
  const now = new Date().toISOString()
  const purchase = Number(partial.purchase_price) || 0
  return {
    id: partial.id || uid('inv'),
    user_id: partial.user_id || DEFAULT_USER_ID,
    name: partial.name.trim(),
    barcode: partial.barcode ?? null,
    category: partial.category || 'raw',
    subcategory: partial.subcategory || 'ostatni',
    supplier: partial.supplier || '',
    purchase_price: purchase,
    average_price: Number(partial.average_price) || purchase,
    vat_rate: Number(partial.vat_rate) || 12,
    unit: normalizeUnit(partial.unit),
    current_quantity: Number(partial.current_quantity) || 0,
    minimum_quantity: Number(partial.minimum_quantity) || 0,
    shelf_life: partial.shelf_life ?? null,
    warehouse_section: partial.warehouse_section || 'Hlavní sklad',
    created_at: partial.created_at || now,
    updated_at: partial.updated_at || now,
  }
}

export function createInventoryLog(opts: {
  item_id: string
  type: InventoryLogType
  quantity_changed: number
  user_id?: string
  note?: string
  unit_price?: number
}): InventoryLog {
  return {
    id: uid('ilog'),
    item_id: opts.item_id,
    type: opts.type,
    quantity_changed: Math.round(opts.quantity_changed * 1000) / 1000,
    user_id: opts.user_id || DEFAULT_USER_ID,
    timestamp: new Date().toISOString(),
    note: opts.note,
    unit_price: opts.unit_price,
  }
}

export function seedDefaultInventory(userId = DEFAULT_USER_ID): InventoryItem[] {
  const rows: Array<Partial<InventoryItem> & { name: string }> = [
    {
      name: 'Prosecco Extra Dry',
      barcode: '8594001100011',
      category: 'beverage',
      subcategory: 'vino',
      supplier: 'Vinotéka Praha',
      purchase_price: 185,
      vat_rate: 21,
      unit: 'ks',
      current_quantity: 48,
      minimum_quantity: 12,
      warehouse_section: 'Bar A',
      shelf_life: '2027-06',
    },
    {
      name: 'Pivo ležák 12°',
      barcode: '8594001100028',
      category: 'beverage',
      subcategory: 'pivo',
      supplier: 'Pivovar Region',
      purchase_price: 22,
      vat_rate: 21,
      unit: 'ks',
      current_quantity: 120,
      minimum_quantity: 24,
      warehouse_section: 'Bar B',
    },
    {
      name: 'Losos filet',
      barcode: '8594001100035',
      category: 'raw',
      subcategory: 'hlavni',
      supplier: 'Seafood CZ',
      purchase_price: 420,
      vat_rate: 12,
      unit: 'kg',
      current_quantity: 8.5,
      minimum_quantity: 2,
      warehouse_section: 'Chladírna 1',
      shelf_life: '2026-07-25',
    },
    {
      name: 'Hovězí svíčková',
      barcode: '8594001100042',
      category: 'raw',
      subcategory: 'hlavni',
      supplier: 'Maso Fresh',
      purchase_price: 380,
      vat_rate: 12,
      unit: 'kg',
      current_quantity: 12,
      minimum_quantity: 3,
      warehouse_section: 'Chladírna 1',
    },
    {
      name: 'Led kostky',
      barcode: '8594001100059',
      category: 'package',
      subcategory: 'ostatni',
      supplier: 'Ice Service',
      purchase_price: 35,
      vat_rate: 21,
      unit: 'kg',
      current_quantity: 40,
      minimum_quantity: 10,
      warehouse_section: 'Bar sklad',
    },
    {
      name: 'Nealko Cola 0.33',
      barcode: '8594001100066',
      category: 'beverage',
      subcategory: 'nealko',
      supplier: 'Nápoje Velkoobchod',
      purchase_price: 12,
      vat_rate: 21,
      unit: 'ks',
      current_quantity: 96,
      minimum_quantity: 24,
      warehouse_section: 'Bar B',
    },
    {
      name: 'Mouka hladká',
      barcode: '8594001100073',
      category: 'raw',
      subcategory: 'raut',
      supplier: 'Mlýny Jih',
      purchase_price: 18,
      vat_rate: 12,
      unit: 'kg',
      current_quantity: 25,
      minimum_quantity: 5,
      warehouse_section: 'Suchý sklad',
    },
    {
      name: 'Olivový olej Extra Virgin',
      barcode: '8594001100080',
      category: 'raw',
      subcategory: 'ostatni',
      supplier: 'Mediterrano',
      purchase_price: 210,
      vat_rate: 12,
      unit: 'l',
      current_quantity: 6,
      minimum_quantity: 1.5,
      warehouse_section: 'Suchý sklad',
    },
  ]

  return rows.map((r) => createEmptyInventoryItem({ ...r, user_id: userId }))
}

export function weightedAveragePrice(
  currentQty: number,
  currentAvg: number,
  addQty: number,
  addPrice: number
): number {
  const q0 = Math.max(0, currentQty)
  const q1 = Math.max(0, addQty)
  if (q0 + q1 <= 0) return addPrice
  return Math.round(((q0 * currentAvg + q1 * addPrice) / (q0 + q1)) * 100) / 100
}

export function inventuraVarianceValue(row: {
  expected_quantity: number
  actual_quantity: number
  unit_price: number
}): { deltaQty: number; deltaValue: number; kind: 'manko' | 'prebytek' | 'ok' } {
  const deltaQty =
    Math.round((row.actual_quantity - row.expected_quantity) * 1000) / 1000
  const deltaValue = Math.round(deltaQty * row.unit_price)
  if (deltaQty < 0) return { deltaQty, deltaValue, kind: 'manko' }
  if (deltaQty > 0) return { deltaQty, deltaValue, kind: 'prebytek' }
  return { deltaQty: 0, deltaValue: 0, kind: 'ok' }
}
