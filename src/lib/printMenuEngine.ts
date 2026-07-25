/**
 * EventFlow — Print Menu & Beverage Card Engine helpers
 * Sections, portion labels, theme registry, dual-source mapping.
 */

import type {
  AgencyProfile,
  CateringItem,
  EventProject,
  InventoryItem,
  PrintDesign,
  PrintFormat,
  PrintMenuItem,
  PrintMenuKind,
  PrintMenuSection,
  PrintOperationMode,
} from '../types'
import {
  formatAllergenCodes,
  inferAllergensFromName,
  resolveAllergenCodes,
} from './allergens'
import { formatCurrency, uid } from './documentIds'
import {
  inventoryCategoryToPos,
  inventoryItemToCatering,
  inventorySubcategoryToPos,
} from './inventoryPosBridge'
import { normalizeName } from './inventoryModels'
import { subcategoryLabel, findCategoryDef, BUILTIN_INVENTORY_CATEGORIES } from './inventoryCategories'

export const PRINT_THEMES: Array<{
  id: PrintDesign
  label: string
  description: string
}> = [
  {
    id: 'elegant_gold',
    label: 'Elegant Gold',
    description: 'Hluboká břidlice, zlaté akcenty a serify — signature EventFlow',
  },
  {
    id: 'minimalist_nordic',
    label: 'Minimalist Nordic',
    description: 'Čistá bílá, charcoal linky, lineární sans-serif',
  },
  {
    id: 'classic_vintage',
    label: 'Classic Vintage',
    description: 'Sépie, tradiční rámy, elegantní serify pro hospody',
  },
  {
    id: 'cyberpunk_slate',
    label: 'Cyberpunk Slate',
    description: 'Neon akcenty na černé mřížce — cocktail bary',
  },
  {
    id: 'rustic_eco',
    label: 'Rustic Eco',
    description: 'Lesní zeleň a béžové karty — farm-to-table',
  },
  {
    id: 'grand_hotel',
    label: 'Grand Hotel / Royal',
    description: 'Dvojité rámy, centrované serify — gala večeře',
  },
]

export function normalizePrintDesign(raw: string | null | undefined): PrintDesign {
  const key = String(raw || 'elegant_gold')
  if (key === 'modern') return 'minimalist_nordic'
  if (key === 'elegant') return 'elegant_gold'
  if (key === 'corporate') return 'grand_hotel'
  if (PRINT_THEMES.some((t) => t.id === key)) return key as PrintDesign
  return 'elegant_gold'
}

export const PRINT_FORMATS: Array<{
  id: PrintFormat
  label: string
  hint: string
  widthMm: number
  heightMm: number
}> = [
  { id: 'A4', label: 'Formát A4', hint: '210 × 297 mm', widthMm: 210, heightMm: 297 },
  { id: 'A5', label: 'Formát A5', hint: '148 × 210 mm', widthMm: 148, heightMm: 210 },
  {
    id: 'DL',
    label: 'Formát DL (Profi štíhlé menu na bar)',
    hint: '100 × 210 mm',
    widthMm: 100,
    heightMm: 210,
  },
]

export function formatPageSize(format: PrintFormat): { widthMm: number; heightMm: number } {
  const found = PRINT_FORMATS.find((f) => f.id === format)
  return found
    ? { widthMm: found.widthMm, heightMm: found.heightMm }
    : { widthMm: 210, heightMm: 297 }
}

/** Preview CSS width in px (~96dpi). */
export function formatPreviewWidthPx(format: PrintFormat): number {
  const { widthMm } = formatPageSize(format)
  return Math.round((widthMm / 25.4) * 96)
}

const FOOD_SECTION_ORDER = ['predkrmy', 'hlavni', 'dezerty', 'raut', 'ostatni'] as const
const BEV_SECTION_ORDER = ['nealko', 'pivo', 'vino', 'koktejly', 'destilaty', 'ostatni'] as const

const FOOD_SECTION_LABELS: Record<string, string> = {
  predkrmy: 'Předkrmy',
  hlavni: 'Hlavní chody',
  dezerty: 'Dezerty',
  raut: 'Raut',
  ostatni: 'Ostatní jídla',
}

const BEV_SECTION_LABELS: Record<string, string> = {
  nealko: 'Nealko',
  pivo: 'Pivo',
  vino: 'Víno',
  koktejly: 'Koktejly',
  destilaty: 'Destiláty & alkohol',
  ostatni: 'Ostatní nápoje',
}

