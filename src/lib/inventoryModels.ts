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

  const unitOk = (i: InventoryItem) =>
    !unit || normalizeUnit(i.unit) === unit || normalizeUnit(i.unit) === 'porce'

  const exact = list.find((i) => normalizeName(i.name) === nameKey && unitOk(i))
  if (exact) return exact

  const exactAnyUnit = list.find((i) => normalizeName(i.name) === nameKey)
  if (exactAnyUnit) return exactAnyUnit

  // Fuzzy: "Prosecco" ↔ "Prosecco Extra Dry", "Pivo" ↔ "Pivo ležák 12°"
  const fuzzy = list.find((i) => {
    const n = normalizeName(i.name)
    if (!unitOk(i) && unit) return false
    return (
      n.startsWith(nameKey) ||
      nameKey.startsWith(n) ||
      n.includes(` ${nameKey}`) ||
      nameKey.includes(n)
    )
  })
  if (fuzzy) return fuzzy

  return list.find((i) => {
    const n = normalizeName(i.name)
    return n.includes(nameKey) || nameKey.includes(n.split(' ')[0] || '')
  })
}

export function createEmptyInventoryItem(
  partial: Partial<InventoryItem> & { name: string }
): InventoryItem {
  const now = new Date().toISOString()
  const purchase = Number(partial.purchase_price) || 0
  const sale =
    Number(partial.sale_price) ||
    (purchase > 0 ? Math.round(purchase * 1.8 * 100) / 100 : 0)
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
    sale_price: sale,
    vat_rate: Number(partial.vat_rate) || 12,
    unit: normalizeUnit(partial.unit),
    current_quantity: Number(partial.current_quantity) || 0,
    minimum_quantity: Number(partial.minimum_quantity) || 0,
    pack_volume:
      partial.pack_volume === undefined
        ? null
        : partial.pack_volume == null
          ? null
          : Number(partial.pack_volume) || null,
    open_pack_remaining:
      partial.open_pack_remaining === undefined
        ? null
        : partial.open_pack_remaining == null
          ? null
          : Number(partial.open_pack_remaining),
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
      name: 'Prosecco Extra Dry 0.7l',
      barcode: '8594001100011',
      category: 'beverage',
      subcategory: 'vino',
      supplier: 'Vinotéka Praha',
      purchase_price: 185,
      sale_price: 420,
      vat_rate: 21,
      unit: 'ks',
      pack_volume: 0.7,
      current_quantity: 48,
      minimum_quantity: 12,
      warehouse_section: 'Bar A',
      shelf_life: '2027-06',
    },
    {
      name: 'Sud piva ležák 12° 50l',
      barcode: '8594001100028',
      category: 'beverage',
      subcategory: 'pivo',
      supplier: 'Pivovar Region',
      purchase_price: 2200,
      sale_price: 0,
      vat_rate: 21,
      unit: 'ks',
      pack_volume: 50,
      current_quantity: 2,
      open_pack_remaining: 50,
      minimum_quantity: 1,
      warehouse_section: 'Bar B',
    },
    {
      name: 'Rum Cubano 0.7l',
      barcode: '8594001100097',
      category: 'beverage',
      subcategory: 'destilaty',
      supplier: 'Destiláty Import',
      purchase_price: 520,
      sale_price: 1450,
      vat_rate: 21,
      unit: 'ks',
      pack_volume: 0.7,
      current_quantity: 8,
      open_pack_remaining: 0.7,
      minimum_quantity: 2,
      warehouse_section: 'Bar VIP',
    },
    {
      name: 'Limetky',
      barcode: '8594001100103',
      category: 'raw',
      subcategory: 'ostatni',
      supplier: 'Ovoce Fresh',
      purchase_price: 85,
      vat_rate: 12,
      unit: 'kg',
      current_quantity: 6,
      minimum_quantity: 2,
      warehouse_section: 'Chladírna 2',
      shelf_life: '2026-07-28',
    },
    {
      name: 'Sodovka',
      barcode: '8594001100110',
      category: 'beverage',
      subcategory: 'nealko',
      supplier: 'Nápoje Velkoobchod',
      purchase_price: 8,
      vat_rate: 21,
      unit: 'l',
      current_quantity: 60,
      minimum_quantity: 15,
      warehouse_section: 'Bar B',
    },
    {
      name: 'Cola sirup / Cola',
      barcode: '8594001100127',
      category: 'beverage',
      subcategory: 'nealko',
      supplier: 'Nápoje Velkoobchod',
      purchase_price: 45,
      vat_rate: 21,
      unit: 'l',
      current_quantity: 25,
      minimum_quantity: 8,
      warehouse_section: 'Bar B',
    },
    {
      name: 'Máta čerstvá',
      barcode: '8594001100134',
      category: 'raw',
      subcategory: 'ostatni',
      supplier: 'Ovoce Fresh',
      purchase_price: 40,
      vat_rate: 12,
      unit: 'ks',
      current_quantity: 18,
      minimum_quantity: 4,
      warehouse_section: 'Chladírna 2',
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
    {
      name: 'Cukr třtinový',
      barcode: '8594001100141',
      category: 'raw',
      subcategory: 'ostatni',
      supplier: 'Mlýny Jih',
      purchase_price: 32,
      vat_rate: 12,
      unit: 'kg',
      current_quantity: 8,
      minimum_quantity: 2,
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
