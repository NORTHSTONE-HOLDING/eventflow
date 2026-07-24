import type { CateringItem } from '../types'
import { uid } from './documentIds'

/** Permanent venue master catalog — Běžný provoz (Restaurace / Bar). */
export function buildVenueMasterCatalog(): CateringItem[] {
  const items: Array<Omit<CateringItem, 'id' | 'soldPortions' | 'plannedPortions' | 'portion' | 'foodCost' | 'inventory' | 'allergens' | 'ingredients' | 'recipe'> & {
    recipe: string
    foodCost: number
    sellPrice: number
    allergens?: string[]
  }> = [
    {
      name: 'Pilsner Urquell 0,5 l',
      recipe: 'Čepované pivo 12°',
      category: 'beverage',
      subcategory: 'pivo',
      sellPrice: 59,
      vatRate: 21,
      foodCost: 18,
      allergens: ['lepek'],
    },
    {
      name: 'Kozel 11° 0,5 l',
      recipe: 'Čepované pivo 11°',
      category: 'beverage',
      subcategory: 'pivo',
      sellPrice: 49,
      vatRate: 21,
      foodCost: 14,
      allergens: ['lepek'],
    },
    {
      name: 'Nealko pivo 0,5 l',
      recipe: 'Nealkoholické pivo',
      category: 'beverage',
      subcategory: 'nealko',
      sellPrice: 45,
      vatRate: 21,
      foodCost: 12,
    },
    {
      name: 'Casa Defra Prosecco 0,1 l',
      recipe: 'Prosecco DOC',
      category: 'beverage',
      subcategory: 'vino',
      sellPrice: 85,
      vatRate: 21,
      foodCost: 28,
      allergens: ['sulfit'],
    },
    {
      name: 'Sauvignon Blanc 0,15 l',
      recipe: 'Bílé víno',
      category: 'beverage',
      subcategory: 'vino',
      sellPrice: 79,
      vatRate: 21,
      foodCost: 24,
      allergens: ['sulfit'],
    },
    {
      name: 'Mojito',
      recipe: 'Rum, máta, limetka, cukr, soda',
      category: 'beverage',
      subcategory: 'koktejly',
      sellPrice: 145,
      vatRate: 21,
      foodCost: 42,
    },
    {
      name: 'Gin Tonic',
      recipe: 'Gin, tonic, limetka',
      category: 'beverage',
      subcategory: 'koktejly',
      sellPrice: 135,
      vatRate: 21,
      foodCost: 38,
    },
    {
      name: 'Becherovka 0,04 l',
      recipe: 'Destilát',
      category: 'beverage',
      subcategory: 'destilaty',
      sellPrice: 65,
      vatRate: 21,
      foodCost: 18,
    },
    {
      name: 'Whisky 0,04 l',
      recipe: 'Scotch / blend',
      category: 'beverage',
      subcategory: 'destilaty',
      sellPrice: 95,
      vatRate: 21,
      foodCost: 32,
    },
    {
      name: 'Cola 0,3 l',
      recipe: 'Nealko',
      category: 'beverage',
      subcategory: 'nealko',
      sellPrice: 45,
      vatRate: 21,
      foodCost: 8,
    },
    {
      name: 'Voda neperlivá 0,3 l',
      recipe: 'Nealko',
      category: 'beverage',
      subcategory: 'nealko',
      sellPrice: 35,
      vatRate: 21,
      foodCost: 5,
    },
    {
      name: 'Hranolky',
      recipe: 'Hranolky, sůl',
      category: 'food',
      subcategory: 'hlavni',
      sellPrice: 79,
      vatRate: 12,
      foodCost: 18,
      allergens: ['lepek'],
    },
    {
      name: 'Burger Classic',
      recipe: 'Hovězí, house bun, salát, cheddar',
      category: 'food',
      subcategory: 'hlavni',
      sellPrice: 249,
      vatRate: 12,
      foodCost: 85,
      allergens: ['lepek', 'mléko'],
    },
    {
      name: 'Caesar salát',
      recipe: 'Římský salát, kuře, parmezán, dresink',
      category: 'food',
      subcategory: 'predkrmy',
      sellPrice: 189,
      vatRate: 12,
      foodCost: 62,
      allergens: ['mléko', 'vejce', 'lepek'],
    },
    {
      name: 'Sýrová polévka',
      recipe: 'Domácí sýrová polévka',
      category: 'food',
      subcategory: 'predkrmy',
      sellPrice: 69,
      vatRate: 12,
      foodCost: 22,
      allergens: ['mléko', 'lepek'],
    },
    {
      name: 'Cheesecake',
      recipe: 'New York style',
      category: 'food',
      subcategory: 'dezerty',
      sellPrice: 95,
      vatRate: 12,
      foodCost: 28,
      allergens: ['mléko', 'vejce', 'lepek'],
    },
  ]

  return items.map((item) => ({
    id: `venue_${item.name.toLowerCase().replace(/[^a-z0-9]+/gi, '_')}`,
    name: item.name,
    recipe: item.recipe,
    foodCost: item.foodCost,
    portion: 1,
    allergens: item.allergens ?? [],
    inventory: [],
    category: item.category,
    subcategory: item.subcategory,
    sellPrice: item.sellPrice,
    vatRate: item.vatRate,
    plannedPortions: 9999,
    soldPortions: 0,
    ingredients: [],
  }))
}

export function mergeCatalogs(
  venue: CateringItem[],
  event: CateringItem[]
): CateringItem[] {
  const byKey = new Map<string, CateringItem>()
  for (const item of venue ?? []) {
    byKey.set(normalizeName(item.name), item)
  }
  for (const item of event ?? []) {
    const key = normalizeName(item.name)
    if (!byKey.has(key)) byKey.set(key, item)
  }
  return Array.from(byKey.values())
}

export function normalizeName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchMenuItemByName(
  catalog: CateringItem[],
  spokenName: string
): CateringItem | null {
  const target = normalizeName(spokenName)
  if (!target) return null
  const list = catalog ?? []
  const exact = list.find((i) => normalizeName(i.name) === target)
  if (exact) return exact
  const partial = list.find(
    (i) =>
      normalizeName(i.name).includes(target) ||
      target.includes(normalizeName(i.name))
  )
  if (partial) return partial
  // Token overlap
  const tokens = target.split(' ').filter((t) => t.length > 2)
  let best: CateringItem | null = null
  let bestScore = 0
  for (const item of list) {
    const n = normalizeName(item.name)
    const score = tokens.filter((t) => n.includes(t)).length
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return bestScore > 0 ? best : null
}

/** Stable id helper when cloning event items into hybrid view. */
export function cloneWithStableId(item: CateringItem, prefix: string): CateringItem {
  return { ...item, id: item.id || uid(prefix) }
}
