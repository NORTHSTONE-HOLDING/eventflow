/**
 * Universal gastro migration importer — CSV / Excel-like text → clean InventoryItem rows.
 * Uses OpenAI when VITE_OPENAI_API_KEY is set; otherwise deterministic client-side simulation.
 */

import type { InventoryItem, InventoryUnit } from '../types'
import { createEmptyInventoryItem, normalizeName, normalizeUnit } from './inventoryModels'
import { inferPackVolumeLiters } from './unitConversion'
import { uid } from './documentIds'
import {
  findCategoryDef,
  inferInventorySubcategory,
} from './inventoryCategories'
import {
  getRegistryCategories,
  registerCategoryFromImportLabel,
} from '../store/useCategoryRegistryStore'

/** Czech display label or custom category name from importer / AI. */
export type GastroImportCategory = string

export interface GastroImportDraft {
  name: string
  category: GastroImportCategory
  unit: InventoryUnit | string
  quantity: number
  minimum: number
  purchase_price: number
  sale_price: number
  vat_rate: number
  barcode: string
  supplier: string
  pack_volume: number | null
}

export interface GastroImportResult {
  ok: boolean
  items: GastroImportDraft[]
  source: 'openai' | 'simulated'
  message: string
}

const BUILTIN_LABEL_MAP: Record<string, string> = {
  jidlo: 'Jídlo',
  food: 'Jídlo',
  raw: 'Jídlo',
  kitchen: 'Jídlo',
  piti: 'Pití',
  drink: 'Pití',
  beverage: 'Pití',
  bar: 'Pití',
  napoj: 'Pití',
  inventar: 'Inventář',
  package: 'Inventář',
  equipment: 'Inventář',
  other: 'Inventář',
  technika: 'Technika',
  tech: 'Technika',
  av: 'Technika',
}

function toAppCategory(label: GastroImportCategory): string {
  const categories = getRegistryCategories()
  const found = findCategoryDef(categories, label)
  if (found) return found.id
  // Register unknown custom labels so POS/Sklad filters stay in sync
  return registerCategoryFromImportLabel(label)
}

function classifyCategory(name: string, rawCat: string): GastroImportCategory {
  const blob = `${name} ${rawCat}`.toLowerCase()
  const key = normalizeName(rawCat)
  const categories = getRegistryCategories()

  if (key) {
    if (BUILTIN_LABEL_MAP[key]) return BUILTIN_LABEL_MAP[key]
    const found = findCategoryDef(categories, rawCat)
    if (found) return found.label
    // Preserve non-empty custom category strings from the sheet
    if (rawCat.trim().length >= 2 && !/^\d+$/.test(rawCat.trim())) {
      return rawCat.trim()
    }
  }

  if (/mikrofon|repro|projektor|ozvuc|osvetl|technika|kabel|av\b/.test(blob)) {
    return 'Technika'
  }
  if (/pivo|vino|víno|rum|vodka|gin|whisky|cola|limonad|kava|káva|prosecco|destil|sirup|nealko/.test(blob)) {
    return 'Pití'
  }
  if (/talir|talíř|sklenic|pribor|příbor|ubrous|dekor|inventar|židle|stul|stůl/.test(blob)) {
    return 'Inventář'
  }
  return 'Jídlo'
}

function detectUnit(name: string, rawUnit: string): InventoryUnit | string {
  const u = normalizeUnit(rawUnit)
  if (u === 'kg' || u === 'l' || u === 'ks' || u === 'ml' || u === 'g' || u === 'porce') return u
  const n = name.toLowerCase()
  if (/sud|keg|lahev|láhev|ks|kus/.test(n) && /pivo|rum|vodka|gin|vino|víno|prosecco/.test(n)) {
    return 'ks'
  }
  if (/kg|kilo|maso|hověz|losos|mouka|cukr/.test(n)) return 'kg'
  if (/litr|\bl\b|pivo|vino|olej|sirup/.test(n)) return 'l'
  return u || 'ks'
}

