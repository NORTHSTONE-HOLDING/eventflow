import type {
  AgencyProfile,
  CateringItem,
  EventProject,
  InventoryItem,
  RecipeIngredientRecord,
} from '../types'
import { formatCzechDate } from './czechDate'
import { inferIngredientsFromCatering } from './inventoryEngine'
import {
  DEFAULT_USER_ID,
  matchInventoryItem,
  normalizeUnit,
} from './inventoryModels'
import { formatCurrency, uid } from './documentIds'

export interface ResolvedRecipeLine {
  ingredient_name: string
  qty_per_portion: number
  unit: string
  inventory_item_id: string | null
  inventory?: InventoryItem
}

export interface PurchaseNeedLine {
  inventory_item_id: string | null
  name: string
  unit: string
  supplier: string
  needed_qty: number
  on_hand: number
  deficit: number
  unit_price: number
  estimate_czk: number
  reason: 'critical_low' | 'event_requirement'
  event_name?: string
}

export interface SupplierPurchaseGroup {
  supplier: string
  lines: PurchaseNeedLine[]
  total_czk: number
}

/** Build / refresh recipe_ingredients rows from catering + inventory match. */
export function buildRecipeRecordsFromCatering(
  catering: CateringItem[],
  inventory: InventoryItem[],
  userId = DEFAULT_USER_ID
): RecipeIngredientRecord[] {
  const now = new Date().toISOString()
  const out: RecipeIngredientRecord[] = []

  for (const item of catering ?? []) {
    const ings = inferIngredientsFromCatering(item)
    for (const ing of ings) {
      const matched = matchInventoryItem(inventory, {
        name: ing.name,
        unit: ing.unit,
      })
      out.push({
        id: uid('ri'),
        catering_id: item.id,
        catering_name: item.name,
        inventory_item_id: matched?.id ?? ing.inventoryItemId ?? null,
        ingredient_name: ing.name,
        qty_per_portion: ing.qtyPerPortion,
        unit: normalizeUnit(ing.unit),
        user_id: userId,
        updated_at: now,
      })
    }
  }
  return out
}

/**
 * Hybrid deduction matrix:
 * 1) Direct sale (pos_visible packaged goods) → 1 unit of linked inventory item
 * 2) Composite / daily special → recipe_ingredients map (kg/g decimals)
 */
export function resolveRecipeForCatering(
  catering: CateringItem,
  recipes: RecipeIngredientRecord[],
  inventory: InventoryItem[]
): ResolvedRecipeLine[] {
  // Direct 1:1 — bottled / packaged goods pushed from Sklad „Do kasy“
  if (catering.is_direct_sale && catering.inventory_item_id) {
    const inv = inventory.find((i) => i.id === catering.inventory_item_id)
    if (inv && !inv.is_raw_material) {
      return [
        {
          ingredient_name: inv.name,
          qty_per_portion: 1,
          unit: normalizeUnit(inv.unit),
          inventory_item_id: inv.id,
          inventory: inv,
        },
      ]
    }
  }

  const linked = (recipes ?? []).filter((r) => r.catering_id === catering.id)
  if (linked.length) {
    return linked.map((r) => {
      const inv =
        (r.inventory_item_id &&
          inventory.find((i) => i.id === r.inventory_item_id)) ||
        matchInventoryItem(inventory, {
          name: r.ingredient_name,
          unit: r.unit,
        })
      return {
        ingredient_name: r.ingredient_name,
        qty_per_portion: r.qty_per_portion,
        unit: r.unit,
        inventory_item_id: inv?.id ?? r.inventory_item_id,
        inventory: inv,
      }
    })
  }

  // Explicit composite ingredients on the catering/daily-special tile
  if (Array.isArray(catering.ingredients) && catering.ingredients.length) {
    return catering.ingredients.map((ing) => {
      const inv =
        (ing.inventoryItemId &&
          inventory.find((i) => i.id === ing.inventoryItemId)) ||
        matchInventoryItem(inventory, {
          name: ing.name,
          unit: ing.unit,
        })
      return {
        ingredient_name: ing.name,
        qty_per_portion: ing.qtyPerPortion,
        unit: normalizeUnit(ing.unit),
        inventory_item_id: inv?.id ?? ing.inventoryItemId ?? null,
        inventory: inv,
      }
    })
  }

  return inferIngredientsFromCatering(catering).map((ing) => {
    const inv = matchInventoryItem(inventory, {
      name: ing.name,
      unit: ing.unit,
    })
    return {
      ingredient_name: ing.name,
      qty_per_portion: ing.qtyPerPortion,
      unit: ing.unit,
      inventory_item_id: inv?.id ?? null,
      inventory: inv,
    }
  })
}

