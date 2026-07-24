/**
 * EventFlow — Inventory / Sklad category registry helpers
 * Aligns with POS tabs: Vše · Jídlo · Pití · Inventář · Technika (+ custom)
 */

import { normalizeName } from './inventoryModels'

export interface InventorySubcategoryDef {
  id: string
  label: string
}

export interface InventoryCategoryDef {
  id: string
  label: string
  aliases: string[]
  subs: InventorySubcategoryDef[]
  builtin: boolean
}

export const ALL_CATEGORY_ID = 'all'
export const ALL_SUBCATEGORY_ID = 'all'

/** Built-in inventory categories (persisted ids on InventoryItem.category). */
export const BUILTIN_INVENTORY_CATEGORIES: InventoryCategoryDef[] = [
  {
    id: 'raw',
    label: 'Jídlo',
    aliases: ['jidlo', 'jídlo', 'food', 'raw', 'kitchen', 'kuchyne', 'kuchyn'],
    builtin: true,
    subs: [
      { id: 'predkrmy', label: 'Předkrmy' },
      { id: 'hlavni', label: 'Hlavní chody' },
      { id: 'dezerty', label: 'Dezerty' },
      { id: 'raut', label: 'Raut' },
      { id: 'ostatni', label: 'Ostatní' },
    ],
  },
  {
    id: 'beverage',
    label: 'Pití',
    aliases: ['piti', 'pití', 'drink', 'beverage', 'bar', 'napoj', 'nápoj'],
    builtin: true,
    subs: [
      { id: 'pivo', label: 'Pivo' },
      { id: 'vino', label: 'Víno' },
      { id: 'alkohol', label: 'Alkohol' },
      { id: 'nealko', label: 'Nealko' },
      { id: 'ostatni', label: 'Ostatní' },
    ],
  },
  {
    id: 'package',
    label: 'Inventář',
    aliases: ['inventar', 'inventář', 'package', 'equipment', 'other', 'vybaveni'],
    builtin: true,
    subs: [
      { id: 'obaly', label: 'Obaly' },
      { id: 'pribor', label: 'Příbory' },
      { id: 'dekorace', label: 'Dekorace' },
      { id: 'ostatni', label: 'Ostatní' },
    ],
  },
  {
    id: 'tech',
    label: 'Technika',
    aliases: ['technika', 'tech', 'av', 'ozvuceni', 'ozvučení', 'osvetleni', 'osvětlení', 'equipment_av'],
    builtin: true,
    subs: [
      { id: 'ozvuceni', label: 'Ozvučení' },
      { id: 'osvetleni', label: 'Osvětlení' },
      { id: 'av', label: 'AV technika' },
      { id: 'ostatni', label: 'Ostatní' },
    ],
  },
]

export function slugifyCategoryLabel(label: string): string {
  const base = normalizeName(label)
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return base ? `custom_${base}` : `custom_${Date.now().toString(36)}`
}

export function createCustomCategoryDef(label: string): InventoryCategoryDef {
  const trimmed = label.trim()
  return {
    id: slugifyCategoryLabel(trimmed),
    label: trimmed,
    aliases: [normalizeName(trimmed)],
    builtin: false,
    subs: [{ id: 'ostatni', label: 'Ostatní' }],
  }
}

export function mergeCategoryLists(
  custom: InventoryCategoryDef[],
): InventoryCategoryDef[] {
  const byId = new Map<string, InventoryCategoryDef>()
  for (const c of BUILTIN_INVENTORY_CATEGORIES) byId.set(c.id, c)
  for (const c of custom) {
    if (!c?.id || !c?.label) continue
    if (byId.has(c.id) && byId.get(c.id)?.builtin) continue
    byId.set(c.id, {
      ...c,
      builtin: false,
      aliases: Array.isArray(c.aliases) ? c.aliases : [normalizeName(c.label)],
      subs:
        Array.isArray(c.subs) && c.subs.length
          ? c.subs
          : [{ id: 'ostatni', label: 'Ostatní' }],
    })
  }
  return Array.from(byId.values())
}

export function findCategoryDef(
  categories: InventoryCategoryDef[],
  idOrLabel: string,
): InventoryCategoryDef | undefined {
  const key = normalizeName(idOrLabel)
  if (!key) return undefined
  return categories.find(
    (c) =>
      c.id === idOrLabel ||
      normalizeName(c.label) === key ||
      c.aliases.some((a) => normalizeName(a) === key) ||
      normalizeName(c.id) === key,
  )
}

/** Resolve any free-text / Czech label / alias → persisted inventory category id. */
export function resolveInventoryCategoryId(
  raw: string,
  categories: InventoryCategoryDef[] = BUILTIN_INVENTORY_CATEGORIES,
): string {
  const found = findCategoryDef(categories, raw)
  if (found) return found.id
  const key = normalizeName(raw)
  if (!key) return 'raw'
  // Legacy POS food id
  if (key === 'food') return 'raw'
  return slugifyCategoryLabel(raw)
}

