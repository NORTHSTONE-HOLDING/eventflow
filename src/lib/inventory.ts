import type { InventoryCategory, InventoryItem, StockUnit, Station } from './types'
import { uid } from './format'

export const INVENTORY_TABS: { id: 'vse' | InventoryCategory; label: string }[] = [
  { id: 'vse', label: 'Vše' },
  { id: 'jidlo', label: 'Jídlo' },
  { id: 'piti', label: 'Pití' },
  { id: 'inventar', label: 'Inventář' },
  { id: 'technika', label: 'Technika' },
]

export const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  jidlo: 'Jídlo',
  piti: 'Pití',
  inventar: 'Inventář',
  technika: 'Technika',
}

export function unitLabel(unit: StockUnit): string {
  return unit === 'l' ? 'l' : unit === 'kg' ? 'kg' : 'ks'
}

// EAN-13 with valid check digit.
export function generateEan(): string {
  let base = ''
  for (let i = 0; i < 12; i++) base += Math.floor(Math.random() * 10)
  const sum = base
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  const check = (10 - (sum % 10)) % 10
  return base + String(check)
}

function item(
  name: string,
  category: InventoryCategory,
  subcategory: string,
  opts: Partial<InventoryItem> & {
    sellPrice: number
    unit: StockUnit
    stockQty: number
    servingSize: number
    servingLabel: string
    station: Station
    photo: string
  },
): InventoryItem {
  return {
    id: uid('inv'),
    name,
    category,
    subcategory,
    ean: generateEan(),
    minQty: opts.minQty ?? 0,
    purchasePrice: opts.purchasePrice ?? Math.round(opts.sellPrice * 0.38),
    vatRate: opts.vatRate ?? (category === 'jidlo' ? 12 : 21),
    isPosVisible: opts.isPosVisible ?? true,
    ...opts,
  }
}

