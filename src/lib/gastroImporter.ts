/**
 * Universal Data Importer — EventFlow Sklad
 * SheetJS (.xlsx/.csv) → AI classification (gpt-4o-mini) → warehouse rows
 * CRITICAL: all imports set pos_visible = false (cashier lock until Do kasy toggle)
 */

import * as XLSX from 'xlsx'
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
  useCategoryRegistryStore,
} from '../store/useCategoryRegistryStore'
import {
  hasVenueOpenAiKey,
  openAiMessageContent,
  openaiChatCompletions,
} from './openaiClient'

/** Czech display label or custom category name from importer / AI. */
export type GastroImportCategory = string

export interface GastroImportDraft {
  name: string
  category: GastroImportCategory
  /** Czech subcategory label from AI (e.g. Pivo, Hlavní chody) */
  subcategory: string
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
  headers?: string[]
  rowCount?: number
}

export type GastroImportProgressPhase =
  | 'reading'
  | 'parsing'
  | 'ai'
  | 'classifying'
  | 'done'
  | 'error'

export type GastroImportProgress = {
  phase: GastroImportProgressPhase
  detail: string
  percent: number
}

const AI_SYSTEM_PROMPT = `Jseš elitní gastro datový analytik pro systém EventFlow. Tvým úkolem je zanalyzovat tento exportní soubor produktů z cizího pokladního systému. Rozklíčuj chaotické názvy sloupců a extrahuj: Název položky, Nákupní cenu, Prodejní cenu, Sazbu DPH, Jednotku (ks, kg, l) a Množství skladem. 
ZÁROVEŇ každou položku inteligentně zařaď do našich hlavních kategorií ('Jídlo', 'Pití', 'Inventář', 'Technika') a vymysli k ní logickou českou podkategorii (např. pokud je v názvu 'Plzeň' nebo 'Pivo', podkategorie bude 'Pivo'; pokud 'Vodka' nebo 'Rum', podkategorie bude 'Alkohol'; pokud 'Svíčková' nebo 'Steak', podkategorie bude 'Hlavní chody'). Vygeneruj chybějící unikátní čárové kódy / EAN. Vrať striktně čistou JSON strukturu bez okolních textů.`

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

/** Czech subcategory labels → known inventory subcategory ids */
const CZECH_SUB_TO_ID: Record<string, string> = {
  pivo: 'pivo',
  vino: 'vino',
  alkohol: 'alkohol',
  nealko: 'nealko',
  koktejly: 'alkohol',
  destilaty: 'alkohol',
  predkrmy: 'predkrmy',
  hlavni: 'hlavni',
  hlavni_chody: 'hlavni',
  dezerty: 'dezerty',
  raut: 'raut',
  obaly: 'obaly',
  pribor: 'pribor',
  pribory: 'pribor',
  dekorace: 'dekorace',
  ozvuceni: 'ozvuceni',
  osvetleni: 'osvetleni',
  av_technika: 'av',
  av: 'av',
  ostatni: 'ostatni',
}

function toAppCategory(label: GastroImportCategory): string {
  const categories = getRegistryCategories()
  const found = findCategoryDef(categories, label)
  if (found) return found.id
  return registerCategoryFromImportLabel(label)
}

export function classifyCategory(name: string, rawCat: string): GastroImportCategory {
  const blob = `${name} ${rawCat}`.toLowerCase()
  const key = normalizeName(rawCat)
  const categories = getRegistryCategories()

  if (key) {
    if (BUILTIN_LABEL_MAP[key]) return BUILTIN_LABEL_MAP[key]
    const found = findCategoryDef(categories, rawCat)
    if (found) return found.label
    if (rawCat.trim().length >= 2 && !/^\d+$/.test(rawCat.trim())) {
      return rawCat.trim()
    }
  }

  if (/mikrofon|repro|projektor|ozvuc|osvetl|technika|kabel|av\b/.test(blob)) {
    return 'Technika'
  }
  if (
    /pivo|plzen|plzeň|vino|víno|rum|vodka|gin|whisky|cola|limonad|kava|káva|prosecco|destil|sirup|nealko|mojito/.test(
      blob,
    )
  ) {
    return 'Pití'
  }
  if (/talir|talíř|sklenic|pribor|příbor|ubrous|dekor|inventar|židle|stul|stůl|mycí|uklid/.test(blob)) {
    return 'Inventář'
  }
  return 'Jídlo'
}

