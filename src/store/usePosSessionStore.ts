import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PosOperationMode, PosWaiterProfile, PosWaiterWorkspace } from '../types'
import { uid } from '../lib/documentIds'

export const DEFAULT_WAITERS: PosWaiterProfile[] = [
  { id: 'waiter_anna', name: 'Anna Horáková', role: 'Číšník', color: '#D4AF37' },
  { id: 'waiter_jan', name: 'Jan Novák', role: 'Číšník', color: '#34d399' },
  { id: 'waiter_eva', name: 'Eva Svobodová', role: 'Barman', color: '#60a5fa' },
  { id: 'waiter_petr', name: 'Petr Dvořák', role: 'Vedoucí směny', color: '#f472b6' },
]

export interface WaiterReadyAlert {
  id: string
  ticketId: string
  orderNumber: string
  tableLabel: string
  station: 'kitchen' | 'bar'
  waiterId: string
  message: string
  createdAt: string
  seen: boolean
}

export interface SecurityFlashAlert {
  id: string
  message: string
  tableLabel: string
  createdAt: string
  seen: boolean
}

interface PosSessionState {
  waiters: PosWaiterProfile[]
  activeWaiterId: string
  workspaces: Record<string, PosWaiterWorkspace>
  readyAlerts: WaiterReadyAlert[]
  securityAlerts: SecurityFlashAlert[]
  deviceId: string
  /** Hybrid / restaurant / event POS layout mode */
  operationMode: PosOperationMode

  getActiveWaiter: () => PosWaiterProfile
  setActiveWaiter: (waiterId: string) => void
  getWorkspaceTableId: () => string | null
  setWorkspaceTableId: (tableId: string | null) => void
  pushReadyAlert: (alert: Omit<WaiterReadyAlert, 'id' | 'createdAt' | 'seen'>) => void
  dismissReadyAlert: (id: string) => void
  clearSeenAlerts: () => void
  pushSecurityAlert: (alert: Omit<SecurityFlashAlert, 'id' | 'createdAt' | 'seen'>) => void
  dismissSecurityAlert: (id: string) => void
  setOperationMode: (mode: PosOperationMode) => void
}

function ensureWorkspace(
  workspaces: Record<string, PosWaiterWorkspace>,
  waiterId: string
): Record<string, PosWaiterWorkspace> {
  if (workspaces[waiterId]) return workspaces
  return {
    ...workspaces,
    [waiterId]: {
      waiterId,
      activeTableId: null,
      orderLogIds: [],
      updatedAt: new Date().toISOString(),
    },
  }
}

export const usePosSessionStore = create<PosSessionState>()(
  persist(
    (set, get) => ({
      waiters: DEFAULT_WAITERS,
      activeWaiterId: DEFAULT_WAITERS[0].id,
      workspaces: {},
      readyAlerts: [],
      securityAlerts: [],
      deviceId: uid('device'),
      operationMode: 'hybrid',

      getActiveWaiter: () => {
        const s = get()
        return (
          s.waiters.find((w) => w.id === s.activeWaiterId) ||
          s.waiters[0] ||
          DEFAULT_WAITERS[0]
        )
      },

      setActiveWaiter: (waiterId) => {
        set((s) => ({
          activeWaiterId: waiterId,
          workspaces: ensureWorkspace(s.workspaces, waiterId),
        }))
      },

      getWorkspaceTableId: () => {
        const s = get()
        const ws = s.workspaces[s.activeWaiterId]
        return ws?.activeTableId ?? null
      },

      setWorkspaceTableId: (tableId) => {
        set((s) => {
          const workspaces = ensureWorkspace(s.workspaces, s.activeWaiterId)
          return {
            workspaces: {
              ...workspaces,
              [s.activeWaiterId]: {
                ...workspaces[s.activeWaiterId],
                activeTableId: tableId,
                updatedAt: new Date().toISOString(),
              },
            },
          }
        })
      },

      pushReadyAlert: (alert) => {
        const entry: WaiterReadyAlert = {
          ...alert,
          id: uid('alert'),
          createdAt: new Date().toISOString(),
          seen: false,
        }
        set((s) => ({
          readyAlerts: [entry, ...s.readyAlerts].slice(0, 40),
        }))
      },

      dismissReadyAlert: (id) =>
        set((s) => ({
          readyAlerts: s.readyAlerts.map((a) =>
            a.id === id ? { ...a, seen: true } : a
          ),
        })),

      clearSeenAlerts: () =>
        set((s) => ({
          readyAlerts: s.readyAlerts.filter((a) => !a.seen),
        })),

      pushSecurityAlert: (alert) => {
        const entry: SecurityFlashAlert = {
          ...alert,
          id: uid('sec'),
          createdAt: new Date().toISOString(),
          seen: false,
        }
        set((s) => ({
          securityAlerts: [entry, ...s.securityAlerts].slice(0, 30),
        }))
      },

      dismissSecurityAlert: (id) =>
        set((s) => ({
          securityAlerts: s.securityAlerts.map((a) =>
            a.id === id ? { ...a, seen: true } : a
          ),
        })),

      setOperationMode: (mode) => set({ operationMode: mode }),
    }),
    {
      name: 'eventflow-pos-session',
      partialize: (s) => ({
        waiters: s.waiters,
        activeWaiterId: s.activeWaiterId,
        workspaces: s.workspaces,
        deviceId: s.deviceId,
        operationMode: s.operationMode,
        readyAlerts: s.readyAlerts.slice(0, 20),
        securityAlerts: s.securityAlerts.slice(0, 15),
      }),
    }
  )
)
