/**
 * Polední menu AI pipeline — temporary POS tiles with recipe-linked raw deductions.
 * Valid for the local calendar day; cleared after midnight.
 */

import type { InventoryItem, RecipeIngredient } from '../types'
import { formatCzechDate } from './czechDate'
import { matchInventoryItem, normalizeName, normalizeUnit } from './inventoryModels'
import { uid } from './documentIds'
import {
  hasVenueOpenAiKey,
  openAiMessageContent,
  openaiChatCompletions,
} from './openaiClient'

export type DailySpecial = {
  id: string
  name: string
  sellPrice: number
  vatRate: number
  subcategory: string
  foodCost: number
  plannedPortions: number
  soldPortions: number
  ingredients: RecipeIngredient[]
  recipeNote: string
  sourceText: string
  validDate: string
  createdAt: string
  image_url?: string | null
}

export type DailySpecialParseResult = {
  ok: boolean
  special?: DailySpecial
  message: string
  source: 'openai' | 'simulated'
}

/** Local calendar day YYYY-MM-DD (Europe/Prague-ish via browser local zone). */
export function localCalendarDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isSpecialActiveToday(special: DailySpecial, now = new Date()): boolean {
  return special.validDate === localCalendarDate(now)
}

type IngredientGuess = {
  tokens: RegExp
  ingredientName: string
  qtyKg: number
  altNames: string[]
}

const INGREDIENT_GUESSES: IngredientGuess[] = [
  {
    tokens: /hovez|hověz|gulas|guláš|svickov|svíčkov/,
    ingredientName: 'Hovězí maso',
    qtyKg: 0.15,
    altNames: ['hovezi', 'hovězí', 'hovězí zadní', 'hovězí maso'],
  },
  {
    tokens: /kure|kuř|steak|prsa/,
    ingredientName: 'Kuřecí prsa',
    qtyKg: 0.18,
    altNames: ['kuřecí prsa', 'kureci prsa', 'kuře'],
  },
  {
    tokens: /vepr|vepř|kotlet|krkov/,
    ingredientName: 'Vepřové maso',
    qtyKg: 0.16,
    altNames: ['vepřové', 'veprove', 'vepřová krkovice'],
  },
  {
    tokens: /losos|ryb/,
    ingredientName: 'Losos',
    qtyKg: 0.16,
    altNames: ['losos', 'rybí filé'],
  },
  {
    tokens: /hranol|brambor|kroket/,
    ingredientName: 'Hranolky',
    qtyKg: 0.15,
    altNames: ['hranolky', 'brambory'],
  },
  {
    tokens: /rizek|řízek|schnitzel/,
    ingredientName: 'Vepřové maso',
    qtyKg: 0.14,
    altNames: ['vepřové', 'veprove'],
  },
]