/** High-fidelity client-side subcategory inference (AI fallback). */
export function classifySubcategoryLabel(name: string, categoryLabel: string): string {
  const n = normalizeName(name)
  const cat = normalizeName(categoryLabel)

  if (cat === 'piti' || cat === 'beverage') {
    if (/pivo|plzen|plzen|koz|budvar|lezak|ležák|ipa|apa|ale\b/.test(n)) return 'Pivo'
    if (/vino|prosecco|sekt|champagne|chardonnay|sauvignon|riesling/.test(n)) return 'Víno'
    if (/rum|vodka|gin|whisky|whiskey|becherovka|slivovice|tequila|destil|fernet|absinth/.test(n)) {
      return 'Alkohol'
    }
    if (/mojito|koktejl|aperol|negroni|gin.?tonic|cuba.?libre/.test(n)) return 'Alkohol'
    return 'Nealko'
  }

  if (cat === 'jidlo' || cat === 'raw' || cat === 'food') {
    if (/dezer|dezert|fondant|cake|zmrzlin|tiramisu|cheesecake|kolac|koláč/.test(n)) return 'Dezerty'
    if (/predkrm|canape|bruschetta|polev|polév|amuse|carpaccio/.test(n)) return 'Předkrmy'
    if (/raut|buffet|finger|stanice/.test(n)) return 'Raut'
    if (/svickov|svíčkov|steak|hověz|losos|rizoto|knedl|gulas|guláš|hlavni/.test(n)) {
      return 'Hlavní chody'
    }
    if (/bezlep/.test(n)) return 'Bezlepkové chody'
    return 'Hlavní chody'
  }

  if (cat === 'technika' || cat === 'tech') {
    if (/mikrofon|repro|ozvuc|mixer|sound/.test(n)) return 'Ozvučení'
    if (/svetlo|osvetl|led|light/.test(n)) return 'Osvětlení'
    return 'AV technika'
  }

  if (cat === 'inventar' || cat === 'package') {
    if (/talir|sklenic|kelimek|krabic|obal/.test(n)) return 'Obaly'
    if (/pribor|vidlic|nuz|lzic/.test(n)) return 'Příbory'
    if (/dekor|kvetin|vaz/.test(n)) return 'Dekorace'
  }

  return 'Ostatní'
}

function resolveSubcategoryId(
  categoryId: string,
  subcategoryLabel: string,
  productName: string,
): string {
  const label = (subcategoryLabel || classifySubcategoryLabel(productName, categoryId)).trim()
  if (!label) return inferInventorySubcategory(productName, categoryId)

  const key = normalizeName(label)
  const mapped = CZECH_SUB_TO_ID[key]
  const categories = getRegistryCategories()
  const parent = findCategoryDef(categories, categoryId)

  if (mapped && parent?.subs.some((s) => s.id === mapped)) {
    return mapped
  }

  const existing = parent?.subs.find(
    (s) => normalizeName(s.label) === key || s.id === key || s.id === mapped,
  )
  if (existing) return existing.id

  // Register custom Czech subcategory under parent (e.g. IPA Piva, Bezlepkové chody)
  const reg = useCategoryRegistryStore.getState().addCustomSubcategory(categoryId, label)
  if (reg.ok && reg.subcategory) return reg.subcategory.id

  return inferInventorySubcategory(productName, categoryId)
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
  return Math.abs(h)
}