export function categoryLabel(
  categoryId: string,
  categories: InventoryCategoryDef[] = BUILTIN_INVENTORY_CATEGORIES,
): string {
  return findCategoryDef(categories, categoryId)?.label || categoryId || '—'
}

export function subcategoryLabel(
  categoryId: string,
  subcategoryId: string,
  categories: InventoryCategoryDef[] = BUILTIN_INVENTORY_CATEGORIES,
): string {
  const cat = findCategoryDef(categories, categoryId)
  const sub = cat?.subs.find((s) => s.id === subcategoryId)
  return sub?.label || subcategoryId || '—'
}

/** Map legacy / POS / import subcategory ids into inventory filter buckets. */
export function normalizeInventorySubcategory(
  categoryId: string,
  subcategoryId: string,
): string {
  const sub = normalizeName(subcategoryId || 'ostatni')
  if (!sub || sub === 'ostatni' || sub.startsWith('import_')) return 'ostatni'

  if (categoryId === 'beverage' || categoryId === 'Pití') {
    if (sub === 'pivo') return 'pivo'
    if (sub === 'vino' || sub.includes('vino')) return 'vino'
    if (sub === 'nealko') return 'nealko'
    if (
      sub === 'alkohol' ||
      sub === 'destilaty' ||
      sub === 'koktejly' ||
      sub.includes('destil') ||
      sub.includes('koktejl') ||
      sub.includes('alcohol')
    ) {
      return 'alkohol'
    }
  }

  if (categoryId === 'raw' || categoryId === 'food') {
    if (sub === 'predkrmy') return 'predkrmy'
    if (sub === 'hlavni') return 'hlavni'
    if (sub === 'dezerty') return 'dezerty'
    if (sub === 'raut') return 'raut'
  }

  if (categoryId === 'package') {
    if (sub === 'obaly') return 'obaly'
    if (sub === 'pribor' || sub.includes('pribor')) return 'pribor'
    if (sub === 'dekorace' || sub.includes('dekor')) return 'dekorace'
  }

  if (categoryId === 'tech') {
    if (sub.includes('ozvuc')) return 'ozvuceni'
    if (sub.includes('osvetl')) return 'osvetleni'
    if (sub === 'av') return 'av'
  }

  return subcategoryId || 'ostatni'
}

export function itemMatchesInventoryFilter(
  item: { category: string; subcategory: string; name?: string },
  categoryId: string,
  subcategoryId: string,
  categories: InventoryCategoryDef[],
): boolean {
  if (categoryId !== ALL_CATEGORY_ID) {
    const cat = findCategoryDef(categories, categoryId)
    const itemKey = normalizeName(item.category)
    const matchCat =
      item.category === categoryId ||
      (cat != null &&
        (normalizeName(cat.label) === itemKey ||
          cat.aliases.some((a) => normalizeName(a) === itemKey) ||
          cat.id === item.category))
    if (!matchCat) return false
  }

  if (subcategoryId === ALL_SUBCATEGORY_ID) return true

  const resolvedCat =
    categoryId === ALL_CATEGORY_ID
      ? resolveInventoryCategoryId(item.category, categories)
      : categoryId
  const itemSub = normalizeInventorySubcategory(resolvedCat, item.subcategory)
  const filterSub = normalizeInventorySubcategory(resolvedCat, subcategoryId)

  if (filterSub === 'alkohol') {
    return (
      itemSub === 'alkohol' ||
      item.subcategory === 'destilaty' ||
      item.subcategory === 'koktejly'
    )
  }

  return itemSub === filterSub || item.subcategory === subcategoryId
}

/** Infer a sensible subcategory from product name when missing. */
export function inferInventorySubcategory(
  name: string,
  categoryId: string,
): string {
  const text = normalizeName(name)
  if (categoryId === 'beverage') {
    if (/pivo|beer|lezak|ležák/.test(text)) return 'pivo'
    if (/vino|prosecco|sekt|champagne/.test(text)) return 'vino'
    if (/rum|whisky|whiskey|vodka|gin|destil|becherovka|slivovice|koktejl|mojito/.test(text)) {
      return 'alkohol'
    }
    return 'nealko'
  }
  if (categoryId === 'raw') {
    if (/dezer|dezert|fondant|cake|zmrzlin/.test(text)) return 'dezerty'
    if (/predkrm|canape|bruschetta|polev/.test(text)) return 'predkrmy'
    if (/raut|buffet|finger/.test(text)) return 'raut'
    return 'hlavni'
  }
  if (categoryId === 'tech') {
    if (/mikrofon|repro|ozvuc|mixer|sound/.test(text)) return 'ozvuceni'
    if (/svetlo|osvetl|led|light/.test(text)) return 'osvetleni'
    if (/projektor|tv|monitor|av|kamera/.test(text)) return 'av'
  }
  if (categoryId === 'package') {
    if (/talir|sklenic|kelimek|krabic|obal/.test(text)) return 'obaly'
    if (/pribor|vidlic|nuz|lzic/.test(text)) return 'pribor'
    if (/dekor|kvetin|vaz/.test(text)) return 'dekorace'
  }
  return 'ostatni'
}
