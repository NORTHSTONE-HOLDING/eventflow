import type {
  CateringItem,
  RecipeIngredient,
  WarehouseAlert,
  WarehouseItem,
} from '../types'
import { uid } from './documentIds'

const UNIT_ALIASES: Record<string, string> = {
  lahví: 'ks',
  lahev: 'ks',
  ks: 'ks',
  kg: 'kg',
  l: 'l',
  ml: 'ml',
  g: 'g',
  svazky: 'ks',
  svazek: 'ks',
}

/** Parse strings like "Prosecco 12 lahví", "Losos 2.5 kg", "Led 20 kg" */
export function parseInventoryLine(line: string): {
  name: string
  qty: number
  unit: string
} | null {
  const trimmed = (line || '').trim()
  if (!trimmed) return null

  const match = trimmed.match(
    /^(.+?)\s+([\d]+(?:[.,]\d+)?)\s*([a-záčďéěíňóřšťúůýž]+)?$/i
  )
  if (match) {
    const rawUnit = (match[3] || 'ks').toLowerCase()
    return {
      name: match[1].trim(),
      qty: parseFloat(match[2].replace(',', '.')),
      unit: UNIT_ALIASES[rawUnit] || rawUnit,
    }
  }

  return { name: trimmed, qty: 1, unit: 'ks' }
}

export function inferIngredientsFromCatering(item: CateringItem): RecipeIngredient[] {
  if (item.ingredients?.length) return item.ingredients

  const lines = item.inventory ?? []
  const planned = Math.max(1, item.plannedPortions || item.portion || 1)

  return lines
    .map((line) => {
      const parsed = parseInventoryLine(line)
      if (!parsed) return null
      return {
        name: parsed.name,
        qtyPerPortion: parsed.qty / planned,
        unit: parsed.unit,
      } satisfies RecipeIngredient
    })
    .filter((x): x is RecipeIngredient => x !== null)
}

export function buildWarehouseFromCatering(
  catering: CateringItem[]
): WarehouseItem[] {
  const map = new Map<string, WarehouseItem>()

  for (const item of catering ?? []) {
    const ingredients = inferIngredientsFromCatering(item)
    const planned = Math.max(1, item.plannedPortions || item.portion || 1)

    for (const ing of ingredients) {
      const key = `${ing.name.toLowerCase()}|${ing.unit}`
      const totalQty = ing.qtyPerPortion * planned
      const existing = map.get(key)
      if (existing) {
        existing.initialQty += totalQty
        existing.currentQty += totalQty
        if (!existing.linkedCateringIds.includes(item.id)) {
          existing.linkedCateringIds.push(item.id)
        }
      } else {
        map.set(key, {
          id: uid('wh'),
          name: ing.name,
          unit: ing.unit,
          initialQty: totalQty,
          currentQty: totalQty,
          category:
            item.category === 'beverage'
              ? 'beverage'
              : ing.unit === 'ks'
                ? 'package'
                : 'raw',
          linkedCateringIds: [item.id],
        })
      }
    }

    // Always ensure at least one stockable line exists per menu item
    if (!ingredients.length) {
      const key = `${item.name.toLowerCase()}|porce`
      map.set(key, {
        id: uid('wh'),
        name: item.name,
        unit: 'porce',
        initialQty: planned,
        currentQty: planned,
        category: 'package',
        linkedCateringIds: [item.id],
      })
    }
  }

  return Array.from(map.values()).map((w) => ({
    ...w,
    initialQty: Math.round(w.initialQty * 1000) / 1000,
    currentQty: Math.round(w.currentQty * 1000) / 1000,
  }))
}

export interface DecrementResult {
  warehouse: WarehouseItem[]
  alerts: WarehouseAlert[]
  depleted: boolean
}

/**
 * Decrement raw weights / package counts for each sold portion
 * according to recipe ingredient ratios.
 */
