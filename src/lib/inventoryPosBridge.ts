/**
 * Bridge: InventoryItem (Sklad) → CateringItem (Kasa /pos-terminal)
 * Only items with pos_visible === true become sale tiles.
 */

import type { CateringItem, InventoryItem, POSSubcategory } from '../types'
import { normalizeName } from './inventoryModels'

const POS_SUBS = new Set<string>([
  'predkrmy',
  'hlavni',
  'dezerty',
  'raut',
  'pivo',
  'vino',
  'koktejly',
  'nealko',
  'destilaty',
  'ostatni',
])

export function inventoryCategoryToPos(
  category: string,
): CateringItem['category'] {
  const c = normalizeName(category)
  if (c === 'beverage' || c === 'piti') return 'beverage'
  if (c === 'raw' || c === 'food' || c === 'jidlo') return 'food'
  return 'other'
}

export function inventorySubcategoryToPos(
  category: string,
  subcategory: string,
): POSSubcategory | string {
  const sub = normalizeName(subcategory || 'ostatni')
  if (sub === 'alkohol') return 'destilaty'
  if (POS_SUBS.has(sub)) return sub as POSSubcategory
  // Keep custom subcategory id so inventory filters stay aligned; POS "Vše" shows them
  if (sub && sub !== 'ostatni') return subcategory
  const posCat = inventoryCategoryToPos(category)
  if (posCat === 'beverage') return 'nealko'
  if (posCat === 'food') return 'hlavni'
  return 'ostatni'
}

export function inventoryItemToCatering(item: InventoryItem): CateringItem {
  const posCategory = inventoryCategoryToPos(item.category)
  // Waiter tabs are food|beverage — map warehouse-only parents into food so tiles remain reachable
  const category: CateringItem['category'] =
    posCategory === 'other' ? 'food' : posCategory
  return {
    id: `invpos_${item.id}`,
    name: item.name,
    recipe: item.supplier ? `Sklad · ${item.supplier}` : 'Skladová položka',
    foodCost: item.average_price || item.purchase_price || 0,
    portion: 1,
    allergens: [],
    inventory: [item.id],
    category,
    subcategory: inventorySubcategoryToPos(item.category, item.subcategory),
    sellPrice: item.sale_price || 0,
    vatRate: item.vat_rate || 12,
    plannedPortions: 9999,
    soldPortions: 0,
    ingredients: [],
    image_url: item.image_url,
    inventory_item_id: item.id,
  }
}

export function buildPosVisibleCatalog(items: InventoryItem[]): CateringItem[] {
  return (items ?? [])
    .filter((i) => i.pos_visible)
    .map(inventoryItemToCatering)
}

/** Merge venue/event menu with inventory sale tiles (inventory wins on name clash). */
export function mergeWithInventoryPosTiles(
  base: CateringItem[],
  inventory: InventoryItem[],
): CateringItem[] {
  const saleTiles = buildPosVisibleCatalog(inventory)
  const byKey = new Map<string, CateringItem>()
  for (const item of base ?? []) {
    byKey.set(normalizeName(item.name), item)
  }
  for (const tile of saleTiles) {
    byKey.set(normalizeName(tile.name), tile)
  }
  return Array.from(byKey.values())
}
