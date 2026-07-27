import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { KdsTicket, KitchenStatus, Station } from '../lib/types'
import { uid } from '../lib/format'

export interface StaffAlert {
  id: string
  ts: number
  message: string
}

interface KdsState {
  tickets: KdsTicket[]
  alerts: StaffAlert[]
  pushTicket: (ticket: KdsTicket) => void
  setItemStatus: (ticketId: string, itemId: string, status: KitchenStatus) => void
  removeTicket: (ticketId: string) => void
  dismissAlert: (id: string) => void
  ticketsFor: (station: Station) => KdsTicket[]
  clearHistory: () => void
}

export const useKdsStore = create<KdsState>()(
  persist(
    (set, get) => ({
  tickets: [],
  alerts: [],

  pushTicket: (ticket) => set((s) => ({ tickets: [...s.tickets, ticket] })),

  setItemStatus: (ticketId, itemId, status) =>
    set((s) => {
      let alertMsg: string | null = null
      const tickets = s.tickets.map((t) => {
        if (t.id !== ticketId) return t
        const items = t.items.map((it) => {
          if (it.id !== itemId) return it
          if (status === 'hotovo') {
            alertMsg = `✅ ${it.name} — ${t.tableName} je HOTOVO / VYDÁNO`
          }
          return { ...it, status }
        })
        return { ...t, items }
      })
      const alerts = alertMsg
        ? [{ id: uid('alert'), ts: Date.now(), message: alertMsg }, ...s.alerts].slice(0, 6)
        : s.alerts
      return { tickets, alerts }
    }),

  removeTicket: (ticketId) =>
    set((s) => ({ tickets: s.tickets.filter((t) => t.id !== ticketId) })),

  dismissAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

  ticketsFor: (station) => get().tickets.filter((t) => t.station === station),

  clearHistory: () => set({ tickets: [], alerts: [] }),
    }),
    {
      name: 'eventflow-kds',
      partialize: (s) => ({ tickets: s.tickets, alerts: s.alerts }),
    },
  ),
)