export function decrementWarehouseForSale(
  warehouse: WarehouseItem[],
  cateringItem: CateringItem,
  qty: number,
  projectId: string,
  projectName: string
): DecrementResult {
  const ingredients = inferIngredientsFromCatering(cateringItem)
  const next = (warehouse ?? []).map((w) => ({ ...w }))
  const alerts: WarehouseAlert[] = []
  let depleted = false

  const apply = (name: string, unit: string, amount: number) => {
    const target =
      next.find(
        (w) =>
          w.name.toLowerCase() === name.toLowerCase() &&
          w.unit === unit &&
          w.linkedCateringIds.includes(cateringItem.id)
      ) ||
      next.find(
        (w) =>
          w.name.toLowerCase() === name.toLowerCase() && w.unit === unit
      ) ||
      next.find((w) => w.linkedCateringIds.includes(cateringItem.id))

    if (!target) return

    const before = target.currentQty
    target.currentQty = Math.max(0, Math.round((before - amount) * 1000) / 1000)
    if (target.currentQty <= 0) depleted = true

    const percentLeft =
      target.initialQty > 0 ? (target.currentQty / target.initialQty) * 100 : 0

    if (percentLeft < 15) {
      alerts.push({
        id: uid('alert'),
        projectId,
        projectName,
        warehouseItemId: target.id,
        itemName: `${target.name} (${target.unit})`,
        percentLeft: Math.round(percentLeft * 10) / 10,
        createdAt: new Date().toISOString(),
        acknowledged: false,
      })
    }
  }

  if (ingredients.length) {
    for (const ing of ingredients) {
      apply(ing.name, ing.unit, ing.qtyPerPortion * qty)
    }
  } else {
    apply(cateringItem.name, 'porce', qty)
  }

  return { warehouse: next, alerts, depleted }
}

export function getLowStockItems(warehouse: WarehouseItem[]): WarehouseItem[] {
  return (warehouse ?? []).filter((w) => {
    if (w.initialQty <= 0) return w.currentQty <= 0
    return (w.currentQty / w.initialQty) * 100 < 15
  })
}

export function stockPercent(item: WarehouseItem): number {
  if (!item.initialQty) return 0
  return Math.max(0, Math.min(100, (item.currentQty / item.initialQty) * 100))
}

/** Ensure legacy catering rows (pre-POS) have sell prices & ingredients. */
export function normalizeCateringForPos(items: CateringItem[]): CateringItem[] {
  return (items ?? []).map((item) => {
    const planned = Math.max(1, item.plannedPortions || item.portion || 1)
    const foodCostTotal = Number(item.foodCost) || 0
    const costPer = foodCostTotal / planned
    const sellPrice =
      Number(item.sellPrice) > 0
        ? Number(item.sellPrice)
        : Math.round(costPer * 2.4) || (item.category === 'beverage' ? 95 : 180)

    const text = `${item.name || ''} ${item.recipe || ''}`.toLowerCase()
    let subcategory = item.subcategory
    if (!subcategory) {
      if (item.category === 'beverage') {
        if (/pivo|beer|ležák|ležak/.test(text)) subcategory = 'pivo'
        else if (/víno|vino|prosecco|sekt/.test(text)) subcategory = 'vino'
        else if (/rum|whisky|vodka|gin|destil/.test(text)) subcategory = 'destilaty'
        else if (/koktejl|mocktail|drink/.test(text)) subcategory = 'koktejly'
        else subcategory = 'nealko'
      } else if (item.category === 'food') {
        if (/dezer|dezert|fondant|macaron|tartalet|coffee/.test(text)) subcategory = 'dezerty'
        else if (/canapé|predkrm|předkrm|bruschetta|polév/.test(text)) subcategory = 'predkrmy'
        else if (/raut|buffet|finger/.test(text)) subcategory = 'raut'
        else subcategory = 'hlavni'
      } else {
        subcategory = 'ostatni'
      }
    }

    return {
      ...item,
      allergens: Array.isArray(item.allergens) ? item.allergens : [],
      inventory: Array.isArray(item.inventory) ? item.inventory : [],
      sellPrice,
      vatRate: item.vatRate ?? (item.category === 'beverage' ? 21 : 12),
      plannedPortions: planned,
      soldPortions: Number(item.soldPortions) || 0,
      subcategory,
      ingredients: inferIngredientsFromCatering({
        ...item,
        plannedPortions: planned,
        sellPrice,
        vatRate: item.vatRate ?? 12,
        soldPortions: 0,
        subcategory,
        ingredients: item.ingredients ?? [],
      }),
    }
  })
}
