import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ArchivedKdsTicket,
  EventProject,
  KdsTicket,
  ShiftCashExpense,
  ShiftCashExpenseKind,
  ShiftClosureRecord,
  ShiftDocumentArchive,
} from '../types'
import { uid } from '../lib/documentIds'
import {
  buildShiftClosureThermal,
  computeCashBalance,
  computeShiftRevenue,
  filterShiftCompletedTickets,
  sumExpensesByKind,
} from '../lib/shiftFinance'
import { openThermalPrintWindow } from '../lib/printerHardware'
import { publishKdsClear, publishShiftClosed } from '../lib/kdsSync'

type CloseShiftResult =
  | { ok: true; closure: ShiftClosureRecord; archiveId: string }
  | { ok: false; error: string }

type ShiftFinanceState = {
  activeShiftId: string
  shiftStartedAt: string
  /** When true, Staff Terminal / POS reject new orders until nová směna */
  ordersLocked: boolean
  expenses: ShiftCashExpense[]
  /** Permanent locked documents archive (uzávěrky + KDS historie) */
  documentArchive: ShiftDocumentArchive[]
  closures: ShiftClosureRecord[]

  addExpense: (opts: {
    kind: ShiftCashExpenseKind
    amount: number
    staffId?: string | null
    staffName?: string | null
    note?: string
  }) => ShiftCashExpense | null
  removeExpense: (id: string) => void
  clearCurrentShiftExpenses: () => void

  /**
   * Full Uzavřít směnu sequence:
   * archive KDS historie → wipe active KDS → lock orders → print → persist documents.
   */
  closeShiftAndPrint: (opts: {
    project: EventProject | null
    kdsTickets: KdsTicket[]
    clearKdsTickets: () => void
    managerName: string
    waiterId?: string
    waiterName?: string
    venueName: string
    print?: boolean
  }) => CloseShiftResult

  startNewShift: () => void
}

function newShiftStamp() {
  const now = new Date().toISOString()
  return { activeShiftId: uid('shift'), shiftStartedAt: now }
}

export const useShiftFinanceStore = create<ShiftFinanceState>()(
  persist(
    (set, get) => ({
      ...newShiftStamp(),
      ordersLocked: false,
      expenses: [],
      documentArchive: [],
      closures: [],

      addExpense: ({ kind, amount, staffId, staffName, note }) => {
        const value = Math.round(Number(amount) || 0)
        if (value <= 0) return null
        if (
          (kind === 'staff_advance' || kind === 'staff_payout') &&
          !String(staffName || '').trim()
        ) {
          return null
        }
        const row: ShiftCashExpense = {
          id: uid('exp'),
          shiftId: get().activeShiftId,
          kind,
          amount: value,
          staffId: staffId ?? null,
          staffName: staffName?.trim() || null,
          note: (note || '').trim(),
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ expenses: [row, ...s.expenses] }))
        return row
      },

      removeExpense: (id) =>
        set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),

      clearCurrentShiftExpenses: () => set({ expenses: [] }),

      closeShiftAndPrint: ({
        project,
        kdsTickets,
        clearKdsTickets,
        managerName,
        waiterId,
        waiterName,
        venueName,
        print = true,
      }) => {
        const state = get()
        if (state.ordersLocked) {
          return { ok: false, error: 'Směna je již uzavřena — zahajte novou směnu.' }
        }

        const closedAt = new Date()
        const closedIso = closedAt.toISOString()
        const revenue = computeShiftRevenue(project, state.shiftStartedAt)
        const shiftExpenses = (state.expenses ?? []).filter(
          (e) => e.shiftId === state.activeShiftId,
        )
        const balance = computeCashBalance(revenue.cash, shiftExpenses)
        const history = filterShiftCompletedTickets(
          kdsTickets,
          state.shiftStartedAt,
          'all',
        )

        const thermalText = buildShiftClosureThermal({
          venueName: venueName || project?.name || 'EventFlow',
          managerName: managerName || waiterName || 'Vedoucí směny',
          closedAt,
          revenue,
          balance,
          expenses: shiftExpenses,
          shiftId: state.activeShiftId,
        })

        const closureId = uid('closure')
        const closure: ShiftClosureRecord = {
          id: closureId,
          createdAt: closedIso,
          shiftId: state.activeShiftId,
          waiterId: waiterId || '',
          waiterName: waiterName || managerName,
          managerName: managerName || waiterName || 'Vedoucí směny',
          venueName: venueName || project?.name || 'EventFlow',
          projectId: project?.id ?? null,
          projectName: project?.name || '—',
          revenueKitchen: revenue.kitchen,
          revenueBar: revenue.bar,
          revenueCard: revenue.card,
          revenueCash: revenue.cash,
          revenueTotal: revenue.total,
          deductionGoods: balance.goods,
          deductionAdvances: balance.advances,
          deductionPayouts: balance.payouts,
          deductionWages: balance.advances + balance.payouts,
          netCashDrawer: balance.finalCash,
          expenses: shiftExpenses,
          kdsTicketCount: history.length,
          notes: 'Uzávěrka směny — EventFlow',
          thermalText,
        }

        const archivedTickets: ArchivedKdsTicket[] = history.map((t) => ({
          ...t,
          archivedAt: closedIso,
          closureId,
          shiftId: state.activeShiftId,
        }))

        const archive: ShiftDocumentArchive = {
          id: uid('doc'),
          createdAt: closedIso,
          shiftId: state.activeShiftId,
          closureId,
          kind: 'shift_closure',
          title: `Uzávěrka ${closedAt.toLocaleDateString('cs-CZ')} · ${closure.managerName}`,
          thermalText,
          kdsTickets: archivedTickets,
          closure,
        }

        // Wipe active KDS board (historie → archiv)
        clearKdsTickets()
        publishKdsClear({ closureId, shiftId: state.activeShiftId })
        publishShiftClosed({
          closureId,
          shiftId: state.activeShiftId,
          closedAt: closedIso,
        })

        set({
          ordersLocked: true,
          expenses: [],
          closures: [closure, ...state.closures].slice(0, 200),
          documentArchive: [archive, ...state.documentArchive].slice(0, 200),
        })

        if (print) {
          openThermalPrintWindow(thermalText, 'Denní uzávěrka směny')
        }

        return { ok: true, closure, archiveId: archive.id }
      },

      startNewShift: () => {
        set({
          ...newShiftStamp(),
          ordersLocked: false,
          expenses: [],
        })
      },
    }),
    {
      name: 'eventflow-shift-finance-v1',
      partialize: (s) => ({
        activeShiftId: s.activeShiftId,
        shiftStartedAt: s.shiftStartedAt,
        ordersLocked: s.ordersLocked,
        expenses: s.expenses,
        documentArchive: s.documentArchive,
        closures: s.closures,
      }),
    },
  ),
)

export function selectCurrentShiftExpenses(s: ShiftFinanceState): ShiftCashExpense[] {
  return (s.expenses ?? []).filter((e) => e.shiftId === s.activeShiftId)
}

export { sumExpensesByKind }