function genBarcode(name: string, index: number): string {
  const base = 8594002000000 + (Math.abs(hashCode(name)) % 900000) + index
  return String(base)
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0
  const cleaned = String(raw)
    .replace(/\s/g, '')
    .replace('Kč', '')
    .replace('CZK', '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** Split CSV / TSV / semicolon sheets */
export function parseSpreadsheetText(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return []

  const sep =
    (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length &&
    (lines[0].match(/;/g) || []).length >= (lines[0].match(/\t/g) || []).length
      ? ';'
      : (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length
        ? '\t'
        : ','

  return lines.map((line) => {
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQ = !inQ
        continue
      }
      if (!inQ && ch === sep) {
        cells.push(cur.trim())
        cur = ''
        continue
      }
      cur += ch
    }
    cells.push(cur.trim())
    return cells
  })
}

function mapHeader(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {}
  header.forEach((h, i) => {
    const k = normalizeName(h)
    if (/nazev|name|polozka|item|produkt/.test(k)) idx.name = i
    else if (/kategor|category|skupina|typ/.test(k)) idx.category = i
    else if (/jednot|unit|mj/.test(k)) idx.unit = i
    else if (/mnozstvi|quantity|qty|sklad|stock|stav/.test(k)) idx.qty = i
    else if (/minimum|min|pojist/.test(k)) idx.min = i
    else if (/nakup|purchase|cost|cena_n/.test(k)) idx.purchase = i
    else if (/prodej|sale|price|cena_p|cena$/.test(k) && idx.purchase == null) idx.purchase = i
    else if (/prodej|sale|price|cena_p/.test(k)) idx.sale = i
    else if (/dph|vat|sazba/.test(k)) idx.vat = i
    else if (/ean|barcode|carovy|čárov/.test(k)) idx.barcode = i
    else if (/dodavat|supplier|firma/.test(k)) idx.supplier = i
    else if (/objem|volume|pack|obsah/.test(k)) idx.pack = i
  })
  if (idx.name == null) idx.name = 0
  if (idx.qty == null && header.length > 1) idx.qty = 1
  return idx
}

function simulateParseRows(rows: string[][]): GastroImportDraft[] {
  if (!rows.length) return []
  const header = rows[0].map((c) => c.toLowerCase())
  const looksHeader = /nazev|name|polozka|produkt|kategor/.test(header.join(' '))
  const data = looksHeader ? rows.slice(1) : rows
  const map = looksHeader ? mapHeader(rows[0]) : { name: 0, qty: 1, unit: 2, purchase: 3 }

  return data
    .map((cells, index) => {
      const name = (cells[map.name ?? 0] || '').trim()
      if (!name || name.length < 2) return null
      const rawCat = map.category != null ? cells[map.category] || '' : ''
      const category = classifyCategory(name, rawCat)
      const unit = detectUnit(name, map.unit != null ? cells[map.unit] || '' : '')
      const quantity = parseNumber(map.qty != null ? cells[map.qty] : undefined) || 0
      const minimum = parseNumber(map.min != null ? cells[map.min] : undefined) || Math.max(1, Math.round(quantity * 0.15))
      const purchase = parseNumber(map.purchase != null ? cells[map.purchase] : undefined)
      const sale =
        parseNumber(map.sale != null ? cells[map.sale] : undefined) ||
        (purchase > 0 ? Math.round(purchase * 1.8) : 0)
      const vat =
        parseNumber(map.vat != null ? cells[map.vat] : undefined) ||
        (normalizeName(category) === 'piti' || normalizeName(category) === 'technika' ? 21 : 12)
      const barcodeRaw = map.barcode != null ? (cells[map.barcode] || '').trim() : ''
      const barcode = barcodeRaw || genBarcode(name, index)
      const supplier = (map.supplier != null ? cells[map.supplier] : '') || 'Import migrace'
      const packRaw = parseNumber(map.pack != null ? cells[map.pack] : undefined)
      const pack_volume =
        packRaw > 0 ? packRaw : inferPackVolumeLiters(name, String(unit))

      return {
        name,
        category,
        unit,
        quantity,
        minimum,
        purchase_price: purchase,
        sale_price: sale,
        vat_rate: vat,
        barcode,
        supplier,
        pack_volume,
      } satisfies GastroImportDraft
    })
    .filter((x): x is GastroImportDraft => Boolean(x))
}

async function openaiParseSheet(text: string): Promise<GastroImportDraft[] | null> {
  const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Jsi gastro migrátor EventFlow. Z tabulky dodavatele/konkurence vytěž čisté položky skladu. Vrať JSON { "items": [ { "name", "category": "Jídlo"|"Pití"|"Inventář"|"Technika"|vlastní_název_kategorie, "unit": "ks"|"kg"|"l"|"ml"|"g", "quantity", "minimum", "purchase_price", "sale_price", "vat_rate", "barcode", "supplier", "pack_volume" } ] }. pack_volume je litry u lahví/sudů (0.7, 50) nebo null. Preferuj systémové kategorie; vlastní kategorie (např. Tabákové výrobky, VIP Merch) zachovej přesně. Doplň chybějící EAN.',
          },
          {
            role: 'user',
            content: `Migruj tento sheet do EventFlow skladu. Dostupné kategorie: ${getRegistryCategories()
              .map((c) => c.label)
              .join(', ')}.\n\n${text.slice(0, 12000)}`,
          },
        ],
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = json.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { items?: GastroImportDraft[] }
    if (!Array.isArray(parsed.items)) return null
    return parsed.items.map((it, index) => {
      const rawCategory = String(it.category || '').trim()
      const category = rawCategory
        ? classifyCategory(String(it.name), rawCategory)
        : classifyCategory(String(it.name), '')
      return {
        name: String(it.name || '').trim(),
        category,
        unit: detectUnit(String(it.name), String(it.unit || 'ks')),
        quantity: Number(it.quantity) || 0,
        minimum: Number(it.minimum) || 1,
        purchase_price: Number(it.purchase_price) || 0,
        sale_price: Number(it.sale_price) || 0,
        vat_rate: Number(it.vat_rate) || 12,
        barcode: String(it.barcode || '').trim() || genBarcode(String(it.name), index),
        supplier: String(it.supplier || 'Import migrace'),
        pack_volume:
          it.pack_volume != null
            ? Number(it.pack_volume)
            : inferPackVolumeLiters(String(it.name), String(it.unit || 'ks')),
      }
    })
  } catch {
    return null
  }
}

