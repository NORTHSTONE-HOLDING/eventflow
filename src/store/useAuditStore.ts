import { create } from 'zustand'
import type { AuditAction, AuditLog } from '../lib/types'
import { uid } from '../lib/format'

export interface WaiterPerformance {
  waiterId: string
  waiterName: string
  actions: number
  revenue: number
  percent: number
}

interface AuditState {
  logs: AuditLog[]
  log: (entry: {
    waiterId: string
    waiterName: string
    action: AuditAction
    detail: string
    amount?: number
  }) => void
  performance: () => WaiterPerformance[]
  clear: () => void
}

export const useAuditStore = create<AuditState>((set, get) => ({
  logs: [],

  log: ({ waiterId, waiterName, action, detail, amount = 0 }) =>
    set((s) => ({
      logs: [
        { id: uid('log'), ts: Date.now(), waiterId, waiterName, action, detail, amount },
        ...s.logs,
      ].slice(0, 400),
    })),

  performance: () => {
    const { logs } = get()
    const map = new Map<string, WaiterPerformance>()
    for (const l of logs) {
      const cur =
        map.get(l.waiterId) ??
        { waiterId: l.waiterId, waiterName: l.waiterName, actions: 0, revenue: 0, percent: 0 }
      cur.actions += 1
      cur.revenue += l.amount
      map.set(l.waiterId, cur)
    }
    const totalActions = logs.length || 1
    return Array.from(map.values())
      .map((p) => ({ ...p, percent: Math.round((p.actions / totalActions) * 100) }))
      .sort((a, b) => b.actions - a.actions)
  },

  clear: () => set({ logs: [] }),
}))
