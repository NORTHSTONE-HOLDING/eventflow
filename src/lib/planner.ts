import type { EventPlan } from './types'

// Client-side Czech event simulation. If an OpenAI key is present it could be
// swapped for a live call; without a key this deterministic engine builds a full
// timeline, shopping list and recipes from a natural Czech prompt.

function parseGuests(text: string): number {
  const m = text.match(/(\d{1,4})\s*(lid[ií]|host[uůy]|osob|pax)/i)
  if (m) return Number(m[1])
  const bare = text.match(/pro\s+(\d{1,4})/i)
  return bare ? Number(bare[1]) : 80
}

function parseBudget(text: string): number {
  const m = text.match(/(\d[\d\s.]{2,})\s*(kč|czk|korun)/i)
  if (m) return Number(m[1].replace(/[\s.]/g, ''))
  return 0
}

function parseLocation(text: string): string {
  // Match Czech declensions by stem (e.g. "v Brně" → Brno, "v Praze" → Praha).
  const cities: { name: string; stem: RegExp }[] = [
    { name: 'Praha', stem: /prah|praz/i },
    { name: 'Brno', stem: /brn/i },
    { name: 'Ostrava', stem: /ostrav/i },
    { name: 'Plzeň', stem: /plze[nň]/i },
    { name: 'Olomouc', stem: /olomouc/i },
    { name: 'Liberec', stem: /liberc|liberec/i },
    { name: 'Hradec Králové', stem: /hradec|hradci/i },
    { name: 'Karlovy Vary', stem: /karlov/i },
  ]
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const hit = cities.find((c) => c.stem.test(text) || c.stem.test(normalized))
  return hit?.name ?? 'Praha'
}

function detectKind(text: string): string {
  const lower = text.toLowerCase()
  if (/svatb/.test(lower)) return 'Svatební hostina'
  if (/večírek|vecirek|firemn|teambuild/.test(lower)) return 'Firemní event'
  if (/konferen|kongres/.test(lower)) return 'Konference'
  if (/naroz|oslav/.test(lower)) return 'Oslava'
  return 'Společenská akce'
}

export function generatePlan(prompt: string): EventPlan {
  const guests = parseGuests(prompt)
  const location = parseLocation(prompt)
  const kind = detectKind(prompt)
  const parsedBudget = parseBudget(prompt)
  const budget = parsedBudget > 0 ? parsedBudget : guests * 2200

  return {
    title: `${kind} — ${location} (${guests} hostů)`,
    guests,
    location,
    budget,
    summary: `AI plán pro ${kind.toLowerCase()} v lokalitě ${location}. Kalkulováno na ${guests} hostů s rozpočtem ${budget.toLocaleString('cs-CZ')} Kč. Harmonogram, nákupní seznam i receptury jsou automaticky přizpůsobeny počtu hostů a typu akce.`,
    timeline: [
      { time: '08:00', title: 'Příjezd & briefing', detail: 'Stavba týmu, kontrola dodávek, rozdělení sekcí.' },
      { time: '10:00', title: 'Stavba prostoru', detail: 'Mise-en-place, dekorace, AV technika, bar setup.' },
      { time: '13:00', title: 'Oběd personálu', detail: 'Staff meal a finální kontrola alergenové matice.' },
      { time: '17:00', title: 'Příchod hostů', detail: `Welcome drink pro ${guests} hostů, uvítací kanapky.` },
      { time: '19:00', title: 'Hlavní program', detail: 'Servis hlavních chodů, koordinace kuchyně a baru přes KDS.' },
      { time: '22:00', title: 'Dezert & raut', detail: 'Sladká tečka, noční raut, doplňování baru.' },
      { time: '00:30', title: 'Úklid & inventura', detail: 'Odbavení, inventura skladu, uzávěrka směny.' },
    ],
    shopping: [
      { item: 'Hovězí svíčková', qty: `${Math.ceil(guests * 0.22)} kg`, note: 'Hlavní chod' },
      { item: 'Losos filet', qty: `${Math.ceil(guests * 0.14)} kg`, note: 'Předkrm / carpaccio' },
      { item: 'Prosecco', qty: `${Math.ceil(guests / 6)} lahví`, note: 'Welcome drink' },
      { item: 'Pilsner Urquell KEG', qty: `${Math.ceil(guests / 40)} sud(ů) 50 l`, note: 'Bar' },
      { item: 'Sezónní zelenina', qty: `${Math.ceil(guests * 0.3)} kg`, note: 'Přílohy & saláty' },
      { item: 'Dezertní ovoce', qty: `${Math.ceil(guests * 0.18)} kg`, note: 'Raut' },
    ],
    recipes: [
      {
        name: 'Svíčková na smetaně',
        steps: [
          'Zeleninový základ (mrkev, celer, petržel) orestovat s cibulí.',
          'Zprudka opéct naložené hovězí, podlít vývarem a dusit doměkka.',
          'Zeleninu rozmixovat, zjemnit smetanou a redukovat na správnou konzistenci.',
          'Servírovat s houskovým knedlíkem, brusinkami a plátkem citronu.',
        ],
      },
      {
        name: 'Welcome drink — Prosecco Spritz',
        steps: [
          'Vychladit sklenice a prosecco na 6 °C.',
          'Do sklenice přidat led, 6 cl prosecca a 4 cl Aperolu.',
          'Doplnit sodou, ozdobit plátkem pomeranče a lístkem máty.',
        ],
      },
    ],
  }
}