export async function importGastroSpreadsheet(file: File): Promise<GastroImportResult> {
  const buf = await file.arrayBuffer()
  let text = ''
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    // Binary Excel without SheetJS: decode as latin1 text best-effort + ask user for CSV.
    // Many exports are CSV mislabeled; try UTF-8 first.
    text = new TextDecoder('utf-8').decode(buf)
    if (!text.includes(',') && !text.includes(';') && !text.includes('\t')) {
      text = new TextDecoder('latin1').decode(buf)
    }
  } else {
    text = new TextDecoder('utf-8').decode(buf)
  }

  const ai = await openaiParseSheet(text)
  if (ai?.length) {
    return {
      ok: true,
      items: ai.filter((i) => i.name),
      source: 'openai',
      message: `AI migrace dokončena · ${ai.length} položek z „${file.name}"`,
    }
  }

  const rows = parseSpreadsheetText(text)
  const simulated = simulateParseRows(rows)
  if (!simulated.length) {
    return {
      ok: false,
      items: [],
      source: 'simulated',
      message:
        'Nepodařilo se rozpoznat řádky — použijte CSV/Excel s hlavičkou Název, Kategorie, Jednotka, Množství, Cena',
    }
  }
  return {
    ok: true,
    items: simulated,
    source: 'simulated',
    message: `Lokální migrace dokončena · ${simulated.length} položek z „${file.name}"`,
  }
}

export function draftsToInventoryItems(drafts: GastroImportDraft[]): InventoryItem[] {
  return drafts.map((d) => {
    const categoryId = toAppCategory(d.category)
    const subcategory = inferInventorySubcategory(d.name, categoryId)
    const warehouse =
      categoryId === 'beverage'
        ? 'Bar import'
        : categoryId === 'raw'
          ? 'Kuchyň import'
          : categoryId === 'tech'
            ? 'Technika import'
            : categoryId === 'package'
              ? 'Inventář import'
              : `${d.category} import`
    return createEmptyInventoryItem({
      id: uid('inv'),
      name: d.name,
      barcode: d.barcode,
      category: categoryId,
      subcategory,
      supplier: d.supplier,
      purchase_price: d.purchase_price,
      average_price: d.purchase_price,
      sale_price: d.sale_price,
      vat_rate: d.vat_rate,
      unit: d.unit,
      current_quantity: d.quantity,
      minimum_quantity: d.minimum,
      pack_volume: d.pack_volume,
      warehouse_section: warehouse,
    })
  })
}

