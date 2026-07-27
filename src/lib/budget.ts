import type {
  BudgetLine,
  BudgetTotals,
  CateringPlanItem,
  ChecklistItem,
  DocNumbers,
  VatRate,
} from './types'
import { uid, vatBase } from './format'

let docSeq = 1
export function nextDocNumbers(): DocNumbers {
  const seq = String(docSeq).padStart(3, '0')
  docSeq += 1
  return {
    nabidka: `CN2026${seq}`,
    smlouva: `SOD2026${seq}`,
    faktura: `F2026${seq}`,
  }
}

export function computeBudgetTotals(lines: BudgetLine[]): BudgetTotals {
  const costLines = lines.filter((l) => l.isCost)
  const revenueLines = lines.filter((l) => !l.isCost)
  const cost = costLines.reduce((s, l) => s + l.amount, 0)
  const revenue = revenueLines.reduce((s, l) => s + l.amount, 0)
  const profit = revenue - cost
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  const rates: VatRate[] = [21, 12, 0]
  const vatByRate = rates.map((rate) => {
    const gross = costLines.filter((l) => l.vatRate === rate).reduce((s, l) => s + l.amount, 0)
    if (rate === 0) return { rate, base: gross, vat: 0 }
    const { base, vat } = vatBase(gross, rate)
    return { rate, base, vat }
  })

  return { cost, revenue, profit, margin, vatByRate }
}

export interface BudgetBundle {
  budgetLines: BudgetLine[]
  totals: BudgetTotals
  catering: CateringPlanItem[]
  checklist: ChecklistItem[]
  docs: DocNumbers
}

export function buildBudget(guests: number, budget: number): BudgetBundle {
  const revenue = budget > 0 ? budget : guests * 2200

  const budgetLines: BudgetLine[] = [
    { id: uid('bl'), category: 'Catering', description: `Menu a nápoje pro ${guests} hostů`, amount: Math.round(guests * 320), vatRate: 12, isCost: true },
    { id: uid('bl'), category: 'Personál', description: `Obsluha, kuchyně, koordinace`, amount: Math.round(guests * 95), vatRate: 21, isCost: true },
    { id: uid('bl'), category: 'Doprava', description: 'Rozvoz materiálu a techniky', amount: 6400, vatRate: 21, isCost: true },
    { id: uid('bl'), category: 'Pronájem', description: 'Prostor, mobiliář, vybavení', amount: Math.round(guests * 140), vatRate: 21, isCost: true },
    { id: uid('bl'), category: 'Technika / AV', description: 'Zvuk, světla, projekce (přenesená daň. povinnost)', amount: 18500, vatRate: 0, isCost: true },
    { id: uid('bl'), category: 'Dekorace', description: 'Květiny, textil, branding', amount: Math.round(guests * 60), vatRate: 21, isCost: true },
    { id: uid('bl'), category: 'Cena projektu', description: 'Fakturovaná cena klientovi', amount: revenue, vatRate: 21, isCost: false },
  ]

  const catering: CateringPlanItem[] = [
    { id: uid('cat'), name: 'Welcome drink — Prosecco Spritz', portions: guests, unitPrice: 95, allergens: [12] },
    { id: uid('cat'), name: 'Kanapkové trio', portions: guests, unitPrice: 65, allergens: [1, 4, 7] },
    { id: uid('cat'), name: 'Hlavní chod — degustační menu', portions: guests, unitPrice: 320, allergens: [1, 3, 7, 9] },
    { id: uid('cat'), name: 'Dezertní bar', portions: guests, unitPrice: 75, allergens: [1, 3, 7, 8] },
  ]

  const checklist: ChecklistItem[] = [
    { id: uid('ck'), label: 'Potvrdit počet hostů s klientem', done: false },
    { id: uid('ck'), label: 'Objednat suroviny dle nákupního seznamu', done: false },
    { id: uid('ck'), label: 'Rezervovat obsluhu a kuchyňský tým', done: false },
    { id: uid('ck'), label: 'Zajistit dopravu a stavbu prostoru', done: false },
    { id: uid('ck'), label: 'Vystavit zálohovou fakturu', done: false },
    { id: uid('ck'), label: 'Finální kontrola alergenové matice', done: false },
  ]

  return {
    budgetLines,
    totals: computeBudgetTotals(budgetLines),
    catering,
    checklist,
    docs: nextDocNumbers(),
  }
}
