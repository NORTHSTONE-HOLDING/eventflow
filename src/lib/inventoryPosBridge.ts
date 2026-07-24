/**
 * Bridge: InventoryItem (Sklad) → CateringItem (Kasa /pos-terminal)
 * Hybrid matrix:
 *  - Direct sale: pos_visible && !is_raw_material → 1:1 tile
 *  - Raw materials stay hidden; composite dishes deduct via recipes
 */

import type { CateringItem, InventoryItem, POSCartLine, POSSubcategory } from '../types'
import { normalizeName } from './inventoryModels'
import type { DailySpecial } from './dailySpecials'

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
  if (sub && sub !== 'ostatni') return subcategory
  const posCat = inventoryCategoryToPos(category)
  if (posCat === 'beverage') return 'nealko'
  if (posCat === 'food') return 'hlavni'
  return 'ostatni'
}

export function inventoryItemToCatering(item: InventoryItem): CateringItem {
  const posCategory = inventoryCategoryToPos(item.category)
  const category: CateringItem['category'] =
    posCategory === 'other' ? 'food' : posCategory
  return {
    id: `invpos_${item.id}`,
    name: item.name,
    recipe: item.supplier ? `Sklad · ${item.supplier}` : 'Přímý prodej ze skladu (1:1)',
    foodCost: item.average_price || item.purchase_price || 0,
    portion: 1,
    allergens: [],
    inventory: [],
    category,
    subcategory: inventorySubcategoryToPos(item.category, item.subcategory),
    sellPrice: item.sale_price || 0,
    vatRate: item.vat_rate || 12,
    plannedPortions: 9999,
    soldPortions: 0,
    ingredients: [],
    image_url: item.image_url,
    inventory_item_id: item.id,
    is_direct_sale: true,
  }
}

/** Direct POS tiles only — never expose raw materials. */
export function buildPosVisibleCatalog(items: InventoryItem[]): CateringItem[] {
  return (items ?? [])
    .filter((i) => i.pos_visible && !i.is_raw_material)
    .map(inventoryItemToCatering)
}

export function dailySpecialToCatering(special: DailySpecial): CateringItem {
  return {
    id: special.id,
    name: special.name,
    recipe: special.recipeNote || 'Polední menu · dočasná dlaždice',
    foodCost: special.foodCost,
    portion: 1,
    allergens: [],
    inventory: [],
    category: 'food',
    subcategory: special.subcategory || 'hlavni',
    sellPrice: special.sellPrice,
    vatRate: special.vatRate,
    plannedPortions: special.plannedPortions,
    soldPortions: special.soldPortions,
    ingredients: special.ingredients,
    image_url: special.image_url ?? null,
    inventory_item_id: null,
    is_direct_sale: false,
    is_daily_special: true,
    daily_special_date: special.validDate,
  }
}

/** Merge venue/event + inventory direct tiles + daily specials (no duplicate names). */
export function mergeHybridPosCatalog(opts: {
  base: CateringItem[]
  inventory: InventoryItem[]
  dailySpecials?: DailySpecial[]
}): CateringItem[] {
  const byKey = new Map<string, CateringItem>()
  for (const item of opts.base ?? []) {
    byKey.set(normalizeName(item.name), item)
  }
  for (const tile of buildPosVisibleCatalog(opts.inventory)) {
    byKey.set(normalizeName(tile.name), tile)
  }
  for (const special of opts.dailySpecials ?? []) {
    const tile = dailySpecialToCatering(special)
    byKey.set(normalizeName(tile.name), tile)
  }
  return Array.from(byKey.values())
}

/** Resolve sold cart line back to a CateringItem for hybrid deduction. */
export function resolveSaleCatalogItem(opts: {
  line: POSCartLine
  projectCatering: CateringItem[]
  inventory: InventoryItem[]
  dailySpecials: DailySpecial[]
}): CateringItem | null {
  const { line, projectCatering, inventory, dailySpecials } = opts
  if (line.isCustom || String(line.cateringId).startsWith('custom_')) return null

  const fromProject = (projectCatering ?? []).find((c) => c.id === line.cateringId)
  if (fromProject) return fromProject

  if (String(line.cateringId).startsWith('invpos_')) {
    const invId = line.inventory_item_id || line.cateringId.replace(/^invpos_/, '')
    const inv = (inventory ?? []).find((i) => i.id === invId)
    if (inv && inv.pos_visible && !inv.is_raw_material) {
      return inventoryItemToCatering(inv)
    }
  }

  const special = (dailySpecials ?? []).find((s) => s.id === line.cateringId)
  if (special) return dailySpecialToCatering(special)

  // Name fallback (prevents silent no-op when ids drift)
  const byName = normalizeName(line.name)
  const invMatch = (inventory ?? []).find(
    (i) => i.pos_visible && !i.is_raw_material && normalizeName(i.name) === byName,
  )
  if (invMatch) return inventoryItemToCatering(invMatch)

  const specialMatch = (dailySpecials ?? []).find(
    (s) => normalizeName(s.name) === byName,
  )
  if (specialMatch) return dailySpecialToCatering(specialMatch)

  return null
}

/** @deprecated use mergeHybridPosCatalog */
export function mergeWithInventoryPosTiles(
  base: CateringItem[],
  inventory: InventoryItem[],
): CateringItem[] {
  return mergeHybridPosCatalog({ base, inventory, dailySpecials: [] })
}