export function czechPortionLabel(opts: {
  name?: string
  unit?: string
  portion?: number
  packVolume?: number | null
  recipe?: string
}): string {
  const unit = normalizeName(opts.unit || '')
  const portion = Number(opts.portion)
  const pack = opts.packVolume != null ? Number(opts.packVolume) : NaN
  const blob = `${opts.name || ''} ${opts.recipe || ''}`.toLowerCase()

  const fromText = blob.match(/(\d+[.,]?\d*)\s*(g|kg|ml|l|cl)\b/)
  if (fromText) {
    const n = fromText[1].replace(',', '.')
    const u = fromText[2]
    return `${n.replace('.', ',')} ${u}`
  }

  if (Number.isFinite(pack) && pack > 0) {
    if (unit === 'l' || unit === 'ml') {
      if (pack >= 1) return `${String(pack).replace('.', ',')} l`
      return `${Math.round(pack * 1000)} ml`
    }
    if (unit === 'kg' || unit === 'g') {
      if (pack >= 1 && unit === 'kg') return `${String(pack).replace('.', ',')} kg`
      return `${Math.round(pack)} g`
    }
    return `${String(pack).replace('.', ',')} ${unit || 'ks'}`
  }

  if (unit === 'kg') {
    const kg = Number.isFinite(portion) && portion > 0 ? portion : 0.18
    if (kg < 1) return `${Math.round(kg * 1000)} g`
    return `${String(kg).replace('.', ',')} kg`
  }
  if (unit === 'g') {
    const g = Number.isFinite(portion) && portion > 0 ? portion : 180
    return `${Math.round(g)} g`
  }
  if (unit === 'l') {
    const l = Number.isFinite(portion) && portion > 0 && portion < 5 ? portion : 0.33
    return `${String(l).replace('.', ',')} l`
  }
  if (unit === 'ml') {
    const ml = Number.isFinite(portion) && portion > 0 ? portion : 330
    return `${Math.round(ml)} ml`
  }
  if (unit === 'porce' || !unit) {
    return Number.isFinite(portion) && portion > 1 ? `${portion} porce` : '1 porce'
  }
  return Number.isFinite(portion) && portion > 0
    ? `${String(portion).replace('.', ',')} ${unit || 'ks'}`
    : `1 ${unit || 'ks'}`
}

function sectionForCatering(item: CateringItem, kind: PrintMenuKind): { id: string; label: string } {
  const sub = normalizeName(String(item.subcategory || 'ostatni'))
  if (kind === 'beverage') {
    const id = (BEV_SECTION_ORDER as readonly string[]).includes(sub) ? sub : 'ostatni'
    return { id, label: BEV_SECTION_LABELS[id] || 'Ostatní nápoje' }
  }
  const id = (FOOD_SECTION_ORDER as readonly string[]).includes(sub) ? sub : 'ostatni'
  return { id, label: FOOD_SECTION_LABELS[id] || 'Ostatní jídla' }
}

export function cateringToPrintItem(item: CateringItem, kind: PrintMenuKind): PrintMenuItem {
  const section = sectionForCatering(item, kind)
  const unitPrice =
    Number(item.sellPrice) > 0
      ? Number(item.sellPrice)
      : Number(item.foodCost) > 0
        ? Math.round(Number(item.foodCost) * 1.6)
        : 0
  const allergenCodes = resolveAllergenCodes(item.allergens)
  return {
    id: item.id || uid('print'),
    name: item.name,
    description: item.recipe || undefined,
    sectionId: section.id,
    sectionLabel: section.label,
    portionLabel: czechPortionLabel({
      name: item.name,
      recipe: item.recipe,
      portion: item.portion,
      unit: kind === 'beverage' ? 'l' : 'porce',
    }),
    unitPrice,
    allergenCodes:
      allergenCodes.length > 0
        ? allergenCodes
        : inferAllergensFromName(item.name, item.recipe || ''),
    category: item.category === 'beverage' ? 'beverage' : item.category === 'other' ? 'other' : 'food',
  }
}

export function inventoryToPrintItem(item: InventoryItem, kind: PrintMenuKind): PrintMenuItem {
  const bridged = inventoryItemToCatering(item)
  const print = cateringToPrintItem(bridged, kind)
  const posSub = inventorySubcategoryToPos(item.category, item.subcategory)
  const section =
    kind === 'beverage'
      ? {
          id: (BEV_SECTION_ORDER as readonly string[]).includes(normalizeName(String(posSub)))
            ? normalizeName(String(posSub))
            : 'ostatni',
          label: '',
        }
      : {
          id: (FOOD_SECTION_ORDER as readonly string[]).includes(normalizeName(String(posSub)))
            ? normalizeName(String(posSub))
            : 'ostatni',
          label: '',
        }
  const labelMap = kind === 'beverage' ? BEV_SECTION_LABELS : FOOD_SECTION_LABELS
  return {
    ...print,
    id: `invprint_${item.id}`,
    sectionId: section.id,
    sectionLabel: labelMap[section.id] || subcategoryLabel(item.category, item.subcategory, BUILTIN_INVENTORY_CATEGORIES),
    portionLabel: czechPortionLabel({
      name: item.name,
      unit: item.unit,
      packVolume: item.pack_volume,
      portion: 1,
    }),
    unitPrice: Number(item.sale_price) || print.unitPrice,
    category: inventoryCategoryToPos(item.category) === 'beverage' ? 'beverage' : 'food',
  }
}

