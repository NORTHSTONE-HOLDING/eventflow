/**
 * EventFlow — fractional gastro unit conversion for POS → inventory deduction.
 * Supports bottles (ks + pack_volume l), kegs, milliliters, grams ↔ kilograms.
 */

import type { InventoryItem } from '../types'
import { normalizeUnit } from './inventoryModels'

export type DeductionResult = {
  item: InventoryItem
  /** Quantity change logged against stock unit (negative) */
  quantityChanged: number
  /** Human-readable note for inventory_logs */
  note: string
  /** Full packs emptied during this deduction */
  packsEmptied: number
  depleted: boolean
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Infer pack volume (liters) from product name when not set */
export function inferPackVolumeLiters(name: string, unit: string): number | null {
  const u = normalizeUnit(unit)
  const n = String(name || '')
  const lit = n.match(/(\d+[.,]?\d*)\s*l\b/i)
  if (lit) {
    const v = Number(lit[1].replace(',', '.'))
    if (v > 0 && v <= 500) return v
  }
  if (/0[.,]7|700\s*ml/i.test(n)) return 0.7
  if (/0[.,]5|500\s*ml/i.test(n) && /lahev|vino|víno|rum|vodka|gin|whisky|whiskey/i.test(n)) {
    return 0.5
  }
  if (/sud|keg|točen/i.test(n) && u === 'ks') return 50
  if (/lahev|láhev|destil|spir|rum|vodka|gin|whisky|prosecco|víno|vino/i.test(n) && u === 'ks') {
    return 0.7
  }
  return null
}

export function resolvePackVolume(item: InventoryItem): number | null {
  if (item.pack_volume && item.pack_volume > 0) return item.pack_volume
  return inferPackVolumeLiters(item.name, String(item.unit))
}

/**
 * Convert recipe amount into either:
 * - direct stock units (same family), or
 * - volume (l/kg) to burn from pack-tracked ks stock
 */
export function convertRecipeAmountToStock(opts: {
  recipeQty: number
  recipeUnit: string
  item: InventoryItem
}): {
  mode: 'direct' | 'pack_volume'
  amount: number
  stockUnit: string
  packVolume: number | null
} {
  const recipeUnit = normalizeUnit(opts.recipeUnit)
  const stockUnit = normalizeUnit(opts.item.unit)
  const packVol = resolvePackVolume(opts.item)
  let qty = Number(opts.recipeQty) || 0
  if (qty <= 0) {
    return { mode: 'direct', amount: 0, stockUnit: String(stockUnit), packVolume: packVol }
  }

  let baseQty = qty
  let baseUnit: string = String(recipeUnit)
  if (recipeUnit === 'g') {
    baseQty = qty / 1000
    baseUnit = 'kg'
  } else if (recipeUnit === 'ml') {
    baseQty = qty / 1000
    baseUnit = 'l'
  }

  if (baseUnit === stockUnit) {
    return {
      mode: 'direct',
      amount: round4(baseQty),
      stockUnit: String(stockUnit),
      packVolume: packVol,
    }
  }

  if (stockUnit === 'ks' && packVol && (baseUnit === 'l' || baseUnit === 'kg')) {
    return {
      mode: 'pack_volume',
      amount: round4(baseQty),
      stockUnit: 'ks',
      packVolume: packVol,
    }
  }

  if (stockUnit === 'l' && recipeUnit === 'ks' && packVol) {
    return {
      mode: 'direct',
      amount: round4(qty * packVol),
      stockUnit: 'l',
      packVolume: packVol,
    }
  }

  return {
    mode: 'direct',
    amount: round4(baseQty),
    stockUnit: String(stockUnit),
    packVolume: packVol,
  }
}

/**
 * Apply POS deduction with bottle/keg layer tracking.
 *
 * Spirits: unit ks, pack_volume 0.7 — „Panák 0,04 l“ subtracts 0.04 l from the
 * liter layer; when 0.7 l is gone, 1 bottle is logged empty.
 * Draught: unit ks, pack_volume 50 — „Pivo 0.5 l“ burns 0.5 l of keg.
 * Kitchen: unit kg, recipe 180 g → −0.180 kg.
 */
export function applyFractionalDeduction(
  item: InventoryItem,
  recipeQty: number,
  recipeUnit: string,
  contextNote: string,
): DeductionResult {
  const converted = convertRecipeAmountToStock({
    recipeQty,
    recipeUnit,
    item,
  })

  if (converted.amount <= 0) {
    return {
      item,
      quantityChanged: 0,
      note: contextNote,
      packsEmptied: 0,
      depleted: item.current_quantity <= item.minimum_quantity,
    }
  }

  if (converted.mode === 'direct' || !converted.packVolume) {
    const nextQty = Math.max(0, round3(item.current_quantity - converted.amount))
    return {
      item: {
        ...item,
        current_quantity: nextQty,
        updated_at: new Date().toISOString(),
      },
      quantityChanged: -converted.amount,
      note: `${contextNote} · −${converted.amount} ${item.unit}`,
      packsEmptied: 0,
      depleted: nextQty <= item.minimum_quantity,
    }
  }

  const packVol = converted.packVolume
  // Represent stock as total liters = sealed-equivalent * packVol
  // Prefer open_pack_remaining + floor(current) model synced into fractional ks
  const sealed = Math.floor(item.current_quantity + 1e-9)
  const frac = round4(item.current_quantity - sealed)
  let totalLiters =
    item.open_pack_remaining != null && item.open_pack_remaining >= 0
      ? sealed * packVol + item.open_pack_remaining
      : item.current_quantity * packVol

  // If fractional ks without open_pack_remaining, derive liters from fraction
  if (item.open_pack_remaining == null && frac > 0) {
    totalLiters = sealed * packVol + frac * packVol
  }

  const beforeLiters = totalLiters
  const beforeFullPacks = Math.floor(beforeLiters / packVol + 1e-9)

  totalLiters = Math.max(0, round4(totalLiters - converted.amount))
  const afterFullPacks = Math.floor(totalLiters / packVol + 1e-9)
  const packsEmptied = Math.max(0, beforeFullPacks - afterFullPacks)

  const nextQty = round4(totalLiters / packVol)
  const openRem = round4(totalLiters - afterFullPacks * packVol)

  const next: InventoryItem = {
    ...item,
    pack_volume: packVol,
    current_quantity: round3(nextQty),
    open_pack_remaining: openRem > 1e-9 && openRem < packVol - 1e-9 ? openRem : openRem > 1e-9 ? openRem : null,
    updated_at: new Date().toISOString(),
  }

  const consumed = round4(beforeLiters - totalLiters)
  const packNote =
    packsEmptied > 0
      ? ` · vyprázdněno ${packsEmptied}× balení po ${packVol} l`
      : ` · v otevřeném balení zbývá ${next.open_pack_remaining ?? packVol} l / ${packVol} l`

  return {
    item: next,
    quantityChanged: -round3(consumed / packVol),
    note: `${contextNote} · −${consumed} l${packNote}`,
    packsEmptied,
    depleted: next.current_quantity <= next.minimum_quantity,
  }
}

/** Pretty stock status for UI */
export function formatStockWithPack(item: InventoryItem): string {
  const packVol = resolvePackVolume(item)
  if (normalizeUnit(item.unit) === 'ks' && packVol) {
    const open =
      item.open_pack_remaining != null && item.open_pack_remaining < packVol - 0.001
        ? ` · otevř. ${item.open_pack_remaining}/${packVol} l`
        : ''
    return `${round3(item.current_quantity)} ks × ${packVol} l${open}`
  }
  return `${item.current_quantity} ${item.unit}`
}