// Seed catalog: sellable POS items carry a serving size that deducts raw stock
// by fractional decimals; bulk / raw goods default to hidden (is_pos_visible=false).
export function seedInventory(): InventoryItem[] {
  return [
    // JÍDLO — Předkrmy
    item('Hovězí tatarák', 'jidlo', 'Předkrmy', { sellPrice: 245, unit: 'kg', stockQty: 6, minQty: 1.5, servingSize: 0.16, servingLabel: '160 g', station: 'kitchen', photo: '🥩' }),
    item('Carpaccio z lososa', 'jidlo', 'Předkrmy', { sellPrice: 219, unit: 'kg', stockQty: 4, minQty: 1, servingSize: 0.12, servingLabel: '120 g', station: 'kitchen', photo: '🐟' }),
    item('Bruschetta trio', 'jidlo', 'Předkrmy', { sellPrice: 165, unit: 'ks', stockQty: 30, minQty: 8, servingSize: 1, servingLabel: '1 porce', station: 'kitchen', photo: '🍅' }),
    // JÍDLO — Hlavní chody
    item('Svíčková na smetaně', 'jidlo', 'Hlavní chody', { sellPrice: 289, unit: 'kg', stockQty: 14, minQty: 3, servingSize: 0.18, servingLabel: '180 g', station: 'kitchen', photo: '🍖' }),
    item('Vídeňský řízek', 'jidlo', 'Hlavní chody', { sellPrice: 265, unit: 'kg', stockQty: 12, minQty: 3, servingSize: 0.2, servingLabel: '200 g', station: 'kitchen', photo: '🍗' }),
    item('Rib-eye steak 300g', 'jidlo', 'Hlavní chody', { sellPrice: 549, unit: 'kg', stockQty: 9, minQty: 2, servingSize: 0.3, servingLabel: '300 g', station: 'kitchen', photo: '🥩' }),
    item('Houbové rizoto', 'jidlo', 'Hlavní chody', { sellPrice: 219, unit: 'ks', stockQty: 25, minQty: 6, servingSize: 1, servingLabel: '1 porce', station: 'kitchen', photo: '🍚' }),
    item('EventFlow Burger', 'jidlo', 'Hlavní chody', { sellPrice: 245, unit: 'ks', stockQty: 20, minQty: 6, servingSize: 1, servingLabel: '1 ks', station: 'kitchen', photo: '🍔' }),
    // JÍDLO — Dezerty
    item('Jablečný štrúdl', 'jidlo', 'Dezerty', { sellPrice: 119, unit: 'ks', stockQty: 18, minQty: 5, servingSize: 1, servingLabel: '1 ks', station: 'kitchen', photo: '🥧' }),
    item('Cheesecake', 'jidlo', 'Dezerty', { sellPrice: 139, unit: 'ks', stockQty: 16, minQty: 4, servingSize: 1, servingLabel: '1 ks', station: 'kitchen', photo: '🍰' }),
    // PITÍ — Pivo (kegy)
    item('Pilsner Urquell 0,5', 'piti', 'Pivo', { sellPrice: 69, unit: 'l', stockQty: 100, minQty: 20, servingSize: 0.5, servingLabel: '0,5 l', station: 'bar', photo: '🍺' }),
    item('Velkopop. Kozel 0,5', 'piti', 'Pivo', { sellPrice: 55, unit: 'l', stockQty: 50, minQty: 15, servingSize: 0.5, servingLabel: '0,5 l', station: 'bar', photo: '🍺' }),
    item('EventFlow IPA 0,4', 'piti', 'Pivo', { sellPrice: 89, unit: 'l', stockQty: 30, minQty: 10, servingSize: 0.4, servingLabel: '0,4 l', station: 'bar', photo: '🍺' }),
    // PITÍ — Víno
    item('Ryzlink rýnský 0,15', 'piti', 'Víno', { sellPrice: 89, unit: 'l', stockQty: 12, minQty: 3, servingSize: 0.15, servingLabel: '0,15 l', station: 'bar', photo: '🍷' }),
    item('Frankovka 0,15', 'piti', 'Víno', { sellPrice: 95, unit: 'l', stockQty: 10, minQty: 3, servingSize: 0.15, servingLabel: '0,15 l', station: 'bar', photo: '🍷' }),
    item('Prosecco 0,1', 'piti', 'Víno', { sellPrice: 99, unit: 'l', stockQty: 9, minQty: 2, servingSize: 0.1, servingLabel: '0,1 l', station: 'bar', photo: '🥂' }),
    // PITÍ — Nealko
    item('Coca-Cola 0,33', 'piti', 'Nealko', { sellPrice: 55, unit: 'ks', stockQty: 60, minQty: 24, servingSize: 1, servingLabel: '0,33 l', station: 'bar', photo: '🥤' }),
    item('Mattoni 0,33', 'piti', 'Nealko', { sellPrice: 45, unit: 'ks', stockQty: 48, minQty: 24, servingSize: 1, servingLabel: '0,33 l', station: 'bar', photo: '💧' }),
    item('Espresso', 'piti', 'Nealko', { sellPrice: 59, unit: 'ks', stockQty: 800, minQty: 100, servingSize: 1, servingLabel: '1 ks', station: 'bar', photo: '☕' }),
    // PITÍ — Destiláty (lahve 0,7 l)
    item('Becherovka 0,04', 'piti', 'Destiláty', { sellPrice: 65, unit: 'l', stockQty: 4.2, minQty: 1, servingSize: 0.04, servingLabel: '0,04 l', station: 'bar', photo: '🥃' }),
    item('Single Malt Whisky 0,04', 'piti', 'Destiláty', { sellPrice: 149, unit: 'l', stockQty: 3.5, minQty: 0.7, servingSize: 0.04, servingLabel: '0,04 l', station: 'bar', photo: '🥃' }),
    item('Gin & Tonic', 'piti', 'Destiláty', { sellPrice: 129, unit: 'l', stockQty: 2.8, minQty: 0.7, servingSize: 0.05, servingLabel: '0,05 l', station: 'bar', photo: '🍸' }),
    // Bulk / raw — hidden from POS
    item('Syrové hovězí (bulk)', 'jidlo', 'Suroviny', { sellPrice: 0, purchasePrice: 289, unit: 'kg', stockQty: 25, minQty: 8, servingSize: 0, servingLabel: '—', station: 'kitchen', photo: '🥩', isPosVisible: false, vatRate: 12 }),
    item('Brambory (pytel)', 'jidlo', 'Suroviny', { sellPrice: 0, purchasePrice: 18, unit: 'kg', stockQty: 40, minQty: 15, servingSize: 0, servingLabel: '—', station: 'kitchen', photo: '🥔', isPosVisible: false, vatRate: 12 }),
    item('Čisticí prostředek', 'technika', 'Úklid', { sellPrice: 0, purchasePrice: 129, unit: 'ks', stockQty: 12, minQty: 4, servingSize: 0, servingLabel: '—', station: 'kitchen', photo: '🧴', isPosVisible: false, vatRate: 21 }),
    item('Papírové ubrousky', 'inventar', 'Stolování', { sellPrice: 0, purchasePrice: 89, unit: 'ks', stockQty: 30, minQty: 10, servingSize: 0, servingLabel: '—', station: 'bar', photo: '🧻', isPosVisible: false, vatRate: 21 }),
    item('Sklenice na pivo', 'inventar', 'Stolování', { sellPrice: 0, purchasePrice: 45, unit: 'ks', stockQty: 120, minQty: 40, servingSize: 0, servingLabel: '—', station: 'bar', photo: '🍺', isPosVisible: false, vatRate: 21 }),
    item('Termotiskárna účtenek', 'technika', 'Hardware', { sellPrice: 0, purchasePrice: 3200, unit: 'ks', stockQty: 3, minQty: 1, servingSize: 0, servingLabel: '—', station: 'bar', photo: '🖨️', isPosVisible: false, vatRate: 21 }),
  ]
}

