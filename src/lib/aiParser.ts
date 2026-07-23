import type {
  CateringItem,
  ChecklistItem,
  EventProject,
  StaffMember,
  TimelineItem,
} from '../types'
import { calculateBudget, optimizeBudgetRecommendations } from './budgetEngine'
import { generateDocumentIds, uid } from './documentIds'
import { buildWarehouseFromCatering } from './inventoryEngine'

export interface ParsedPrompt {
  guests: number
  location: string
  budget: number
  eventType: string
  name: string
  date: string
}

const EVENT_TYPE_MAP: Record<string, string> = {
  večírek: 'Firemní večírek',
  firemní: 'Firemní večírek',
  svatba: 'Svatba',
  konference: 'Konference',
  gala: 'Gala večer',
  birthday: 'Narozeninová oslava',
  narozeniny: 'Narozeninová oslava',
  teambuilding: 'Teambuilding',
  raut: 'Raut',
  festival: 'Festival',
}

export function parseCzechPrompt(prompt: string): ParsedPrompt {
  const lower = prompt.toLowerCase()

  const guestMatch = lower.match(/(\d[\d\s]*)\s*(lidí|osob|hostů|hoste)/)
  const guests = guestMatch
    ? parseInt(guestMatch[1].replace(/\s/g, ''), 10)
    : 100

  const budgetMatch = lower.match(/(\d[\d\s]*)\s*(kč|czk|korun)/)
  const budget = budgetMatch
    ? parseInt(budgetMatch[1].replace(/\s/g, ''), 10)
    : guests * 2500

  let location = 'Praha'
  const locMatch = lower.match(
    /v\s+(praze|brně|ostravě|plzni|olomouci|liberci|hradec|českých budějovicích|karlových varech|[a-záčďéěíňóřšťúůýž\s]+?)(?:\s+s|\s+pro|$|,|\.)/
  )
  if (locMatch) {
    const raw = locMatch[1].trim()
    location = raw.charAt(0).toUpperCase() + raw.slice(1)
    if (raw.includes('praze')) location = 'Praha'
    if (raw.includes('brně')) location = 'Brno'
    if (raw.includes('ostravě')) location = 'Ostrava'
  }

  let eventType = 'Firemní akce'
  for (const [key, label] of Object.entries(EVENT_TYPE_MAP)) {
    if (lower.includes(key)) {
      eventType = label
      break
    }
  }

  const date = new Date()
  date.setDate(date.getDate() + 30)
  const dateStr = date.toISOString().slice(0, 10)

  return {
    guests,
    location,
    budget,
    eventType,
    name: `${eventType} — ${location} (${guests} hostů)`,
    date: dateStr,
  }
}

function defaultTimeline(): TimelineItem[] {
  return [
    {
      id: uid('tl'),
      time: '08:00',
      title: 'Příjezd',
      description: 'Příjezd týmu, vykládka, briefing',
      order: 0,
    },
    {
      id: uid('tl'),
      time: '09:00',
      title: 'Stavba',
      description: 'Montáž stánků, barů, dekorací a AV',
      order: 1,
    },
    {
      id: uid('tl'),
      time: '13:00',
      title: 'Oběd',
      description: 'Catering setup + staff meal',
      order: 2,
    },
    {
      id: uid('tl'),
      time: '18:00',
      title: 'Program',
      description: 'Zahájení, welcome drink, hlavní program',
      order: 3,
    },
    {
      id: uid('tl'),
      time: '22:00',
      title: 'Úklid',
      description: 'Demontáž, inventura, odjezd',
      order: 4,
    },
  ]
}

