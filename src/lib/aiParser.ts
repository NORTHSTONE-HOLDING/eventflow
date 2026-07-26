import type {
  BudgetLine,
  CateringItem,
  ChecklistItem,
  EventProject,
  StaffMember,
  TimelineItem,
} from '../types'
import { calculateBudget, optimizeBudgetRecommendations } from './budgetEngine'
import {
  parseBudgetDocuments,
  summarizeBudgetExtract,
  toBudgetLines,
  toCateringItems,
  toTimelineItems,
  type BudgetDocumentExtract,
} from './budgetDocumentParser'
import { generateDocumentIds, uid } from './documentIds'
import { buildWarehouseFromCatering } from './inventoryEngine'
import { bookShiftsFromStaff, applyLaborToProjectFinancials } from './shiftScheduler'
import {
  hasVenueOpenAiKey,
  openAiMessageContent,
  openaiChatCompletions,
} from './openaiClient'

export interface GenerateEventOptions {
  /** Prefer OpenAI when venue key is present (default true). */
  useOpenAI?: boolean
  /** PDF / Excel / image snapshots of older budgets. */
  attachments?: File[]
}

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
      subcategory: 'vino',
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
      subcategory: 'predkrmy',
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
      subcategory: 'hlavni',
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
      subcategory: 'dezerty',
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
      subcategory: 'pivo',
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
      subcategory: 'koktejly',
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
    {
      id: uid('cat'),
      name: 'Mojito',
      recipe: 'Rum 5cl, limetka 30g, sodovka 15cl, máta, cukr, led',
      foodCost: 55 * Math.ceil(guests * 0.35),
      portion: Math.ceil(guests * 0.35),
      allergens: [],
      inventory: [
        `Rum ${Math.ceil(guests * 0.35 * 0.05)} l`,
        `Limetky ${Math.ceil(guests * 0.35 * 0.03)} kg`,
        `Sodovka ${Math.ceil(guests * 0.35 * 0.15)} l`,
        'Máta 4 svazky',
        `Led ${Math.ceil(guests * 0.12)} kg`,
        `Cukr ${Math.ceil(guests * 0.35 * 0.01)} kg`,
      ],
      category: 'beverage',
      subcategory: 'koktejly',
      sellPrice: 135,
      vatRate: 21,
      plannedPortions: Math.ceil(guests * 0.35),
      soldPortions: 0,
      ingredients: [
        { name: 'Rum', qtyPerPortion: 0.05, unit: 'l' },
        { name: 'Limetky', qtyPerPortion: 0.03, unit: 'kg' },
        { name: 'Sodovka', qtyPerPortion: 0.15, unit: 'l' },
        { name: 'Máta', qtyPerPortion: 0.15, unit: 'ks' },
        { name: 'Led', qtyPerPortion: 0.12, unit: 'kg' },
        { name: 'Cukr', qtyPerPortion: 0.01, unit: 'kg' },
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

function financialsFromLines(lines: BudgetLine[], fallbackBudget: number) {
  const totalCost = lines.filter((l) => l.isCost).reduce((s, l) => s + l.amount, 0)
  const revenue =
    lines.filter((l) => !l.isCost).reduce((s, l) => s + l.amount, 0) || fallbackBudget
  const netProfit = revenue - totalCost
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  return { totalCost, revenue, netProfit, margin }
}

function mergePromptWithExtract(
  parsed: ParsedPrompt,
  extract: BudgetDocumentExtract | null,
): ParsedPrompt {
  if (!extract) return parsed
  const guests = extract.guests && extract.guests > 0 ? extract.guests : parsed.guests
  const location = extract.location || parsed.location
  const budget = extract.budget && extract.budget > 0 ? extract.budget : parsed.budget
  const eventType = extract.eventType || parsed.eventType
  const name =
    extract.name ||
    `${eventType} — ${location} (${guests} hostů)`
  return { ...parsed, guests, location, budget, eventType, name }
}

export async function generateEventFromPrompt(
  prompt: string,
  options: GenerateEventOptions | boolean = {},
): Promise<EventProject> {
  // Backward-compatible: second arg used to be `useOpenAI: boolean`
  const opts: GenerateEventOptions =
    typeof options === 'boolean' ? { useOpenAI: options } : options ?? {}
  const useOpenAI = opts.useOpenAI !== false
  const attachments = Array.isArray(opts.attachments) ? opts.attachments.filter(Boolean) : []

  let parsed = parseCzechPrompt(prompt)
  let documentExtract: BudgetDocumentExtract | null = null

  if (attachments.length) {
    documentExtract = await parseBudgetDocuments(attachments, prompt)
    parsed = mergePromptWithExtract(parsed, documentExtract)
  }

  if (useOpenAI && hasVenueOpenAiKey() && prompt.trim()) {
    try {
      const chat = await openaiChatCompletions({
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
      })
      if (chat.ok) {
        const raw = openAiMessageContent(chat.data)
        if (raw) {
          const content = JSON.parse(raw) as Partial<ParsedPrompt>
          parsed = { ...parsed, ...content, date: parsed.date }
          // Document extract remains authoritative for structured budget merge
          parsed = mergePromptWithExtract(parsed, documentExtract)
        }
      }
    } catch {
      // fallback to client simulation
    }
  }

  if (!attachments.length) {
    await new Promise((r) => setTimeout(r, 1200))
  }

  const budget = calculateBudget(parsed.guests, parsed.budget, parsed.location)
  const docs = generateDocumentIds()

  let timeline: TimelineItem[] = defaultTimeline()
  let budgetLines: BudgetLine[] = budget.lines
  let catering: CateringItem[] = defaultCatering(parsed.guests)
  let totalCost = budget.totalCost
  let totalRevenue = budget.revenue
  let netProfit = budget.netProfit
  let margin = budget.margin

  if (documentExtract) {
    if (documentExtract.timeline.length) {
      timeline = toTimelineItems(documentExtract.timeline)
    }
    if (documentExtract.budgetLines.length) {
      budgetLines = toBudgetLines(documentExtract.budgetLines)
      const hasRevenue = budgetLines.some((l) => !l.isCost)
      if (!hasRevenue) {
        budgetLines = [
          ...budgetLines,
          {
            id: uid('bl'),
            category: 'Výnos',
            description: 'Celková cena zakázky (z podkladů)',
            amount: parsed.budget,
            vatRate: 21,
            isCost: false,
          },
        ]
      }
      if (documentExtract.suppliers.length) {
        const supplierNote = documentExtract.suppliers.join(', ')
        budgetLines = budgetLines.map((line, idx) =>
          idx === 0 && line.isCost
            ? {
                ...line,
                description: `${line.description} · Dodavatelé: ${supplierNote}`,
              }
            : line,
        )
      }
      const fin = financialsFromLines(budgetLines, parsed.budget)
      totalCost = fin.totalCost
      totalRevenue = fin.revenue
      netProfit = fin.netProfit
      margin = fin.margin
    }
    if (documentExtract.catering.length) {
      catering = toCateringItems(documentExtract.catering)
    }
  }

  const warehouse = buildWarehouseFromCatering(catering)
  const staff = defaultStaff(parsed.guests)
  const attachmentNote = documentExtract
    ? `\n\n[${summarizeBudgetExtract(documentExtract)}]`
    : ''

  const draft: EventProject = {
    id: uid('evt'),
    name: parsed.name,
    prompt: `${prompt}${attachmentNote}`,
    guests: parsed.guests,
    location: parsed.location,
    budget: parsed.budget,
    date: parsed.date,
    status: 'active',
    timeline,
    budgetLines,
    catering,
    checklist: defaultChecklist(),
    staff,
    shiftBookings: [],
    documents: docs,
    clientPhone: '',
    clientName: '',
    clientSigned: false,
    clientSignature: null,
    depositPaid: false,
    createdAt: new Date().toISOString(),
    margin,
    netProfit,
    totalCost,
    totalRevenue,
    warehouse,
    posTransactions: [],
    posTables: [],
    activeTableId: null,
    posExtrasTotal: 0,
    doplatkovaId: null,
    doplatkovaText: null,
    posClosed: false,
    finalPaymentPaid: false,
    invoiceDueDate: null,
    debtLegalAnalysis: null,
  }

  // Auto-book staff shifts into calendar state and feed labor into budget/margin
  draft.shiftBookings = bookShiftsFromStaff(draft, 'ai')
  return applyLaborToProjectFinancials(draft)
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
