import type { CateringItem, POSSubcategory } from '../types'

export interface PosCategoryDef {
  id: 'food' | 'beverage' | 'all'
  label: string
  subs: Array<{ id: POSSubcategory | 'all'; label: string }>
}

export const POS_CATEGORIES: PosCategoryDef[] = [
  {
    id: 'food',
    label: 'Jídlo',
    subs: [
      { id: 'all', label: 'Vše' },
      { id: 'predkrmy', label: 'Předkrmy' },
      { id: 'hlavni', label: 'Hlavní chody' },
      { id: 'dezerty', label: 'Dezerty' },
      { id: 'raut', label: 'Raut' },
    ],
  },
  {
    id: 'beverage',
    label: 'Pití',
    subs: [
      { id: 'all', label: 'Vše' },
      { id: 'pivo', label: 'Pivo' },
      { id: 'vino', label: 'Víno' },
      { id: 'koktejly', label: 'Koktejly' },
      { id: 'nealko', label: 'Nealko' },
      { id: 'destilaty', label: 'Destiláty' },
    ],
  },
]

export function inferSubcategory(item: Pick<CateringItem, 'name' | 'category' | 'recipe'>): POSSubcategory {
  const text = `${item.name} ${item.recipe}`.toLowerCase()
  if (item.category === 'beverage') {
    if (/pivo|beer|ležák|ležak/.test(text)) return 'pivo'
    if (/víno|vino|prosecco|sekt|champagne/.test(text)) return 'vino'
    if (/rum|whisky|whiskey|vodka|gin|destil|becherovka|slivovice/.test(text)) return 'destilaty'
    if (/koktejl|mocktail|drink|cola.*rum|rum.*cola/.test(text)) return 'koktejly'
    return 'nealko'
  }
  if (item.category === 'food') {
    if (/dezer|dezert|fondant|macaron|tartalet|cake|zmrzlin|coffee station/.test(text)) return 'dezerty'
    if (/canapé|predkrm|předkrm|bruschetta|amuse|soup|polév/.test(text)) return 'predkrmy'
    if (/raut|buffet|finger|stanice/.test(text)) return 'raut'
    return 'hlavni'
  }
  return 'ostatni'
}

export function filterPosMenu(
  items: CateringItem[] | null | undefined,
  category: 'all' | 'food' | 'beverage',
  subcategory: POSSubcategory | 'all'
): CateringItem[] {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  return list.filter((item) => {
    if (category !== 'all' && item.category !== category) return false
    if (subcategory !== 'all') {
      const sub = item.subcategory || inferSubcategory(item)
      if (sub !== subcategory) return false
    }
    return true
  })
}