function defaultCatering(guests: number): CateringItem[] {
  const scale = Math.max(1, Math.round(guests / 50))
  return [
    {
      id: uid('cat'),
      name: 'Welcome drink — Prosecco & mocktail',
      recipe: 'Prosecco DOC, limetka, máta, bezový sirup, led',
      foodCost: 85 * guests,
      portion: guests,
      allergens: ['sulfit'],
      inventory: [
        `Prosecco ${Math.ceil(guests / 6)} lahví`,
        'Limetky 3 kg',
        'Máta 2 svazky',
        `Led ${Math.ceil(guests * 0.15)} kg`,
      ],
      category: 'beverage',
      sellPrice: 95,
      vatRate: 21,
      plannedPortions: guests,
      soldPortions: 0,
      ingredients: [
        { name: 'Prosecco', qtyPerPortion: 1 / 6, unit: 'ks' },
        { name: 'Limetky', qtyPerPortion: 3 / guests, unit: 'kg' },
        { name: 'Máta', qtyPerPortion: 2 / guests, unit: 'ks' },
        { name: 'Led', qtyPerPortion: 0.15, unit: 'kg' },
      ],
    },
    {
      id: uid('cat'),
      name: 'Canapé trio',
      recipe: 'Losos, roastbeef, vegetariánské bruschetta',
      foodCost: 120 * guests,
      portion: guests * 3,
      allergens: ['ryby', 'lepek', 'mléko'],
      inventory: [`Chléb ${scale * 4} kg`, 'Losos 2.5 kg', 'Roastbeef 3 kg'],
      category: 'food',
      sellPrice: 65,
      vatRate: 12,
      plannedPortions: guests * 3,
      soldPortions: 0,
      ingredients: [
        { name: 'Chléb', qtyPerPortion: (scale * 4) / (guests * 3), unit: 'kg' },
        { name: 'Losos', qtyPerPortion: 2.5 / (guests * 3), unit: 'kg' },
        { name: 'Roastbeef', qtyPerPortion: 3 / (guests * 3), unit: 'kg' },
      ],
    },
    {
      id: uid('cat'),
      name: 'Hlavní chod — Menu dégustation',
      recipe: 'Kuřecí supreme / hovězí / risotto (veget)',
      foodCost: 280 * guests,
      portion: guests,
      allergens: ['mléko', 'lepek', 'celer'],
      inventory: [
        `Kuře ${Math.ceil(guests * 0.6)} ks`,
        `Hovězí ${Math.ceil(guests * 0.3)} kg`,
        'Rýže 8 kg',
      ],
      category: 'food',
      sellPrice: 320,
      vatRate: 12,
      plannedPortions: guests,
      soldPortions: 0,
      ingredients: [
        { name: 'Kuře', qtyPerPortion: 0.6, unit: 'ks' },
        { name: 'Hovězí', qtyPerPortion: 0.3, unit: 'kg' },
        { name: 'Rýže', qtyPerPortion: 8 / guests, unit: 'kg' },
      ],
    },
    {
      id: uid('cat'),
      name: 'Dezerty & coffee station',
      recipe: 'Mini tartaletky, macarons, espresso',
      foodCost: 65 * guests,
      portion: guests * 2,
      allergens: ['mléko', 'vejce', 'ořechy', 'lepek'],
      inventory: ['Macarons 200 ks', 'Tartaletky 150 ks', 'Káva 3 kg'],
      category: 'food',
      sellPrice: 55,
      vatRate: 12,
      plannedPortions: guests * 2,
      soldPortions: 0,
      ingredients: [
        { name: 'Macarons', qtyPerPortion: 200 / (guests * 2), unit: 'ks' },
        { name: 'Tartaletky', qtyPerPortion: 150 / (guests * 2), unit: 'ks' },
        { name: 'Káva', qtyPerPortion: 3 / (guests * 2), unit: 'kg' },
      ],
    },
    {
      id: uid('cat'),
      name: 'Open bar — soft & pivo',
      recipe: 'Nealko, pivo 12°, voda, led',
      foodCost: 95 * guests,
      portion: guests,
      allergens: [],
      inventory: [
        `Pivo ${Math.ceil(guests / 2)} l`,
        'Cola 40 l',
        'Voda 60 l',
        `Led ${Math.ceil(guests * 0.2)} kg`,
      ],
      category: 'beverage',
      sellPrice: 75,
      vatRate: 21,
      plannedPortions: guests,
      soldPortions: 0,
      ingredients: [
        { name: 'Pivo', qtyPerPortion: 0.5, unit: 'l' },
        { name: 'Cola', qtyPerPortion: 40 / guests, unit: 'l' },
        { name: 'Voda', qtyPerPortion: 60 / guests, unit: 'l' },
        { name: 'Led', qtyPerPortion: 0.2, unit: 'kg' },
      ],
    },
    {
      id: uid('cat'),
      name: 'Rum & cola',
      recipe: 'Cuban rum 4cl, cola, led, limeta',
      foodCost: 45 * Math.ceil(guests * 0.4),
      portion: Math.ceil(guests * 0.4),
      allergens: [],
      inventory: [
        `Rum ${Math.ceil(guests * 0.4 * 0.04)} l`,
        'Cola 20 l',
        `Led ${Math.ceil(guests * 0.1)} kg`,
        'Limetky 1.5 kg',
      ],
      category: 'beverage',
      sellPrice: 120,
      vatRate: 21,
      plannedPortions: Math.ceil(guests * 0.4),
      soldPortions: 0,
      ingredients: [
        { name: 'Rum', qtyPerPortion: 0.04, unit: 'l' },
        { name: 'Cola', qtyPerPortion: 0.2, unit: 'l' },
        { name: 'Led', qtyPerPortion: 0.12, unit: 'kg' },
        { name: 'Limetky', qtyPerPortion: 0.02, unit: 'kg' },
      ],
    },
  ]
}