function matchesKind(category: 'food' | 'beverage' | 'other', kind: PrintMenuKind): boolean {
  if (kind === 'beverage') return category === 'beverage'
  return category !== 'beverage'
}

export function buildSectionsFromItems(
  items: PrintMenuItem[],
  kind: PrintMenuKind,
): PrintMenuSection[] {
  const order = kind === 'beverage' ? BEV_SECTION_ORDER : FOOD_SECTION_ORDER
  const labels = kind === 'beverage' ? BEV_SECTION_LABELS : FOOD_SECTION_LABELS
  const filtered = items.filter((i) => matchesKind(i.category, kind))
  const buckets = new Map<string, PrintMenuItem[]>()
  for (const id of order) buckets.set(id, [])
  for (const item of filtered) {
    const id = buckets.has(item.sectionId) ? item.sectionId : 'ostatni'
    buckets.get(id)!.push(item)
  }
  return order
    .map((id) => ({
      id,
      label: labels[id],
      items: buckets.get(id) || [],
    }))
    .filter((s) => s.items.length > 0)
}

export function collectMenuItems(opts: {
  kind: PrintMenuKind
  source: 'sklad' | 'project' | 'vision'
  inventory: InventoryItem[]
  project: EventProject | null | undefined
  visionItems: PrintMenuItem[]
}): PrintMenuItem[] {
  if (opts.source === 'vision') {
    return opts.visionItems.filter((i) => matchesKind(i.category, opts.kind))
  }
  if (opts.source === 'sklad') {
    return (opts.inventory ?? [])
      .filter((i) => i.pos_visible && !i.is_raw_material)
      .map((i) => inventoryToPrintItem(i, opts.kind))
      .filter((i) => matchesKind(i.category, opts.kind))
  }
  const catering = opts.project?.catering ?? []
  return catering
    .map((c) => cateringToPrintItem(c, opts.kind))
    .filter((i) => matchesKind(i.category, opts.kind))
}

export function venueHeaderFromProfile(profile: AgencyProfile): {
  title: string
  subtitle: string
  logoUrl: string | null
  meta: string
} {
  const title = (profile.companyName || '').trim() || 'EventFlow Catering'
  const subtitle =
    (profile.menuSubtitle || '').trim() ||
    [profile.street, profile.city].filter(Boolean).join(', ') ||
    'Gastronomie & eventy'
  const meta = [profile.ico ? `IČO ${profile.ico}` : '', profile.phone, profile.email]
    .filter(Boolean)
    .join(' · ')
  return {
    title,
    subtitle,
    logoUrl: profile.logoUrl || null,
    meta,
  }
}

export function eventMilestones(project: EventProject | null | undefined): Array<{
  time: string
  title: string
  description: string
}> {
  const timeline = project?.timeline ?? []
  return timeline
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 8)
    .map((t) => ({
      time: t.time || '',
      title: t.title || '',
      description: t.description || '',
    }))
}

export function shouldShowPrices(
  mode: PrintOperationMode,
  profile: AgencyProfile,
): boolean {
  if (mode === 'restaurant') return true
  return profile.showEventPrices !== false
}

export function formatMenuPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '—'
  return formatCurrency(price)
}

export function formatAllergenLine(codes: number[]): string {
  const formatted = formatAllergenCodes(codes)
  return formatted ? `Alergeny: ${formatted}` : ''
}

export function themeClassName(design: PrintDesign): string {
  return `print-theme-${normalizePrintDesign(design)}`
}

/** Flat rows for Excel export */
export function sectionsToExcelRows(
  sections: PrintMenuSection[],
  opts: { showPrices: boolean; kind: PrintMenuKind; mode: PrintOperationMode },
): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = []
  for (const section of sections) {
    for (const item of section.items) {
      rows.push({
        Druh: opts.kind === 'beverage' ? 'Nápojový lístek' : 'Jídelní lístek',
        Režim: opts.mode === 'event' ? 'Uzavřená akce' : 'Běžný provoz',
        Sekce: section.label,
        Název: item.name,
        Popis: item.description || '',
        Porce: item.portionLabel,
        'Cena (Kč)': opts.showPrices ? item.unitPrice : '',
        Alergeny: formatAllergenCodes(item.allergenCodes),
      })
    }
  }
  return rows
}

/** Ensure category registry labels stay available for custom subs. */
export function resolveSectionLabel(categoryId: string, subcategoryId: string): string {
  const cat = findCategoryDef(BUILTIN_INVENTORY_CATEGORIES, categoryId)
  const sub = cat?.subs.find((s) => s.id === subcategoryId)
  return sub?.label || subcategoryId
}
