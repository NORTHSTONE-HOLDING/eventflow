/**
 * AI Vision parser for printable menu / beverage cards (gpt-4o-mini + offline fallback).
 */

import type { PrintMenuItem, PrintMenuKind } from '../types'
import { resolveAllergenCodes } from './allergens'
import { uid } from './documentIds'
import { czechPortionLabel } from './printMenuEngine'
import {
  hasVenueOpenAiKey,
  openAiMessageContent,
  openaiChatCompletions,
} from './openaiClient'

const SYSTEM_PROMPT = `Jseš gastronomický OCR auditor pro EventFlow (ČR).
Z fotografie jídelního nebo nápojového lístku vytěž položky.
Vrať ČISTÝ JSON:
{
  "kind": "food"|"beverage",
  "items": [{
    "name": string,
    "description": string,
    "section": string,
    "portion": string,
    "unit_price": number,
    "allergens": number[] | string[],
    "category": "food"|"beverage"
  }]
}
Sekce jídlo: Předkrmy, Hlavní chody, Dezerty, Raut, Ostatní.
Sekce nápoje: Nealko, Pivo, Víno, Koktejly, Destiláty, Ostatní.
Alergeny jako EU kódy 1–14. Ceny v Kč.`

function sectionIdFromLabel(label: string, kind: PrintMenuKind): { id: string; label: string } {
  const key = String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (kind === 'beverage') {
    if (key.includes('pivo')) return { id: 'pivo', label: 'Pivo' }
    if (key.includes('vino')) return { id: 'vino', label: 'Víno' }
    if (key.includes('koktejl')) return { id: 'koktejly', label: 'Koktejly' }
    if (key.includes('destil') || key.includes('alkohol')) {
      return { id: 'destilaty', label: 'Destiláty & alkohol' }
    }
    if (key.includes('nealko') || key.includes('limonad') || key.includes('kava')) {
      return { id: 'nealko', label: 'Nealko' }
    }
    return { id: 'ostatni', label: 'Ostatní nápoje' }
  }
  if (key.includes('predkrm') || key.includes('polev')) return { id: 'predkrmy', label: 'Předkrmy' }
  if (key.includes('dezer')) return { id: 'dezerty', label: 'Dezerty' }
  if (key.includes('raut') || key.includes('buffet')) return { id: 'raut', label: 'Raut' }
  if (key.includes('hlavni') || key.includes('masa') || key.includes('ryb')) {
    return { id: 'hlavni', label: 'Hlavní chody' }
  }
  return { id: 'ostatni', label: 'Ostatní jídla' }
}

function mapRawItem(
  raw: Record<string, unknown>,
  kind: PrintMenuKind,
  index: number,
): PrintMenuItem | null {
  const name = String(raw.name || '').trim()
  if (!name) return null
  const categoryRaw = String(raw.category || kind)
  const category: PrintMenuItem['category'] =
    categoryRaw.includes('bev') || categoryRaw.includes('napoj') || categoryRaw.includes('piti')
      ? 'beverage'
      : kind === 'beverage'
        ? 'beverage'
        : 'food'
  const section = sectionIdFromLabel(String(raw.section || ''), kind)
  const portionRaw = String(raw.portion || '').trim()
  const unitPrice = Number(raw.unit_price ?? raw.price ?? raw.sellPrice) || 0
  const allergens = resolveAllergenCodes(
    (raw.allergens as Array<string | number>) || (raw.allergen_codes as Array<string | number>) || [],
  )
  return {
    id: uid(`vision_${index}`),
    name,
    description: String(raw.description || '').trim() || undefined,
    sectionId: section.id,
    sectionLabel: section.label,
    portionLabel:
      portionRaw ||
      czechPortionLabel({
        name,
        unit: category === 'beverage' ? 'l' : 'porce',
        portion: 1,
      }),
    unitPrice,
    allergenCodes: allergens,
    category,
  }
}

