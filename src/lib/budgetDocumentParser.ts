/**
 * AI Planner — budget document / photo ingestion (gpt-4o-mini + client simulation).
 * Supports PDF, Excel/CSV and image snapshots of older budgets or event sheets.
 */

import * as XLSX from 'xlsx'
import type { BudgetLine, CateringItem, TimelineItem } from '../types'
import { uid } from './documentIds'
import {
  hasVenueOpenAiKey,
  openAiMessageContent,
  openaiChatCompletions,
} from './openaiClient'

export const BUDGET_UPLOAD_ACCEPT =
  'image/*,.pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'

const SYSTEM_PROMPT = `Jsi EventFlow AI Budget Parser (ČR). Čteš historické rozpočty, nabídky a eventové podklady (PDF, Excel, fotky).
Extrahuj nákladové položky, dodavatele, DPH (0/12/21), časový layout akce a catering.
Vrať výhradně JSON:
{
  "guests": number,
  "location": string,
  "budget": number,
  "eventType": string,
  "name": string,
  "suppliers": string[],
  "timeline": [{"time":"HH:MM","title":string,"description":string}],
  "budgetLines": [{"category":string,"description":string,"amount":number,"vatRate":0|12|21,"isCost":boolean}],
  "catering": [{"name":string,"recipe":string,"foodCost":number,"portion":number,"allergens":string[],"category":"food"|"beverage"|"other","sellPrice":number,"vatRate":0|12|21,"subcategory":string}]
}
Částky v Kč. Popisy česky. Pokud údaj chybí, odhadni realisticky pro firemní akci v ČR.`

export interface ExtractedBudgetLine {
  category: string
  description: string
  amount: number
  vatRate: number
  isCost: boolean
}

export interface ExtractedCateringItem {
  name: string
  recipe: string
  foodCost: number
  portion: number
  allergens: string[]
  category: 'food' | 'beverage' | 'other'
  sellPrice: number
  vatRate: number
  subcategory: string
}

export interface ExtractedTimelineItem {
  time: string
  title: string
  description: string
}

export interface BudgetDocumentExtract {
  guests?: number
  location?: string
  budget?: number
  eventType?: string
  name?: string
  suppliers: string[]
  timeline: ExtractedTimelineItem[]
  budgetLines: ExtractedBudgetLine[]
  catering: ExtractedCateringItem[]
  source: 'openai' | 'simulated'
  fileNames: string[]
}

function normalizeVat(raw: unknown): number {
  const n = Number(raw)
  if (n === 0 || n === 12 || n === 21) return n
  if (n > 0 && n < 15) return 12
  if (n >= 15) return 21
  return 21
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst'))
    reader.readAsDataURL(file)
  })
}

function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst'))
    reader.readAsArrayBuffer(file)
  })
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst'))
    reader.readAsText(file)
  })
}

function isSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('sheet') ||
    file.type.includes('excel') ||
    file.type === 'text/csv'
  )
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** SheetJS → compact text matrix for the model. */
async function spreadsheetToText(file: File): Promise<string> {
  const buf = await fileToArrayBuffer(file)
  const workbook = XLSX.read(buf, { type: 'array', cellDates: true })
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames.slice(0, 4)) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', RS: '\n' })
    parts.push(`=== List: ${sheetName} ===\n${csv.slice(0, 14000)}`)
  }
  return parts.join('\n\n')
}

async function pdfToTextHint(file: File): Promise<string> {
  // Browser-side PDF binary is opaque; send filename + size + base64 prefix for Vision-capable models via text context.
  const dataUrl = await fileToDataUrl(file)
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] || '' : ''
  return [
    `PDF soubor: ${file.name}`,
    `Velikost: ${file.size} B`,
    `Base64 (začátek pro kontext, max 8k znaků): ${b64.slice(0, 8000)}`,
    'Pokud nelze dekódovat binárně, odhadni typický český eventový rozpočet dle názvu souboru a promptu uživatele.',
  ].join('\n')
}

function emptyExtract(fileNames: string[], source: 'openai' | 'simulated'): BudgetDocumentExtract {
  return {
    suppliers: [],
    timeline: [],
    budgetLines: [],
    catering: [],
    source,
    fileNames,
  }
}