/** Critical low stock scan. */
export function scanCriticalLow(inventory: InventoryItem[]): PurchaseNeedLine[] {
  return (inventory ?? [])
    .filter((i) => i.current_quantity <= i.minimum_quantity)
    .map((i) => {
      const target = Math.max(i.minimum_quantity * 2, i.minimum_quantity + 1)
      const deficit = Math.max(0, target - i.current_quantity)
      const price = i.purchase_price || i.average_price || 0
      return {
        inventory_item_id: i.id,
        name: i.name,
        unit: i.unit,
        supplier: i.supplier || 'Bez dodavatele',
        needed_qty: target,
        on_hand: i.current_quantity,
        deficit: Math.round(deficit * 1000) / 1000,
        unit_price: price,
        estimate_czk: Math.round(deficit * price),
        reason: 'critical_low' as const,
      }
    })
}

/**
 * Event coverage: guests × recipe qty_per_portion vs on-hand.
 * Uses plannedPortions when set, else guests.
 */
export function scanEventRequirements(
  project: EventProject | null | undefined,
  inventory: InventoryItem[],
  recipes: RecipeIngredientRecord[]
): PurchaseNeedLine[] {
  if (!project || project.status === 'cancelled' || project.posClosed) return []
  const needs = new Map<string, PurchaseNeedLine>()

  for (const dish of project.catering ?? []) {
    const portions = Math.max(
      1,
      dish.plannedPortions || dish.portion || project.guests || 1
    )
    const remaining = Math.max(0, portions - (dish.soldPortions || 0))
    if (remaining <= 0) continue

    const lines = resolveRecipeForCatering(dish, recipes, inventory)
    for (const line of lines) {
      const required = line.qty_per_portion * remaining
      const onHand = line.inventory?.current_quantity ?? 0
      const key =
        line.inventory_item_id ||
        `${line.ingredient_name}|${line.unit}`.toLowerCase()
      const prev = needs.get(key)
      const combinedRequired = (prev?.needed_qty || 0) + required
      const deficit = Math.max(0, combinedRequired - onHand)
      if (deficit <= 0.0001 && onHand >= combinedRequired) {
        needs.set(key, {
          inventory_item_id: line.inventory_item_id,
          name: line.inventory?.name || line.ingredient_name,
          unit: line.unit,
          supplier: line.inventory?.supplier || 'Bez dodavatele',
          needed_qty: Math.round(combinedRequired * 1000) / 1000,
          on_hand: onHand,
          deficit: 0,
          unit_price: line.inventory?.purchase_price || 0,
          estimate_czk: 0,
          reason: 'event_requirement',
          event_name: project.name,
        })
        continue
      }
      const price = line.inventory?.purchase_price || line.inventory?.average_price || 0
      needs.set(key, {
        inventory_item_id: line.inventory_item_id,
        name: line.inventory?.name || line.ingredient_name,
        unit: line.unit,
        supplier: line.inventory?.supplier || 'Bez dodavatele',
        needed_qty: Math.round(combinedRequired * 1000) / 1000,
        on_hand: onHand,
        deficit: Math.round(deficit * 1000) / 1000,
        unit_price: price,
        estimate_czk: Math.round(deficit * price),
        reason: 'event_requirement',
        event_name: project.name,
      })
    }
  }

  return Array.from(needs.values()).filter((n) => n.deficit > 0)
}