function defaultChecklist(): ChecklistItem[] {
  return [
    { id: uid('cl'), label: 'Pronájem', done: false, category: 'logistics' },
    { id: uid('cl'), label: 'Led', done: false, category: 'catering' },
    { id: uid('cl'), label: 'Nápoje', done: false, category: 'catering' },
    { id: uid('cl'), label: 'Personál', done: false, category: 'staff' },
    { id: uid('cl'), label: 'Doprava', done: false, category: 'logistics' },
    { id: uid('cl'), label: 'Faktury', done: false, category: 'finance' },
  ]
}

function defaultStaff(guests: number): StaffMember[] {
  const count = Math.max(4, Math.ceil(guests / 30))
  const roles = ['Vedoucí směny', 'Číšník', 'Barman', 'Kuchař', 'Pomocná síla', 'Koordinátor']
  const names = [
    'Jan Novák',
    'Marie Svobodová',
    'Petr Dvořák',
    'Eva Černá',
    'Tomáš Procházka',
    'Lucie Kučerová',
    'Martin Veselý',
    'Anna Horáková',
  ]
  return Array.from({ length: Math.min(count, names.length) }, (_, i) => ({
    id: uid('st'),
    name: names[i],
    role: roles[i % roles.length],
    phone: `+42077${String(1000000 + i * 111111).slice(0, 7)}`,
    hourlyWage: i === 0 ? 350 : i < 3 ? 280 : 220,
    attendance: i < 2 ? 'confirmed' : 'pending',
    tasks:
      i === 0
        ? ['Briefing týmu', 'Kontrola inventáře', 'Komunikace s klientem']
        : i === 1
          ? ['Welcome drink', 'Obsluha stolů 1–8']
          : i === 2
            ? ['Bar setup', 'Open bar provoz']
            : ['Příprava stanice', 'Servis dle rozpisu'],
    shiftStart: '08:00',
    shiftEnd: '23:00',
  }))
}

export async function generateEventFromPrompt(
  prompt: string,
  useOpenAI = false
): Promise<EventProject> {
  let parsed = parseCzechPrompt(prompt)

  if (useOpenAI && import.meta.env.VITE_OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Extract event details from Czech text. Return JSON: {guests:number, location:string, budget:number, eventType:string, name:string}',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const content = JSON.parse(data.choices[0].message.content)
        parsed = { ...parsed, ...content, date: parsed.date }
      }
    } catch {
      // fallback to client simulation
    }
  }

  await new Promise((r) => setTimeout(r, 1200))

  const budget = calculateBudget(parsed.guests, parsed.budget, parsed.location)
  const docs = generateDocumentIds()
  const catering = defaultCatering(parsed.guests)
  const warehouse = buildWarehouseFromCatering(catering)

  return {
    id: uid('evt'),
    name: parsed.name,
    prompt,
    guests: parsed.guests,
    location: parsed.location,
    budget: parsed.budget,
    date: parsed.date,
    status: 'active',
    timeline: defaultTimeline(),
    budgetLines: budget.lines,
    catering,
    checklist: defaultChecklist(),
    staff: defaultStaff(parsed.guests),
    documents: docs,
    clientPhone: '',
    clientName: '',
    clientSigned: false,
    clientSignature: null,
    depositPaid: false,
    createdAt: new Date().toISOString(),
    margin: budget.margin,
    netProfit: budget.netProfit,
    totalCost: budget.totalCost,
    totalRevenue: budget.revenue,
    warehouse,
    posTransactions: [],
    posExtrasTotal: 0,
    doplatkovaId: null,
    doplatkovaText: null,
    posClosed: false,
  }
}

export function getAIRecommendations(project: EventProject): string[] {
  const tips = optimizeBudgetRecommendations(
    project.guests,
    project.budget,
    project.margin
  )
  if (project.clientSigned && project.depositPaid && !project.posClosed) {
    tips.unshift('POS Kasa je odemčená — spusťte prodej na akci v Event POS.')
  } else if (!project.clientSigned) {
    tips.push('Po podpisu smlouvy a úhradě zálohy se odemkne Event POS / Kasa.')
  }
  if ((project.posExtrasTotal || 0) > 0 && !project.doplatkovaId) {
    tips.push(
      `POS extras ${project.posExtrasTotal.toLocaleString('cs-CZ')} Kč čekají na doplatkovou fakturu — uzavřete kasu.`
    )
  }
  return tips
}
