import type { AiScanConfidence, InvoiceVisionLine, InvoiceVisionResult } from '../types'
import { formatCzechDate } from './czechDate'
import { classifyCategory, classifySubcategoryLabel } from './gastroImporter'
import { normalizeName } from './inventoryModels'
import {
  hasVenueOpenAiKey,
  openAiMessageContent,
  openaiChatCompletions,
} from './openaiClient'

const SYSTEM_PROMPT = `Jseš pokročilý skladový AI auditor pro EventFlow. Analyzuj vyfocenou českou nákupní fakturu, dodací list, účtenku nebo ruční jídelní lístek.
Extrahuj: Název dodavatele, datum, IČO a kompletní seznam položek.
U každé položky urči: Název zboží, množství, jednotku (ks, kg, l), nákupní cenu bez DPH, navrhovanou prodejní cenu, sazbu DPH (21%, 12%, 0%), kategorii (Jídlo|Pití|Inventář|Technika), českou podkategorii a confidence_score (0-100).
confidence_score < 70 = nejisté / rukopis / rozmazané. Vrať pouze čistá JSON strukturovaná data.`

function withConfidence(
  line: Omit<InvoiceVisionLine, 'confidence' | 'confidence_score'> &
    Partial<Pick<InvoiceVisionLine, 'confidence' | 'confidence_score'>>,
  index: number,
  handwrittenHint: boolean,
): InvoiceVisionLine {
  let score =
    line.confidence_score != null
      ? Number(line.confidence_score)
      : handwrittenHint
        ? 55 + (index % 20)
        : 88 - (index % 12)
  if (!Number.isFinite(score)) score = handwrittenHint ? 60 : 90
  score = Math.max(0, Math.min(100, Math.round(score)))
  const confidence: AiScanConfidence =
    line.confidence || (score < 70 ? 'low' : 'high')
  const category =
    line.category ||
    classifyCategory(line.name, '')
  const subcategory =
    line.subcategory ||
    classifySubcategoryLabel(line.name, category)
  const purchase = Number(line.purchase_price_ex_vat) || 0
  const sale =
    line.sale_price != null && Number(line.sale_price) > 0
      ? Number(line.sale_price)
      : purchase > 0
        ? Math.round(purchase * 1.8 * 100) / 100
        : 0
  return {
    ...line,
    category,
    subcategory,
    sale_price: sale,
    confidence,
    confidence_score: score,
  }
}

function mockInvoiceFromFilename(fileName: string): InvoiceVisionResult {
  const lower = fileName.toLowerCase()
  const isBeverage = /pivo|vino|bar|nápoj|napoj|cola/.test(lower)
  const handwritten = /rucni|ruční|hand|menu|listek|lístek|handwritten/.test(lower)
  const today = formatCzechDate(new Date())

  if (isBeverage) {
    const raw: InvoiceVisionLine[] = [
      {
        name: 'Pivo ležák 12°',
        quantity: 24,
        unit: 'ks',
        purchase_price_ex_vat: 22,
        vat_rate: 21,
        barcode: '8594001100028',
        category: 'Pití',
        subcategory: 'Pivo',
      },
      {
        name: 'Nealko Cola 0.33',
        quantity: 48,
        unit: 'ks',
        purchase_price_ex_vat: 11.5,
        vat_rate: 21,
        barcode: '8594001100066',
        category: 'Pití',
        subcategory: 'Nealko',
      },
      {
        name: 'Prosecco Extra Dry',
        quantity: 12,
        unit: 'ks',
        purchase_price_ex_vat: 179,
        vat_rate: 21,
        barcode: '8594001100011',
        category: 'Pití',
        subcategory: 'Víno',
        confidence_score: handwritten ? 58 : 92,
      },
    ]
    return {
      supplier_name: 'Nápoje Velkoobchod s.r.o.',
      date: today,
      ico: '27584321',
      source_kind: handwritten ? 'menu' : 'invoice',
      items: raw.map((l, i) => withConfidence(l, i, handwritten)),
    }
  }

  const raw: InvoiceVisionLine[] = [
    {
      name: 'Losos filet',
      quantity: 3.2,
      unit: 'kg',
      purchase_price_ex_vat: 410,
      vat_rate: 12,
      barcode: '8594001100035',
      category: 'Jídlo',
      subcategory: 'Hlavní chody',
    },
    {
      name: 'Hovězí svíčková',
      quantity: 5,
      unit: 'kg',
      purchase_price_ex_vat: 375,
      vat_rate: 12,
      barcode: '8594001100042',
      category: 'Jídlo',
      subcategory: 'Hlavní chody',
      confidence_score: handwritten ? 52 : 91,
    },
    {
      name: 'Olivový olej Extra Virgin',
      quantity: 2,
      unit: 'l',
      purchase_price_ex_vat: 205,
      vat_rate: 12,
      barcode: '8594001100080',
      category: 'Jídlo',
      subcategory: 'Ostatní',
    },
    {
      name: 'Bazalka čerstvá',
      quantity: 10,
      unit: 'ks',
      purchase_price_ex_vat: 18,
      vat_rate: 12,
      barcode: null,
      category: 'Jídlo',
      subcategory: 'Ostatní',
      confidence_score: handwritten ? 48 : 78,
    },
  ]
  return {
    supplier_name: 'Gastro Supply Praha a.s.',
    date: today,
    ico: '26123456',
    source_kind: handwritten ? 'menu' : 'invoice',
    items: raw.map((l, i) => withConfidence(l, i, handwritten)),
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst'))
    reader.readAsDataURL(file)
  })
}