export function buildAiPurchaseList(
  inventory: InventoryItem[],
  project: EventProject | null | undefined,
  recipes: RecipeIngredientRecord[]
): {
  critical: PurchaseNeedLine[]
  event: PurchaseNeedLine[]
  bySupplier: SupplierPurchaseGroup[]
  totalEstimate: number
} {
  const critical = scanCriticalLow(inventory)
  const event = scanEventRequirements(project, inventory, recipes)

  const merged = new Map<string, PurchaseNeedLine>()
  for (const line of [...critical, ...event]) {
    const key =
      line.inventory_item_id ||
      `${line.name}|${line.unit}|${line.supplier}`.toLowerCase()
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, { ...line })
      continue
    }
    const deficit = Math.max(prev.deficit, line.deficit)
    merged.set(key, {
      ...prev,
      deficit,
      needed_qty: Math.max(prev.needed_qty, line.needed_qty),
      estimate_czk: Math.round(deficit * (prev.unit_price || line.unit_price)),
      reason: prev.reason === 'critical_low' ? 'critical_low' : line.reason,
      event_name: prev.event_name || line.event_name,
    })
  }

  const all = Array.from(merged.values()).filter((l) => l.deficit > 0)
  const supplierMap = new Map<string, PurchaseNeedLine[]>()
  for (const line of all) {
    const s = line.supplier || 'Bez dodavatele'
    const arr = supplierMap.get(s) || []
    arr.push(line)
    supplierMap.set(s, arr)
  }

  const bySupplier: SupplierPurchaseGroup[] = Array.from(supplierMap.entries())
    .map(([supplier, lines]) => ({
      supplier,
      lines,
      total_czk: lines.reduce((s, l) => s + l.estimate_czk, 0),
    }))
    .sort((a, b) => b.total_czk - a.total_czk)

  return {
    critical,
    event,
    bySupplier,
    totalEstimate: bySupplier.reduce((s, g) => s + g.total_czk, 0),
  }
}

export function buildPurchaseOrderDocument(opts: {
  profile: AgencyProfile
  groups: SupplierPurchaseGroup[]
  projectName?: string
  orderNumber: string
}): string {
  const date = formatCzechDate(new Date())
  const total = opts.groups.reduce((s, g) => s + g.total_czk, 0)
  const blocks = opts.groups
    .map((g) => {
      const lines = g.lines
        .map(
          (l) =>
            `  • ${l.name} — objednat ${l.deficit} ${l.unit} (sklad ${l.on_hand} ${l.unit}) · ${formatCurrency(l.estimate_czk)} · ${l.reason === 'critical_low' ? 'KRITICKÝ STAV' : 'POKRYTÍ AKCE'}`
        )
        .join('\n')
      return (
        `DODAVATEL: ${g.supplier}\n` +
        `${lines}\n` +
        `  Mezisoučet: ${formatCurrency(g.total_czk)}\n`
      )
    })
    .join('\n')

  return (
    `OBJEDNÁVKA ZBOŽÍ ${opts.orderNumber}\n` +
    `────────────────────────────────────────\n` +
    `Datum: ${date}\n` +
    `Odběratel: ${opts.profile.companyName || 'EventFlow Agency'}\n` +
    `IČO: ${opts.profile.ico || '—'}  DIČ: ${opts.profile.dic || '—'}\n` +
    `Adresa: ${opts.profile.street || ''}, ${opts.profile.zip || ''} ${opts.profile.city || ''}\n` +
    `Kontakt: ${opts.profile.contactPerson || '—'} · ${opts.profile.email || ''} · ${opts.profile.phone || ''}\n` +
    (opts.projectName ? `Vazba na akci: ${opts.projectName}\n` : '') +
    `\nAI Nákupní seznam — EventFlow Sklad & Inventura\n\n` +
    blocks +
    `\n────────────────────────────────────────\n` +
    `CELKOVÝ ODHAD NÁKUPU: ${formatCurrency(total)}\n` +
    `Platba: dle dohody s dodavatelem\n` +
    `Poznámka: Dokument vygenerován AI Nákupním asistentem. Ověřte množství před odesláním.\n`
  )
}