// Heuristic AI classification of messy imported rows.
export function classify(name: string): { category: InventoryCategory; subcategory: string; station: Station; unit: StockUnit } {
  const n = name.toLowerCase()
  const has = (...keys: string[]) => keys.some((k) => n.includes(k))
  if (has('pivo', 'plzeň', 'plzen', 'kozel', 'ipa', 'ležák', 'lezak')) return { category: 'piti', subcategory: 'Pivo', station: 'bar', unit: 'l' }
  if (has('víno', 'vino', 'ryzlink', 'frankovka', 'prosecco', 'sekt')) return { category: 'piti', subcategory: 'Víno', station: 'bar', unit: 'l' }
  if (has('whisky', 'gin', 'rum', 'vodka', 'becher', 'tequila', 'likér', 'liker')) return { category: 'piti', subcategory: 'Destiláty', station: 'bar', unit: 'l' }
  if (has('kola', 'cola', 'voda', 'mattoni', 'espresso', 'káva', 'kava', 'džus', 'dzus', 'limo')) return { category: 'piti', subcategory: 'Nealko', station: 'bar', unit: 'ks' }
  if (has('řízek', 'rizek', 'svíčk', 'svick', 'steak', 'burger', 'maso', 'kuře', 'kure', 'ryba', 'losos')) return { category: 'jidlo', subcategory: 'Hlavní chody', station: 'kitchen', unit: 'kg' }
  if (has('dezert', 'štrúdl', 'strudl', 'cheesecake', 'dort', 'zmrzlina')) return { category: 'jidlo', subcategory: 'Dezerty', station: 'kitchen', unit: 'ks' }
  if (has('předkrm', 'predkrm', 'polévka', 'polevka', 'salát', 'salat', 'tatarák', 'tatarak')) return { category: 'jidlo', subcategory: 'Předkrmy', station: 'kitchen', unit: 'ks' }
  if (has('čistic', 'cistic', 'mycí', 'myci', 'baterie', 'kabel', 'tiskárna', 'tiskarna', 'hardware')) return { category: 'technika', subcategory: 'Hardware', station: 'bar', unit: 'ks' }
  if (has('ubrous', 'sklenic', 'talíř', 'talir', 'příbor', 'pribor', 'ubrus')) return { category: 'inventar', subcategory: 'Stolování', station: 'bar', unit: 'ks' }
  return { category: 'jidlo', subcategory: 'Ostatní', station: 'kitchen', unit: 'ks' }
}