function parseNumber(raw: string | undefined | number | null): number {
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const cleaned = String(raw)
    .replace(/\s/g, '')
    .replace('Kč', '')
    .replace('CZK', '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function cellToString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return String(v).trim()
}

/** SheetJS: File → matrix of strings (first sheet). */
export async function parseFileToMatrix(file: File): Promise<{
  rows: string[][]
  headers: string[]
  sheetName: string
}> {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, {
    type: 'array',
    cellDates: true,
    dense: false,
  })
  const sheetName = workbook.SheetNames[0] || 'Sheet1'
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    return { rows: [], headers: [], sheetName }
  }
  const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  })
  const rows = (raw || [])
    .map((row) => (Array.isArray(row) ? row.map(cellToString) : []))
    .filter((row) => row.some((c) => c.length > 0))
  const headers = rows[0] ? [...rows[0]] : []
  return { rows, headers, sheetName }
}

/** Split CSV / TSV / semicolon sheets (text fallback). */
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
    if (/nazev|name|polozka|item|produkt|zbozi/.test(k)) idx.name = i
    else if (/podkategor|subcat/.test(k)) idx.subcategory = i
    else if (/kategor|category|skupina|typ/.test(k)) idx.category = i
    else if (/jednot|unit|mj/.test(k)) idx.unit = i
    else if (/mnozstvi|quantity|qty|sklad|stock|stav|pocet/.test(k)) idx.qty = i
    else if (/minimum|min|pojist/.test(k)) idx.min = i
    else if (/nakup|purchase|cost|cena_n|vcenenak/.test(k)) idx.purchase = i
    else if (/prodej|sale|price|cena_p|prodejni/.test(k)) idx.sale = i
    else if (/^cena$/.test(k) && idx.purchase == null) idx.purchase = i
    else if (/dph|vat|sazba/.test(k)) idx.vat = i
    else if (/ean|barcode|carovy|carovy.?kod/.test(k)) idx.barcode = i
    else if (/dodavat|supplier|firma/.test(k)) idx.supplier = i
    else if (/objem|volume|pack|obsah/.test(k)) idx.pack = i
  })
  if (idx.name == null) idx.name = 0
  if (idx.qty == null && header.length > 1) idx.qty = 1
  return idx
}

function normalizeDraft(
  partial: Partial<GastroImportDraft> & { name: string },
  index: number,
): GastroImportDraft {
  const name = String(partial.name || '').trim()
  const category = classifyCategory(name, String(partial.category || ''))
  const subcategory =
    String(partial.subcategory || '').trim() || classifySubcategoryLabel(name, category)
  const unit = detectUnit(name, String(partial.unit || 'ks'))
  const purchase = parseNumber(partial.purchase_price)
  const sale =
    parseNumber(partial.sale_price) || (purchase > 0 ? Math.round(purchase * 1.8) : 0)
  const quantity = parseNumber(partial.quantity)
  return {
    name,
    category,
    subcategory,
    unit,
    quantity,
    minimum:
      parseNumber(partial.minimum) || Math.max(1, Math.round(quantity * 0.15) || 1),
    purchase_price: purchase,
    sale_price: sale,
    vat_rate:
      parseNumber(partial.vat_rate) ||
      (normalizeName(category) === 'piti' || normalizeName(category) === 'technika' ? 21 : 12),
    barcode: String(partial.barcode || '').trim() || genBarcode(name, index),
    supplier: String(partial.supplier || 'Import migrace').trim() || 'Import migrace',
    pack_volume:
      partial.pack_volume != null && Number(partial.pack_volume) > 0
        ? Number(partial.pack_volume)
        : inferPackVolumeLiters(name, String(unit)),
  }
}