function parseExtractJson(raw: string, fileNames: string[]): BudgetDocumentExtract {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const parsed = JSON.parse(cleaned) as Record<string, unknown>
  const timelineRaw = Array.isArray(parsed.timeline) ? parsed.timeline : []
  const linesRaw = Array.isArray(parsed.budgetLines) ? parsed.budgetLines : []
  const cateringRaw = Array.isArray(parsed.catering) ? parsed.catering : []
  const suppliersRaw = Array.isArray(parsed.suppliers) ? parsed.suppliers : []

  return {
    guests: Number(parsed.guests) > 0 ? Number(parsed.guests) : undefined,
    location: parsed.location ? String(parsed.location) : undefined,
    budget: Number(parsed.budget) > 0 ? Number(parsed.budget) : undefined,
    eventType: parsed.eventType ? String(parsed.eventType) : undefined,
    name: parsed.name ? String(parsed.name) : undefined,
    suppliers: suppliersRaw.map((s) => String(s)).filter(Boolean),
    timeline: timelineRaw
      .map((t) => {
        const row = t as Record<string, unknown>
        const title = String(row.title || '').trim()
        if (!title) return null
        return {
          time: String(row.time || '10:00'),
          title,
          description: String(row.description || ''),
        }
      })
      .filter((t): t is ExtractedTimelineItem => Boolean(t)),
    budgetLines: linesRaw
      .map((l) => {
        const row = l as Record<string, unknown>
        const amount = Number(row.amount)
        if (!Number.isFinite(amount) || amount === 0) return null
        return {
          category: String(row.category || 'Ostatní'),
          description: String(row.description || row.category || 'Položka'),
          amount: Math.round(Math.abs(amount)),
          vatRate: normalizeVat(row.vatRate),
          isCost: row.isCost === false ? false : true,
        }
      })
      .filter((l): l is ExtractedBudgetLine => Boolean(l)),
    catering: cateringRaw
      .map((c) => {
        const row = c as Record<string, unknown>
        const name = String(row.name || '').trim()
        if (!name) return null
        const cat = String(row.category || 'food')
        const category: ExtractedCateringItem['category'] =
          cat === 'beverage' || cat === 'other' ? cat : 'food'
        return {
          name,
          recipe: String(row.recipe || 'Dle historického rozpočtu'),
          foodCost: Math.max(0, Math.round(Number(row.foodCost) || 0)),
          portion: Math.max(1, Math.round(Number(row.portion) || 1)),
          allergens: Array.isArray(row.allergens)
            ? row.allergens.map((a) => String(a))
            : [],
          category,
          sellPrice: Math.max(0, Math.round(Number(row.sellPrice) || 0)),
          vatRate: normalizeVat(row.vatRate ?? (category === 'beverage' ? 21 : 12)),
          subcategory: String(row.subcategory || (category === 'beverage' ? 'nealko' : 'hlavni')),
        }
      })
      .filter((c): c is ExtractedCateringItem => Boolean(c)),
    source: 'openai',
    fileNames,
  }
}