// Parse messy CSV/TSV competitor data → normalized, hidden inventory items.
export function parseImport(raw: string): InventoryItem[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []
  const out: InventoryItem[] = []
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(/[;,\t]/).map((c) => c.trim())
    const name = cols[0]
    if (!name) continue
    // Skip a header row.
    if (i === 0 && /náz|name|polož|item|produkt/i.test(name)) continue
    const priceCol = cols.slice(1).find((c) => /\d/.test(c)) ?? '0'
    const sellPrice = Math.round(Number(priceCol.replace(/[^\d.,]/g, '').replace(',', '.')) || 0)
    const c = classify(name)
    out.push({
      id: uid('inv'),
      name,
      category: c.category,
      subcategory: c.subcategory,
      ean: generateEan(),
      unit: c.unit,
      stockQty: 0,
      minQty: 0,
      purchasePrice: Math.round(sellPrice * 0.4),
      sellPrice,
      vatRate: c.category === 'jidlo' ? 12 : 21,
      isPosVisible: false,
      station: c.station,
      photo: c.category === 'piti' ? '🥤' : c.category === 'jidlo' ? '🍽️' : '📦',
      servingSize: c.unit === 'ks' ? 1 : c.unit === 'l' ? 0.5 : 0.2,
      servingLabel: c.unit === 'ks' ? '1 ks' : c.unit === 'l' ? '0,5 l' : '200 g',
    })
  }
  return out
}

export interface AiCommandResult {
  items: InventoryItem[]
  message: string
}

// Natural-language batch operations for the "AI Skladový asistent" command bar.
export function applyAiCommand(items: InventoryItem[], command: string): AiCommandResult {
  const cmd = command.toLowerCase()
  const pct = cmd.match(/o\s*(\d+(?:[.,]\d+)?)\s*%/)
  const percent = pct ? Number(pct[1].replace(',', '.')) : null

  const matchCategory = (): InventoryCategory | null => {
    if (/pití|piti|nápoj|napoj|bar/.test(cmd)) return 'piti'
    if (/jídl|jidl|kuchyň|kuchyn/.test(cmd)) return 'jidlo'
    if (/inventář|inventar/.test(cmd)) return 'inventar'
    if (/technik/.test(cmd)) return 'technika'
    return null
  }
  const cat = matchCategory()

  const inScope = (it: InventoryItem) => (cat ? it.category === cat : true)

  if (percent !== null && /(zved|zvyš|zvys|navyš|navys|zdraž|zdraz)/.test(cmd)) {
    let count = 0
    const next = items.map((it) => {
      if (!inScope(it) || it.sellPrice <= 0) return it
      count++
      return { ...it, sellPrice: Math.round(it.sellPrice * (1 + percent / 100)) }
    })
    return { items: next, message: `Zvýšena prodejní cena o ${percent} % u ${count} položek${cat ? ` (${CATEGORY_LABEL[cat]})` : ''}.` }
  }
  if (percent !== null && /(sniž|sniz|zlevni|sleva)/.test(cmd)) {
    let count = 0
    const next = items.map((it) => {
      if (!inScope(it) || it.sellPrice <= 0) return it
      count++
      return { ...it, sellPrice: Math.round(it.sellPrice * (1 - percent / 100)) }
    })
    return { items: next, message: `Snížena prodejní cena o ${percent} % u ${count} položek${cat ? ` (${CATEGORY_LABEL[cat]})` : ''}.` }
  }
  if (/(skryj|schovej).*(pos|pokladn|číšn|cisn)/.test(cmd) || /skryj/.test(cmd)) {
    let count = 0
    const next = items.map((it) => {
      if (!inScope(it)) return it
      count++
      return { ...it, isPosVisible: false }
    })
    return { items: next, message: `Skryto z POS: ${count} položek.` }
  }
  if (/(zobraz|ukaž|ukaz).*(pos|pokladn)/.test(cmd) || /zobraz/.test(cmd)) {
    let count = 0
    const next = items.map((it) => {
      if (!inScope(it) || it.sellPrice <= 0) return it
      count++
      return { ...it, isPosVisible: true }
    })
    return { items: next, message: `Zobrazeno v POS: ${count} položek.` }
  }
  return {
    items,
    message: 'Příkazu nerozumím. Zkuste např. „Zvedni prodejní cenu u kategorie Pití o 10 %“.',
  }
}
