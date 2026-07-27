import { create } from 'zustand'
import type { CashOut, CashOutType, SaleRecord } from '../lib/types'
import { uid } from '../lib/format'

export interface ShiftTotals {
  kitchen: number
  bar: number
  cash: number
  card: number
  total: number
}

export interface ShiftReceipt {
  docNumber: string
  closedAt: number
  totals: ShiftTotals
  cashOuts: CashOut[]
  finalCash: number
  saleCount: number
}

interface ShiftState {
  sales: SaleRecord[]
  cashOuts: CashOut[]
  lastReceipt: ShiftReceipt | null
  recordSale: (sale: SaleRecord) => void
  addCashOut: (type: CashOutType, label: string, amount: number, workerId: string) => void
  removeCashOut: (id: string) => void
  totals: () => ShiftTotals
  finalCash: () => number
  buildReceipt: (docNumber: string) => ShiftReceipt
  closeShift: () => void
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  sales: [],
  cashOuts: [],
  lastReceipt: null,

  recordSale: (sale) => set((s) => ({ sales: [sale, ...s.sales] })),

  addCashOut: (type, label, amount, workerId) =>
    set((s) => ({
      cashOuts: [
        ...s.cashOuts,
        { id: uid('out'), type, label, amount, workerId },
      ],
    })),

  removeCashOut: (id) =>
    set((s) => ({ cashOuts: s.cashOuts.filter((c) => c.id !== id) })),

  totals: () => {
    const { sales } = get()
    let kitchen = 0
    let bar = 0
    let cash = 0
    let card = 0
    for (const sale of sales) {
      for (const item of sale.items) {
        if (item.station === 'kitchen') kitchen += item.price
        else bar += item.price
      }
      cash += sale.cashPart
      card += sale.cardPart
    }
    return { kitchen, bar, cash, card, total: kitchen + bar }
  },

  finalCash: () => {
    const cash = get().totals().cash
    const out = get().cashOuts.reduce((sum, c) => sum + c.amount, 0)
    return cash - out
  },

  buildReceipt: (docNumber) => {
    const totals = get().totals()
    return {
      docNumber,
      closedAt: Date.now(),
      totals,
      cashOuts: get().cashOuts,
      finalCash: get().finalCash(),
      saleCount: get().sales.length,
    }
  },

  closeShift: () => set({ sales: [], cashOuts: [] }),
}))