function mockExtractFromFiles(
  files: File[],
  promptHint: string,
): BudgetDocumentExtract {
  const lower = `${promptHint} ${files.map((f) => f.name).join(' ')}`.toLowerCase()
  const guestsMatch = lower.match(/(\d[\d\s]*)\s*(lidí|osob|host)/)
  const guests = guestsMatch
    ? parseInt(guestsMatch[1].replace(/\s/g, ''), 10)
    : 120
  const budgetMatch = lower.match(/(\d[\d\s]*)\s*(kč|czk|korun)/)
  const budget = budgetMatch
    ? parseInt(budgetMatch[1].replace(/\s/g, ''), 10)
    : guests * 2800
  const location = lower.includes('brn')
    ? 'Brno'
    : lower.includes('ostrav')
      ? 'Ostrava'
      : 'Praha'
  const supplierHint = files.some((f) => /cater|gastro|jidel/i.test(f.name))
    ? 'Gastro Partner ČR s.r.o.'
    : 'Event Logistics Praha s.r.o.'

  return {
    guests,
    location,
    budget,
    eventType: lower.includes('svatb') ? 'Svatba' : 'Firemní večírek',
    name: `Import rozpočtu — ${location} (${guests} hostů)`,
    suppliers: [supplierHint, 'AV Tech Bohemia', 'Floral Atelier'],
    timeline: [
      {
        time: '07:30',
        title: 'Příjezd dodavatelů',
        description: `Podklady z ${files[0]?.name || 'rozpočtu'} — vykládka a briefing`,
      },
      {
        time: '09:00',
        title: 'Stavba layoutu',
        description: 'Historický layout z podkladů — bary, stoly, AV',
      },
      {
        time: '12:00',
        title: 'Catering prep',
        description: 'Příprava stanic dle vytěženého jídelníčku',
      },
      {
        time: '17:30',
        title: 'Welcome & program',
        description: 'Zahájení dle synchronizovaného harmonogramu',
      },
      {
        time: '23:00',
        title: 'Úklid & inventura',
        description: 'Demontáž, kontrola dodavatelských položek',
      },
    ],
    budgetLines: [
      {
        category: 'Catering',
        description: `Strava & nápoje — import (${supplierHint})`,
        amount: Math.round(budget * 0.38),
        vatRate: 12,
        isCost: true,
      },
      {
        category: 'Personál',
        description: 'Obsluha a produkce dle historického sheetu',
        amount: Math.round(budget * 0.16),
        vatRate: 21,
        isCost: true,
      },
      {
        category: 'Pronájem',
        description: 'Prostor / technika z podkladů',
        amount: Math.round(budget * 0.14),
        vatRate: 21,
        isCost: true,
      },
      {
        category: 'Doprava',
        description: 'Logistika dodavatelů',
        amount: Math.round(budget * 0.06),
        vatRate: 21,
        isCost: true,
      },
      {
        category: 'Ostatní',
        description: 'Dekorace, pojištění, rezerva z Excel/PDF',
        amount: Math.round(budget * 0.08),
        vatRate: 21,
        isCost: true,
      },
      {
        category: 'Výnos',
        description: 'Celková cena zakázky (z podkladů)',
        amount: budget,
        vatRate: 21,
        isCost: false,
      },
    ],
    catering: [
      {
        name: 'Welcome drink — dle historického rozpočtu',
        recipe: 'Prosecco / mocktail, led, citrus',
        foodCost: Math.round(guests * 80),
        portion: guests,
        allergens: ['sulfit'],
        category: 'beverage',
        sellPrice: 95,
        vatRate: 21,
        subcategory: 'vino',
      },
      {
        name: 'Hlavní menu — import z podkladů',
        recipe: 'Menu dégustation dle starého sheetu',
        foodCost: Math.round(guests * 260),
        portion: guests,
        allergens: ['mléko', 'lepek'],
        category: 'food',
        sellPrice: 320,
        vatRate: 12,
        subcategory: 'hlavni',
      },
      {
        name: 'Open bar soft & pivo',
        recipe: 'Nealko, pivo, voda, led',
        foodCost: Math.round(guests * 90),
        portion: guests,
        allergens: [],
        category: 'beverage',
        sellPrice: 75,
        vatRate: 21,
        subcategory: 'pivo',
      },
    ],
    source: 'simulated',
    fileNames: files.map((f) => f.name),
  }
}

async function buildUserContentParts(
  files: File[],
  prompt: string,
): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: `Uživatelský prompt akce:\n${prompt || '(bez textového promptu)'}\n\nNahrajte podklady (${files.length}): ${files.map((f) => f.name).join(', ')}. Extrahuj rozpočet, dodavatele, timeline a catering.`,
    },
  ]

  for (const file of files.slice(0, 6)) {
    if (isImage(file)) {
      const dataUrl = await fileToDataUrl(file)
      parts.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      })
      continue
    }
    if (isSpreadsheet(file)) {
      const sheetText = await spreadsheetToText(file)
      parts.push({
        type: 'text',
        text: `Excel/CSV „${file.name}“:\n${sheetText}`,
      })
      continue
    }
    if (isPdf(file)) {
      parts.push({
        type: 'text',
        text: await pdfToTextHint(file),
      })
      continue
    }
    try {
      const text = await fileToText(file)
      parts.push({
        type: 'text',
        text: `Soubor „${file.name}“:\n${text.slice(0, 12000)}`,
      })
    } catch {
      parts.push({
        type: 'text',
        text: `Soubor „${file.name}“ (${file.type || 'unknown'}, ${file.size} B) — obsah se nepodařilo přečíst, odhadni dle názvu.`,
      })
    }
  }

  return parts
}

