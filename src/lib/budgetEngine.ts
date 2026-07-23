import type { BudgetLine } from '../types'
import { uid } from './documentIds'

export const VAT_RATES = {
  standard: 21,
  reduced: 12,
  zero: 0,
} as const

export interface BudgetBreakdown {
  foodCost: number
  staffWages: number
  transport: number
  venue: number
  other: number
  totalCost: number
  revenue: number
  margin: number
  netProfit: number
  vatAmount: number
  lines: BudgetLine[]
}

export function calculateBudget(
  guests: number,
  totalBudget: number,
  location = 'Praha'
): BudgetBreakdown {
  const foodPerGuest = guests > 150 ? 420 : guests > 80 ? 480 : 550
  const foodCost = Math.round(guests * foodPerGuest)

  const staffCount = Math.max(4, Math.ceil(guests / 25))
  const staffHours = 10
  const staffRate = 280
  const staffWages = staffCount * staffHours * staffRate

  const transportBase = location.toLowerCase().includes('praha') ? 8500 : 14000
  const transport = transportBase + Math.round(guests * 12)

  const venue = Math.round(totalBudget * 0.18)
  const other = Math.round(totalBudget * 0.08)

  const totalCost = foodCost + staffWages + transport + venue + other
  const revenue = totalBudget
  const netProfit = revenue - totalCost
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  const foodVat = VAT_RATES.reduced
  const serviceVat = VAT_RATES.standard

  const lines: BudgetLine[] = [
    {
      id: uid('bl'),
      category: 'Catering',
      description: `Strava pro ${guests} hostů (food cost)`,
      amount: foodCost,
      vatRate: foodVat,
      isCost: true,
    },
    {
      id: uid('bl'),
      category: 'Personál',
      description: `${staffCount}× personál × ${staffHours}h × ${staffRate} Kč`,
      amount: staffWages,
      vatRate: serviceVat,
      isCost: true,
    },
    {
      id: uid('bl'),
      category: 'Doprava',
      description: 'Transport materiálu a týmu',
      amount: transport,
      vatRate: serviceVat,
      isCost: true,
    },
    {
      id: uid('bl'),
      category: 'Pronájem',
      description: 'Pronájem prostoru / techniky',
      amount: venue,
      vatRate: serviceVat,
      isCost: true,
    },
    {
      id: uid('bl'),
      category: 'Ostatní',
      description: 'Dekorace, pojištění, rezerva',
      amount: other,
      vatRate: serviceVat,
      isCost: true,
    },
    {
      id: uid('bl'),
      category: 'Výnos',
      description: 'Celková cena zakázky',
      amount: revenue,
      vatRate: serviceVat,
      isCost: false,
    },
  ]

  const vatAmount = lines
    .filter((l) => l.isCost)
    .reduce((sum, l) => sum + l.amount * (l.vatRate / 100), 0)

  return {
    foodCost,
    staffWages,
    transport,
    venue,
    other,
    totalCost,
    revenue,
    margin,
    netProfit,
    vatAmount: Math.round(vatAmount),
    lines,
  }
}

export function optimizeBudgetRecommendations(
  guests: number,
  budget: number,
  margin: number
): string[] {
  const tips: string[] = []
  if (margin < 20) {
    tips.push('Zvyšte marži na min. 22 % — zvažte buffet místo servírovaného menu.')
  }
  if (guests > 100 && budget / guests < 2000) {
    tips.push('Rozpočet na hosta je nízký — doporučujeme finger food + open bar limit.')
  }
  tips.push('Nákup nápojů velkoobchodně ušetří cca 12–18 % food costu.')
  tips.push('Sdílená doprava s jinou akcí ve stejném dni sníží logistiku o ~4 000 Kč.')
  if (guests >= 150) {
    tips.push('Pro 150+ hostů: 1 číšník / 20 hostů + 1 barman / 40 hostů.')
  }
  tips.push('AI: přesuňte desert station na self-service — úspora 2 personálů.')
  return tips
}