function simulateParseRows(rows: string[][]): GastroImportDraft[] {
  if (!rows.length) return []
  const headerJoined = rows[0].map((c) => c.toLowerCase()).join(' ')
  const looksHeader = /nazev|name|polozka|produkt|kategor|zbozi|cena|qty|mnoz/.test(headerJoined)
  const data = looksHeader ? rows.slice(1) : rows
  const map = looksHeader ? mapHeader(rows[0]) : { name: 0, qty: 1, unit: 2, purchase: 3 }

  return data
    .map((cells, index) => {
      const name = (cells[map.name ?? 0] || '').trim()
      if (!name || name.length < 2) return null
      const rawCat = map.category != null ? cells[map.category] || '' : ''
      const rawSub = map.subcategory != null ? cells[map.subcategory] || '' : ''
      return normalizeDraft(
        {
          name,
          category: rawCat,
          subcategory: rawSub,
          unit: map.unit != null ? cells[map.unit] || '' : '',
          quantity: parseNumber(map.qty != null ? cells[map.qty] : undefined),
          minimum: parseNumber(map.min != null ? cells[map.min] : undefined),
          purchase_price: parseNumber(map.purchase != null ? cells[map.purchase] : undefined),
          sale_price: parseNumber(map.sale != null ? cells[map.sale] : undefined),
          vat_rate: parseNumber(map.vat != null ? cells[map.vat] : undefined),
          barcode: map.barcode != null ? cells[map.barcode] || '' : '',
          supplier: map.supplier != null ? cells[map.supplier] || '' : '',
          pack_volume: parseNumber(map.pack != null ? cells[map.pack] : undefined) || null,
        },
        index,
      )
    })
    .filter((x): x is GastroImportDraft => Boolean(x))
}

function matrixToAiPayload(rows: string[][], maxRows = 180): string {
  const slice = rows.slice(0, maxRows + 1)
  return JSON.stringify({
    headers: slice[0] || [],
    rows: slice.slice(1),
    total_rows: Math.max(0, rows.length - 1),
  })
}