function parseVisionJson(raw: string, handwrittenHint: boolean): InvoiceVisionResult {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const parsed = JSON.parse(cleaned) as Partial<InvoiceVisionResult> & {
    items?: Array<Partial<InvoiceVisionLine>>
  }
  const items = Array.isArray(parsed.items) ? parsed.items : []
  return {
    supplier_name: String(parsed.supplier_name || 'Neznámý dodavatel'),
    date: String(parsed.date || formatCzechDate(new Date())),
    ico: String(parsed.ico || '—'),
    source_kind: parsed.source_kind || 'invoice',
    items: items
      .map((it, index) => {
        const name = String(it.name || '').trim()
        if (!name) return null
        const quantity = Number(it.quantity) || 0
        if (quantity <= 0) return null
        return withConfidence(
          {
            name,
            quantity,
            unit: String(it.unit || 'ks'),
            purchase_price_ex_vat: Number(it.purchase_price_ex_vat) || 0,
            sale_price: it.sale_price != null ? Number(it.sale_price) : undefined,
            vat_rate: Number(it.vat_rate) || 12,
            barcode: it.barcode ?? null,
            category: it.category ? String(it.category) : undefined,
            subcategory: it.subcategory ? String(it.subcategory) : undefined,
            confidence: it.confidence,
            confidence_score: it.confidence_score,
          },
          index,
          handwrittenHint ||
            normalizeName(name).length < 3 ||
            Number(it.confidence_score) < 70,
        )
      })
      .filter((it): it is InvoiceVisionLine => Boolean(it)),
  }
}

/** AI Vision capture of Czech delivery notes / invoices / menus. Falls back to simulation. */
export async function analyzeInvoiceImage(file: File): Promise<InvoiceVisionResult> {
  const handwrittenHint = /rucni|ruční|hand|menu|listek|lístek|handwritten/i.test(
    file.name || '',
  )

  if (hasVenueOpenAiKey()) {
    try {
      const dataUrl = await fileToDataUrl(file)
      const chat = await openaiChatCompletions({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrahuj data. JSON: { supplier_name, date, ico, source_kind, items:[{name, quantity, unit, purchase_price_ex_vat, sale_price, vat_rate, barcode, category, subcategory, confidence_score}] }.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2500,
      })
      if (chat.ok) {
        const content = openAiMessageContent(chat.data)
        if (content) return parseVisionJson(content, handwrittenHint)
      }
    } catch {
      // fall through to simulation
    }
  }

  await new Promise((r) => setTimeout(r, 1400))
  return mockInvoiceFromFilename(file.name || 'faktura.jpg')
}

export { SYSTEM_PROMPT as INVOICE_VISION_SYSTEM_PROMPT }