function mergeExtracts(parts: BudgetDocumentExtract[]): BudgetDocumentExtract {
  if (!parts.length) return emptyExtract([], 'simulated')
  const base = { ...parts[0], suppliers: [...parts[0].suppliers], timeline: [...parts[0].timeline], budgetLines: [...parts[0].budgetLines], catering: [...parts[0].catering], fileNames: [...parts[0].fileNames] }
  for (const next of parts.slice(1)) {
    if (next.guests && !base.guests) base.guests = next.guests
    if (next.location && !base.location) base.location = next.location
    if (next.budget && (!base.budget || next.budget > base.budget)) base.budget = next.budget
    if (next.eventType && !base.eventType) base.eventType = next.eventType
    if (next.name && !base.name) base.name = next.name
    base.suppliers.push(...next.suppliers)
    if (next.timeline.length) base.timeline = next.timeline
    if (next.budgetLines.length) {
      const costs = next.budgetLines.filter((l) => l.isCost)
      const revenue = next.budgetLines.filter((l) => !l.isCost)
      const keepRevenue = base.budgetLines.filter((l) => !l.isCost)
      base.budgetLines = [
        ...base.budgetLines.filter((l) => l.isCost),
        ...costs,
        ...(revenue.length ? revenue : keepRevenue),
      ]
    }
    if (next.catering.length) base.catering = [...base.catering, ...next.catering]
    base.fileNames.push(...next.fileNames)
    if (next.source === 'openai') base.source = 'openai'
  }
  base.suppliers = [...new Set(base.suppliers)]
  base.fileNames = [...new Set(base.fileNames)]
  return base
}

/** Parse one or more budget documents / photos into structured EventFlow data. */
export async function parseBudgetDocuments(
  files: File[],
  prompt = '',
): Promise<BudgetDocumentExtract> {
  const valid = files.filter(Boolean)
  if (!valid.length) return emptyExtract([], 'simulated')

  if (hasVenueOpenAiKey()) {
    try {
      const content = await buildUserContentParts(valid, prompt)
      const chat = await openaiChatCompletions({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 3500,
      })
      if (chat.ok) {
        const raw = openAiMessageContent(chat.data)
        if (raw) {
          const parsed = parseExtractJson(
            raw,
            valid.map((f) => f.name),
          )
          if (
            parsed.budgetLines.length ||
            parsed.timeline.length ||
            parsed.catering.length
          ) {
            return parsed
          }
        }
      }
    } catch {
      // safe client-side simulation fallback
    }
  }

  await new Promise((r) => setTimeout(r, 900))
  return mockExtractFromFiles(valid, prompt)
}

export function toTimelineItems(rows: ExtractedTimelineItem[]): TimelineItem[] {
  return rows.map((row, order) => ({
    id: uid('tl'),
    time: row.time,
    title: row.title,
    description: row.description,
    order,
  }))
}

export function toBudgetLines(rows: ExtractedBudgetLine[]): BudgetLine[] {
  return rows.map((row) => ({
    id: uid('bl'),
    category: row.category,
    description: row.description,
    amount: row.amount,
    vatRate: row.vatRate,
    isCost: row.isCost,
  }))
}

export function toCateringItems(rows: ExtractedCateringItem[]): CateringItem[] {
  return rows.map((row) => ({
    id: uid('cat'),
    name: row.name,
    recipe: row.recipe,
    foodCost: row.foodCost,
    portion: row.portion,
    allergens: row.allergens,
    inventory: row.recipe
      ? row.recipe
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [],
    category: row.category,
    subcategory: row.subcategory,
    sellPrice: row.sellPrice || Math.round(row.foodCost / Math.max(1, row.portion) * 1.35),
    vatRate: row.vatRate,
    plannedPortions: row.portion,
    soldPortions: 0,
    ingredients: [],
  }))
}

export function summarizeBudgetExtract(extract: BudgetDocumentExtract): string {
  const files = extract.fileNames.length
    ? extract.fileNames.join(', ')
    : 'bez souboru'
  const mode = extract.source === 'openai' ? 'gpt-4o-mini' : 'simulace'
  return `Podklady (${files}) zpracovány přes ${mode} — ${extract.budgetLines.length} položek rozpočtu, ${extract.timeline.length} milníků, ${extract.catering.length} catering.`
}

export { mergeExtracts }