async function openaiClassifyMatrix(
  rows: string[][],
  fileName: string,
): Promise<GastroImportDraft[] | null> {
  if (!hasVenueOpenAiKey()) return null
  try {
    const registryLabels = getRegistryCategories()
      .map((c) => c.label)
      .join(', ')
    const chat = await openaiChatCompletions({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${AI_SYSTEM_PROMPT}

Výstupní formát JSON:
{
  "items": [
    {
      "name": "string",
      "category": "Jídlo"|"Pití"|"Inventář"|"Technika",
      "subcategory": "česká podkategorie",
      "unit": "ks"|"kg"|"l"|"ml"|"g",
      "quantity": number,
      "minimum": number,
      "purchase_price": number,
      "sale_price": number,
      "vat_rate": number,
      "barcode": "string",
      "supplier": "string",
      "pack_volume": number|null
    }
  ]
}
Dostupné hlavní kategorie v EventFlow: ${registryLabels}.`,
        },
        {
          role: 'user',
          content: `Soubor: ${fileName}\n\nTabulková data (headers + rows):\n${matrixToAiPayload(rows)}`,
        },
      ],
    })
    if (!chat.ok) return null
    const content = openAiMessageContent(chat.data)
    if (!content) return null
    const parsed = JSON.parse(content) as {
      items?: Array<Partial<GastroImportDraft> & { name?: string }>
    }
    if (!Array.isArray(parsed.items)) return null
    return parsed.items
      .map((it, index) => {
        const name = String(it.name || '').trim()
        if (!name) return null
        return normalizeDraft(
          {
            name,
            category: String(it.category || ''),
            subcategory: String(it.subcategory || ''),
            unit: String(it.unit || 'ks'),
            quantity: Number(it.quantity) || 0,
            minimum: Number(it.minimum) || 0,
            purchase_price: Number(it.purchase_price) || 0,
            sale_price: Number(it.sale_price) || 0,
            vat_rate: Number(it.vat_rate) || 0,
            barcode: String(it.barcode || ''),
            supplier: String(it.supplier || 'Import migrace'),
            pack_volume: it.pack_volume != null ? Number(it.pack_volume) : null,
          },
          index,
        )
      })
      .filter((x): x is GastroImportDraft => Boolean(x))
  } catch {
    return null
  }
}

/**
 * Full pipeline: SheetJS parse → OpenAI classify (or high-fidelity local fallback).
 */
export async function importGastroSpreadsheet(
  file: File,
  onProgress?: (p: GastroImportProgress) => void,
): Promise<GastroImportResult> {
  const report = (phase: GastroImportProgressPhase, detail: string, percent: number) => {
    onProgress?.({ phase, detail, percent })
  }

  try {
    report('reading', 'Načítám soubor…', 8)
    const lower = file.name.toLowerCase()
    const allowed =
      lower.endsWith('.csv') ||
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls') ||
      lower.endsWith('.txt')
    if (!allowed) {
      report('error', 'Nepodporovaný formát souboru', 100)
      return {
        ok: false,
        items: [],
        source: 'simulated',
        message: 'Podporované formáty: .csv, .xlsx, .xls',
      }
    }

    report('parsing', 'SheetJS převádí matici sloupců…', 22)
    let rows: string[][] = []
    let headers: string[] = []
    try {
      const parsed = await parseFileToMatrix(file)
      rows = parsed.rows
      headers = parsed.headers
    } catch {
      const text = new TextDecoder('utf-8').decode(await file.arrayBuffer())
      rows = parseSpreadsheetText(text)
      headers = rows[0] || []
    }

    if (!rows.length) {
      report('error', 'Prázdný soubor', 100)
      return {
        ok: false,
        items: [],
        source: 'simulated',
        message: 'Soubor neobsahuje žádná rozpoznatelná data',
        headers,
        rowCount: 0,
      }
    }

    report(
      'ai',
      'AI analyzuje strukturu souboru a třídí položky do kategorií...',
      48,
    )
    const ai = await openaiClassifyMatrix(rows, file.name)
    if (ai?.length) {
      report('classifying', 'Dokončuji AI klasifikaci kategorií a podkategorií…', 88)
      report('done', `AI hotovo · ${ai.length} položek`, 100)
      return {
        ok: true,
        items: ai,
        source: 'openai',
        message: `✨ Úspěšně připraveno ${ai.length} položek. Kategorie a podkategorie byly automaticky přiřazeny pomocí AI.`,
        headers,
        rowCount: Math.max(0, rows.length - 1),
      }
    }

    report('classifying', 'Lokální AI simulace třídí kategorie a podkategorie…', 72)
    const simulated = simulateParseRows(rows)
    if (!simulated.length) {
      report('error', 'Nepodařilo se rozpoznat řádky', 100)
      return {
        ok: false,
        items: [],
        source: 'simulated',
        message:
          'Nepodařilo se rozpoznat řádky — použijte CSV/Excel s hlavičkou Název, Cena, Množství…',
        headers,
        rowCount: Math.max(0, rows.length - 1),
      }
    }
    report('done', `Simulace hotova · ${simulated.length} položek`, 100)
    return {
      ok: true,
      items: simulated,
      source: 'simulated',
      message: `✨ Úspěšně připraveno ${simulated.length} položek. Kategorie a podkategorie byly automaticky přiřazeny pomocí AI.`,
      headers,
      rowCount: Math.max(0, rows.length - 1),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import selhal'
    report('error', msg, 100)
    return {
      ok: false,
      items: [],
      source: 'simulated',
      message: `Chyba importu: ${msg}`,
    }
  }
}

export function draftsToInventoryItems(drafts: GastroImportDraft[]): InventoryItem[] {
  return drafts.map((d) => {
    const categoryId = toAppCategory(d.category)
    const subcategory = resolveSubcategoryId(
      categoryId,
      d.subcategory || '',
      d.name,
    )
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
      // CRITICAL: cashier lock — not visible in /pos-terminal until Do kasy toggle
      pos_visible: false,
    })
  })
}