function parsePriceCzk(text: string): number | null {
  const m =
    text.match(/(?:za|=|:)?\s*(\d+[.,]?\d*)\s*(?:k[cč]|czk|,-)?/i) ||
    text.match(/(\d+[.,]?\d*)\s*(?:k[cč]|czk)/i)
  if (!m) return null
  const n = Number(String(m[1]).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function stripPriceFromName(text: string): string {
  return text
    .replace(/\s*(?:za|=)\s*\d+[.,]?\d*\s*(?:k[cč]|czk|,-)?/gi, '')
    .replace(/\s*\d+[.,]?\d*\s*(?:k[cč]|czk)\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function guessIngredients(
  dishName: string,
  inventory: InventoryItem[],
): RecipeIngredient[] {
  const blob = normalizeName(dishName)
  const out: RecipeIngredient[] = []
  const used = new Set<string>()

  for (const guess of INGREDIENT_GUESSES) {
    if (!guess.tokens.test(blob)) continue
    let matched =
      matchInventoryItem(inventory, { name: guess.ingredientName, unit: 'kg' }) ||
      inventory.find((i) =>
        guess.altNames.some((a) => normalizeName(i.name).includes(normalizeName(a))),
      )
    if (!matched && /hranol|brambor/.test(blob)) {
      matched = inventory.find((i) => /hranol|brambor/.test(normalizeName(i.name)))
    }
    const key = matched?.id || guess.ingredientName
    if (used.has(key)) continue
    used.add(key)
    out.push({
      name: matched?.name || guess.ingredientName,
      qtyPerPortion: guess.qtyKg,
      unit: matched ? normalizeUnit(matched.unit) : 'kg',
      inventoryItemId: matched?.id,
    })
  }

  // Side of fries if meat dish and fries stock exists
  if (out.length && !out.some((i) => /hranol|brambor/.test(normalizeName(i.name)))) {
    const fries = inventory.find((i) => /hranol/.test(normalizeName(i.name)))
    if (fries && /steak|gulas|guláš|rizek|řízek|kure|kuř|hovez|hověz|vepr/.test(blob)) {
      out.push({
        name: fries.name,
        qtyPerPortion: 0.15,
        unit: normalizeUnit(fries.unit),
        inventoryItemId: fries.id,
      })
    }
  }

  if (!out.length) {
    // Generic kitchen raw guess — 0.15 kg of closest food raw
    const raw = inventory.find(
      (i) => i.is_raw_material && (i.unit === 'kg' || i.unit === 'g'),
    )
    if (raw) {
      out.push({
        name: raw.name,
        qtyPerPortion: raw.unit === 'g' ? 150 : 0.15,
        unit: normalizeUnit(raw.unit),
        inventoryItemId: raw.id,
      })
    }
  }

  return out
}

export function parseDailySpecialLocal(
  text: string,
  inventory: InventoryItem[],
): DailySpecialParseResult {
  const raw = text.trim()
  if (!raw) {
    return {
      ok: false,
      message: 'Zadejte text poledního menu, např. „Hovězí guláš za 165 Kč“',
      source: 'simulated',
    }
  }

  const price = parsePriceCzk(raw) ?? 165
  const name = stripPriceFromName(raw) || raw
  const ingredients = guessIngredients(name, inventory)
  const foodCost = ingredients.reduce((sum, ing) => {
    const inv = ing.inventoryItemId
      ? inventory.find((i) => i.id === ing.inventoryItemId)
      : matchInventoryItem(inventory, { name: ing.name, unit: ing.unit })
    const unitPrice = inv?.average_price || inv?.purchase_price || 0
    const qty =
      normalizeUnit(ing.unit) === 'g' ? ing.qtyPerPortion / 1000 : ing.qtyPerPortion
    return sum + qty * unitPrice
  }, 0)

  const special: DailySpecial = {
    id: uid('lunch'),
    name,
    sellPrice: price,
    vatRate: 12,
    subcategory: 'hlavni',
    foodCost: Math.round(foodCost * 100) / 100,
    plannedPortions: 40,
    soldPortions: 0,
    ingredients,
    recipeNote:
      ingredients.length > 0
        ? `Auto-receptura: ${ingredients
            .map((i) => `${i.qtyPerPortion} ${i.unit} ${i.name}`)
            .join(' · ')}`
        : 'Polední menu bez napárované suroviny — doplňte recepturu ve skladu',
    sourceText: raw,
    validDate: localCalendarDate(),
    createdAt: new Date().toISOString(),
  }

  return {
    ok: true,
    special,
    message: `Polední menu „${name}“ za ${price} Kč · DPH 12 % · platné do půlnoci (${formatCzechDate(special.validDate)})`,
    source: 'simulated',
  }
}

async function parseDailySpecialOpenAi(
  text: string,
  inventory: InventoryItem[],
): Promise<DailySpecialParseResult | null> {
  if (!hasVenueOpenAiKey()) return null
  try {
    const slim = inventory
      .filter((i) => i.is_raw_material)
      .slice(0, 60)
      .map((i) => ({ id: i.id, name: i.name, unit: i.unit }))
    const chat = await openaiChatCompletions({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Jsi EventFlow kuchyňský asistent. Z českého textu poledního menu vytěž JSON { "name", "sellPrice", "ingredients": [ { "name", "qtyPerPortion", "unit", "inventoryItemId?" } ] }. DPH je vždy 12. Množství surovin v kg/g (např. 0.150 kg hovězího). Napáruj inventoryItemId ze seznamu surovin pokud sedí. Bez okolního textu.',
        },
        {
          role: 'user',
          content: `Text: ${text}\nSuroviny skladu:\n${JSON.stringify(slim)}`,
        },
      ],
    })
    if (!chat.ok) return null
    const content = openAiMessageContent(chat.data)
    if (!content) return null
    const parsed = JSON.parse(content) as {
      name?: string
      sellPrice?: number
      ingredients?: Array<{
        name?: string
        qtyPerPortion?: number
        unit?: string
        inventoryItemId?: string
      }>
    }
    const name = String(parsed.name || stripPriceFromName(text) || text).trim()
    const sellPrice = Number(parsed.sellPrice) || parsePriceCzk(text) || 165
    let ingredients: RecipeIngredient[] = Array.isArray(parsed.ingredients)
      ? parsed.ingredients
          .filter((i) => i?.name)
          .map((i) => ({
            name: String(i.name),
            qtyPerPortion: Number(i.qtyPerPortion) || 0.15,
            unit: normalizeUnit(i.unit || 'kg'),
            inventoryItemId: i.inventoryItemId,
          }))
      : []
    if (!ingredients.length) ingredients = guessIngredients(name, inventory)

    const special: DailySpecial = {
      id: uid('lunch'),
      name,
      sellPrice,
      vatRate: 12,
      subcategory: 'hlavni',
      foodCost: 0,
      plannedPortions: 40,
      soldPortions: 0,
      ingredients,
      recipeNote: `AI receptura · ${ingredients.map((i) => `${i.qtyPerPortion}${i.unit} ${i.name}`).join(' · ')}`,
      sourceText: text,
      validDate: localCalendarDate(),
      createdAt: new Date().toISOString(),
    }

    return {
      ok: true,
      special,
      message: `AI polední menu „${name}“ za ${sellPrice} Kč · DPH 12 %`,
      source: 'openai',
    }
  } catch {
    return null
  }
}

export async function parseDailySpecialText(
  text: string,
  inventory: InventoryItem[],
): Promise<DailySpecialParseResult> {
  const ai = await parseDailySpecialOpenAi(text, inventory)
  if (ai?.ok) return ai
  return parseDailySpecialLocal(text, inventory)
}