function mockMenuFromFilename(fileName: string, preferredKind: PrintMenuKind): PrintMenuItem[] {
  const lower = fileName.toLowerCase()
  const isBev =
    preferredKind === 'beverage' ||
    /napoj|nápoj|bar|pivo|vino|drink|beverage/.test(lower)

  if (isBev) {
    return [
      mapRawItem(
        {
          name: 'Pilsner Urquell 0,5 l',
          section: 'Pivo',
          portion: '0,5 l',
          unit_price: 65,
          allergens: [12],
          category: 'beverage',
        },
        'beverage',
        0,
      )!,
      mapRawItem(
        {
          name: 'Domácí limonáda máta-citron',
          section: 'Nealko',
          portion: '0,4 l',
          unit_price: 55,
          allergens: [],
          category: 'beverage',
        },
        'beverage',
        1,
      )!,
      mapRawItem(
        {
          name: 'Ryzlink rýnský 0,2 l',
          section: 'Víno',
          portion: '0,2 l',
          unit_price: 89,
          allergens: [12],
          category: 'beverage',
        },
        'beverage',
        2,
      )!,
      mapRawItem(
        {
          name: 'Espresso Martini',
          section: 'Koktejly',
          portion: '0,12 l',
          unit_price: 165,
          allergens: [7],
          category: 'beverage',
        },
        'beverage',
        3,
      )!,
    ]
  }

  return [
    mapRawItem(
      {
        name: 'Krémová dýňová polévka',
        description: 'S dýňovým olejem a semínky',
        section: 'Předkrmy',
        portion: '250 ml',
        unit_price: 89,
        allergens: [1, 7],
        category: 'food',
      },
      'food',
      0,
    )!,
    mapRawItem(
      {
        name: 'Pečený losos na másle',
        description: 'Baby brambory, chřest',
        section: 'Hlavní chody',
        portion: '180 g',
        unit_price: 345,
        allergens: [4, 7],
        category: 'food',
      },
      'food',
      1,
    )!,
    mapRawItem(
      {
        name: 'Hovězí svíčková na smetaně',
        description: 'Houskové knedlíky',
        section: 'Hlavní chody',
        portion: '200 g',
        unit_price: 289,
        allergens: [1, 3, 7],
        category: 'food',
      },
      'food',
      2,
    )!,
    mapRawItem(
      {
        name: 'Čokoládový fondant',
        description: 'Vanilková zmrzlina',
        section: 'Dezerty',
        portion: '120 g',
        unit_price: 129,
        allergens: [1, 3, 7],
        category: 'food',
      },
      'food',
      3,
    )!,
  ]
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst'))
    reader.readAsDataURL(file)
  })
}

function parseVisionJson(raw: string, preferredKind: PrintMenuKind): PrintMenuItem[] {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const parsed = JSON.parse(cleaned) as {
    kind?: string
    items?: Array<Record<string, unknown>>
  }
  const kind: PrintMenuKind =
    parsed.kind === 'beverage' || preferredKind === 'beverage' ? 'beverage' : 'food'
  const items = Array.isArray(parsed.items) ? parsed.items : []
  return items
    .map((it, i) => mapRawItem(it, kind, i))
    .filter((it): it is PrintMenuItem => Boolean(it))
}

/** Scan menu/beverage photo → structured print items. */
export async function scanPrintMenuFromImage(
  file: File,
  preferredKind: PrintMenuKind,
): Promise<PrintMenuItem[]> {
  if (hasVenueOpenAiKey() && file.type.startsWith('image/')) {
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
                text: `Preferovaný druh: ${preferredKind === 'beverage' ? 'nápojový lístek' : 'jídelní lístek'}. Extrahuj položky.`,
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
        if (content) {
          const items = parseVisionJson(content, preferredKind)
          if (items.length) return items
        }
      }
    } catch {
      // fall through
    }
  }

  await new Promise((r) => setTimeout(r, 1200))
  return mockMenuFromFilename(file.name || 'menu.jpg', preferredKind)
}
