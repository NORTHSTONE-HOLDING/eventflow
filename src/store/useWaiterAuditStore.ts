import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/documentIds'
import { formatCzechDateTimeFull } from '../lib/czechDate'
import { useShiftFinanceStore } from './useShiftFinanceStore'

/** Live footprint entry for the current shift (Stopa číšníka). */
export interface WaiterAuditLog {
  id: string
  project_id: string
  waiter_name: string
  waiter_id?: string
  action_description: string
  /** Display stamp DD.MM.YYYY HH:MM:SS */
  timestamp: string
  amount_czk: number
  createdAt: string
  shiftId: string
}

/** Locked 30-day archive dump after Uzavřít směnu. */
export interface WaiterPayrollArchiveBundle {
  id: string
  archivedAt: string
  expiresAt: string
  shiftId: string
  project_id: string
  venueName: string
  managerName: string
  logs: WaiterAuditLog[]
  revenueTotal: number
}

export interface WaiterPerformanceRow {
  waiter_name: string
  actionCount: number
  totalRevenueCzk: number
  performancePercent: number
}

type WaiterAuditState = {
  /** Active shift stream — shown in Uzávěrka & Směna */
  waiter_audit_logs: WaiterAuditLog[]
  /** Locked 30-day repository */
  payroll_archive: WaiterPayrollArchiveBundle[]

  logWaiterAction: (opts: {
    project_id?: string | null
    waiter_name?: string | null
    waiter_id?: string | null
    action_description: string
    amount_czk?: number
  }) => WaiterAuditLog

  /** Dump active logs into payroll_archive, purge >30 days, clear live stream. */
  archiveShiftLogs: (opts: {
    project_id?: string | null
    venueName?: string
    managerName?: string
    revenueTotal?: number
  }) => WaiterPayrollArchiveBundle | null

  purgeExpiredArchive: () => void

  /** Performance % from active shift logs (sales-like positive amounts). */
  computePerformance: (shiftRevenueTotal?: number) => WaiterPerformanceRow[]

  clearActiveLogs: () => void
}

const DAY_MS = 24 * 60 * 60 * 1000
const RETENTION_DAYS = 30

function purgeOlderThan30(archive: WaiterPayrollArchiveBundle[]): WaiterPayrollArchiveBundle[] {
  const now = Date.now()
  return (archive ?? []).filter((row) => {
    const exp = new Date(row.expiresAt).getTime()
    if (Number.isFinite(exp)) return exp > now
    const archived = new Date(row.archivedAt).getTime()
    return Number.isFinite(archived) && now - archived < RETENTION_DAYS * DAY_MS
  })
}

export const useWaiterAuditStore = create<WaiterAuditState>()(
  persist(
    (set, get) => ({
      waiter_audit_logs: [],
      payroll_archive: [],

      logWaiterAction: ({
        project_id,
        waiter_name,
        waiter_id,
        action_description,
        amount_czk = 0,
      }) => {
        const shiftId = useShiftFinanceStore.getState().activeShiftId || 'shift_unknown'
        const now = new Date()
        const row: WaiterAuditLog = {
          id: uid('waudit'),
          project_id: project_id || 'global',
          waiter_name: (waiter_name || 'Neznámý číšník').trim() || 'Neznámý číšník',
          waiter_id: waiter_id || undefined,
          action_description: (action_description || 'Úkon').trim(),
          timestamp: formatCzechDateTimeFull(now),
          amount_czk: Math.round(Number(amount_czk) || 0),
          createdAt: now.toISOString(),
          shiftId,
        }
        set((s) => ({
          waiter_audit_logs: [row, ...(s.waiter_audit_logs ?? [])].slice(0, 2000),
        }))
        return row
      },

      archiveShiftLogs: ({ project_id, venueName, managerName, revenueTotal }) => {
        const logs = [...(get().waiter_audit_logs ?? [])]
        const shiftId =
          useShiftFinanceStore.getState().activeShiftId || logs[0]?.shiftId || uid('shift')
        if (!logs.length) {
          set((s) => ({
            payroll_archive: purgeOlderThan30(s.payroll_archive ?? []),
          }))
          return null
        }
        const archivedAt = new Date()
        const expiresAt = new Date(archivedAt.getTime() + RETENTION_DAYS * DAY_MS)
        const bundle: WaiterPayrollArchiveBundle = {
          id: uid('parch'),
          archivedAt: archivedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          shiftId,
          project_id: project_id || logs[0]?.project_id || 'global',
          venueName: venueName || 'EventFlow',
          managerName: managerName || 'Vedoucí směny',
          logs,
          revenueTotal: Math.round(Number(revenueTotal) || 0),
        }
        set((s) => ({
          waiter_audit_logs: [],
          payroll_archive: purgeOlderThan30([bundle, ...(s.payroll_archive ?? [])]).slice(
            0,
            120,
          ),
        }))
        return bundle
      },

      purgeExpiredArchive: () => {
        set((s) => ({
          payroll_archive: purgeOlderThan30(s.payroll_archive ?? []),
        }))
      },

      computePerformance: (shiftRevenueTotal) => {
        const logs = get().waiter_audit_logs ?? []
        const byName = new Map<string, WaiterPerformanceRow>()
        for (const log of logs) {
          const key = log.waiter_name || 'Neznámý číšník'
          const prev = byName.get(key) || {
            waiter_name: key,
            actionCount: 0,
            totalRevenueCzk: 0,
            performancePercent: 0,
          }
          prev.actionCount += 1
          // Count generated CZK from payments / online checkout only (avoid double-count adds)
          const salesLike =
            log.amount_czk > 0 &&
            /platba|zaplaceno|online objednávka/i.test(log.action_description || '')
          if (salesLike) prev.totalRevenueCzk += log.amount_czk
          byName.set(key, prev)
        }
        const rows = Array.from(byName.values())
        // Fallback: if no payment rows yet, use positive item volume for ranking preview
        if (rows.every((r) => r.totalRevenueCzk === 0)) {
          for (const log of logs) {
            if (log.amount_czk <= 0) continue
            const key = log.waiter_name || 'Neznámý číšník'
            const row = byName.get(key)
            if (row) row.totalRevenueCzk += log.amount_czk
          }
        }
        const revenueSum =
          shiftRevenueTotal != null && shiftRevenueTotal > 0
            ? shiftRevenueTotal
            : rows.reduce((s, r) => s + r.totalRevenueCzk, 0)
        for (const row of rows) {
          // (Total CZK generated by Waiter X / Total Shift Revenue) × 100
          row.performancePercent =
            revenueSum > 0
              ? Math.round((row.totalRevenueCzk / revenueSum) * 1000) / 10
              : 0
        }
        return rows.sort((a, b) => b.totalRevenueCzk - a.totalRevenueCzk)
      },

      clearActiveLogs: () => set({ waiter_audit_logs: [] }),
    }),
    {
      name: 'eventflow-waiter-audit-v1',
      partialize: (s) => ({
        waiter_audit_logs: s.waiter_audit_logs,
        payroll_archive: s.payroll_archive,
      }),
      onRehydrateStorage: () => (state) => {
        state?.purgeExpiredArchive()
      },
    },
  ),
)
