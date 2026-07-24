/**
 * AI Skladový Asistent — natural-language batch edits over inventory rows.
 * OpenAI when keyed; otherwise deterministic Czech command parser.
 */

import type { InventoryItem } from '../types'
import { normalizeName } from './inventoryModels'

export type AiCopilotResult = {
  ok: boolean
  updated: InventoryItem[]
  changedCount: number
  message: string
  source: 'openai' | 'simulated'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function matchCategoryFilter(item: InventoryItem, token: string): boolean {
  const t = normalizeName(token)
  const blob = normalizeName(`${item.category} ${item.subcategory} ${item.name} ${item.warehouse_section}`)
  if (t.includes('piti') || t.includes('napoj') || t.includes('bar') || t.includes('drink')) {
    return item.category === 'beverage' || /pivo|vino|rum|vodka|cola|prosecco|gin|whisky/.test(blob)
  }
  if (t.includes('jidlo') || t.includes('food') || t.includes('kuchy')) {
    return item.category === 'raw' || item.category === 'food'
  }
  if (t.includes('inventar')) return item.category === 'package'
  if (t.includes('vino')) return /vino|víno|prosecco|sekt/.test(blob)
  if (t.includes('koktejl') || t.includes('cocktail')) return /rum|gin|vodka|whisky|limet|mata|mint|prosecco/.test(blob)
  if (t.length >= 3) return blob.includes(t)
  return true
}

function luxuryRename(name: string): string {
  const n = name.trim()
  if (/mojito/i.test(n)) return 'Signature Mojito · čerstvá máta & cubano'
  if (/prosecco/i.test(n)) return 'Prosecco Extra Dry · elegantní přípitek'
  if (/cola/i.test(n)) return 'Cola craft serve'
  if (/pivo/i.test(n)) return `${n} · točený ležák`
  if (/hověz|steak|svíčk/i.test(n)) return `${n} · prémiový výběr`
  if (/losos/i.test(n)) return `${n} · atlantic selection`
  if (!/·|signature|premium|lux/i.test(n)) return `${n} · maison selection`
  return n
}

function glutenHighlight(name: string): string {
  if (/bezlep|gluten/i.test(name)) return name
  if (/mouka|chleb|těsto|testo|knedl|palačink/i.test(name)) {
    return `${name} (obsahuje lepek)`
  }
  if (/ryze|brambor|maso|ryba|losos|salat|salát/.test(normalizeName(name))) {
    return `${name} · vhodné pro bezlepkový servis`
  }
  return name
}

/** Deterministic Czech command engine */
export function applyInventoryCommandLocal(
  items: InventoryItem[],
  command: string,
): AiCopilotResult {
  const cmd = command.trim()
  if (!cmd) {
    return {
      ok: false,
      updated: items,
      changedCount: 0,
      message: 'Zadejte příkaz pro AI',
      source: 'simulated',
    }
  }
  const lower = cmd.toLowerCase()
  let next = items.map((i) => ({ ...i }))
  let changed = 0

  // Financial: raise/lower sale or purchase price
  const priceMatch = lower.match(
    /(zvedni|zvys|zvýš|zvysit|zvyš|pridej|přidej|sniz|sniž|snizit|snížit)\s+(prodejni|prodejní|nakupni|nákupní)?\s*cen[yu]?\s*(?:u\s+kategorie\s+)?([a-záčďéěíňóřšťúůýž\s]+?)?\s*o\s+(\d+[.,]?\d*)\s*%/i,
  )
  if (priceMatch) {
    const dir = priceMatch[1]
    const kind = priceMatch[2] || 'prodejní'
    const cat = (priceMatch[3] || '').trim()
    const pct = Number(priceMatch[4].replace(',', '.')) / 100
    const up = /zved|zvys|zvýš|prid|přid/i.test(dir)
    next = next.map((item) => {
      if (cat && !matchCategoryFilter(item, cat)) return item
      const factor = up ? 1 + pct : Math.max(0, 1 - pct)
      changed += 1
      if (/nakup|nákup/i.test(kind)) {
        const purchase = round2(item.purchase_price * factor)
        return {
          ...item,
          purchase_price: purchase,
          average_price: round2(item.average_price * factor),
          updated_at: new Date().toISOString(),
        }
      }
      const sale = round2((item.sale_price || item.purchase_price * 1.8) * factor)
      return { ...item, sale_price: sale, updated_at: new Date().toISOString() }
    })
    return {
      ok: true,
      updated: next,
      changedCount: changed,
      message: `✨ AI úspěšně upravila ${changed} položek na základě vašeho příkazu.`,
      source: 'simulated',
    }
  }

  // Minimum stock
  const minMatch = lower.match(
    /(zvys|zvýš|zvedni|sniz|sniž).*minim.*o\s+(\d+[.,]?\d*)\s*%/i,
  )
  if (minMatch) {
    const up = /zvys|zvýš|zved/i.test(minMatch[1])
    const pct = Number(minMatch[2].replace(',', '.')) / 100
    next = next.map((item) => {
      changed += 1
      const factor = up ? 1 + pct : Math.max(0, 1 - pct)
      return {
        ...item,
        minimum_quantity: round2(Math.max(0, item.minimum_quantity * factor)),
        updated_at: new Date().toISOString(),
      }
    })
    return {
      ok: true,
      updated: next,
      changedCount: changed,
      message: `✨ AI úspěšně upravila ${changed} položek na základě vašeho příkazu.`,
      source: 'simulated',
    }
  }

  // Luxury rename
  if (/prepis|přepiš|luxus|svatb|atraktiv|elegant|signature|koktejl/.test(lower)) {
    next = next.map((item) => {
      if (/koktejl|cocktail|vino|víno|bar|piti|pití/.test(lower) && !matchCategoryFilter(item, 'pití') && !matchCategoryFilter(item, 'koktejl')) {
        return item
      }
      if (/jidel|jídel|jidlo|jídlo/.test(lower) && !matchCategoryFilter(item, 'jidlo')) {
        return item
      }
      const neu = luxuryRename(item.name)
      if (neu === item.name) return item
      changed += 1
      return { ...item, name: neu, updated_at: new Date().toISOString() }
    })
    return {
      ok: true,
      updated: next,
      changedCount: changed,
      message: `✨ AI úspěšně upravila ${changed} položek na základě vašeho příkazu.`,
      source: 'simulated',
    }
  }

  // Gluten highlight
  if (/bezlep|gluten|lepku/.test(lower)) {
    next = next.map((item) => {
      const neu = glutenHighlight(item.name)
      if (neu === item.name) return item
      changed += 1
      return { ...item, name: neu, updated_at: new Date().toISOString() }
    })
    return {
      ok: true,
      updated: next,
      changedCount: changed,
      message: `✨ AI úspěšně upravila ${changed} položek na základě vašeho příkazu.`,
      source: 'simulated',
    }
  }

  // Generic: raise all sale prices 10% if "cena" mentioned
  if (/cen/.test(lower) && /(\d+[.,]?\d*)\s*%/.test(lower)) {
    const pctRaw = lower.match(/(\d+[.,]?\d*)\s*%/)
    const pct = pctRaw ? Number(pctRaw[1].replace(',', '.')) / 100 : 0.1
    const up = !/sniz|sniž|minus|down/.test(lower)
    next = next.map((item) => {
      changed += 1
      const factor = up ? 1 + pct : Math.max(0, 1 - pct)
      return {
        ...item,
        sale_price: round2((item.sale_price || item.purchase_price * 1.8) * factor),
        updated_at: new Date().toISOString(),
      }
    })
    return {
      ok: true,
      updated: next,
      changedCount: changed,
      message: `✨ AI úspěšně upravila ${changed} položek na základě vašeho příkazu.`,
      source: 'simulated',
    }
  }

  return {
    ok: false,
    updated: items,
    changedCount: 0,
    message:
      'Příkaz nerozpoznán. Zkuste např. „Zvedni prodejní cenu u kategorie Pití o 10%“ nebo „Přepiš názvy koktejlů do luxusního stylu“.',
    source: 'simulated',
  }
}

async function openaiInventoryCommand(
  items: InventoryItem[],
  command: string,
): Promise<AiCopilotResult | null> {
  const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()
  if (!key) return null
  try {
    const slim = items.slice(0, 80).map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      sale_price: i.sale_price,
      purchase_price: i.purchase_price,
      minimum_quantity: i.minimum_quantity,
      current_quantity: i.current_quantity,
      unit: i.unit,
      vat_rate: i.vat_rate,
    }))
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Jsi AI skladový asistent EventFlow. Uprav položky dle českého příkazu. Vrať JSON { "updates": [ { "id", "name?", "sale_price?", "purchase_price?", "minimum_quantity?", "vat_rate?" } ], "summary": "..." }. Měň jen relevantní řádky.',
          },
          {
            role: 'user',
            content: `Příkaz: ${command}\n\nPoložky:\n${JSON.stringify(slim)}`,
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
    const parsed = JSON.parse(content) as {
      updates?: Array<Partial<InventoryItem> & { id: string }>
      summary?: string
    }
    if (!Array.isArray(parsed.updates)) return null
    const map = new Map(parsed.updates.map((u) => [u.id, u]))
    let changedCount = 0
    const updated = items.map((item) => {
      const patch = map.get(item.id)
      if (!patch) return item
      changedCount += 1
      return {
        ...item,
        name: patch.name ?? item.name,
        sale_price:
          patch.sale_price != null ? Number(patch.sale_price) : item.sale_price,
        purchase_price:
          patch.purchase_price != null
            ? Number(patch.purchase_price)
            : item.purchase_price,
        minimum_quantity:
          patch.minimum_quantity != null
            ? Number(patch.minimum_quantity)
            : item.minimum_quantity,
        vat_rate: patch.vat_rate != null ? Number(patch.vat_rate) : item.vat_rate,
        updated_at: new Date().toISOString(),
      }
    })
    return {
      ok: true,
      updated,
      changedCount,
      message:
        parsed.summary ||
        `✨ AI úspěšně upravila ${changedCount} položek na základě vašeho příkazu.`,
      source: 'openai',
    }
  } catch {
    return null
  }
}

export async function runInventoryAiCommand(
  items: InventoryItem[],
  command: string,
): Promise<AiCopilotResult> {
  const ai = await openaiInventoryCommand(items, command)
  if (ai) return ai
  return applyInventoryCommandLocal(items, command)
}
