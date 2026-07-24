import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_CCTV_CAMERAS,
  publishSecurityAlert,
  simulateWalkoutDetection,
  type CctvCamera,
  type CctvWalkoutAlert,
} from '../lib/cctvEngine'
import type { PosOrder, PosTableTab } from '../types'

interface CctvState {
  cameras: CctvCamera[]
  alerts: CctvWalkoutAlert[]
  monitoring: boolean

  setCameraStatus: (id: string, status: CctvCamera['status']) => void
  setMonitoring: (on: boolean) => void
  pushAlert: (alert: CctvWalkoutAlert) => void
  acknowledgeAlert: (id: string) => void
  clearAcknowledged: () => void
  runWalkoutSimulation: (opts: {
    tables: PosTableTab[]
    orders: PosOrder[]
    projectId: string
  }) => CctvWalkoutAlert | null
}

export const useCctvStore = create<CctvState>()(
  persist(
    (set, get) => ({
      cameras: DEFAULT_CCTV_CAMERAS,
      alerts: [],
      monitoring: true,

      setCameraStatus: (id, status) =>
        set((s) => ({
          cameras: s.cameras.map((c) => (c.id === id ? { ...c, status } : c)),
        })),

      setMonitoring: (on) => set({ monitoring: on }),

      pushAlert: (alert) =>
        set((s) => ({
          alerts: [alert, ...s.alerts.filter((a) => a.id !== alert.id)].slice(0, 50),
          cameras: s.cameras.map((c) =>
            c.id === alert.cameraId ? { ...c, status: 'alert' as const } : c
          ),
        })),

      acknowledgeAlert: (id) =>
        set((s) => {
          const alert = s.alerts.find((a) => a.id === id)
          return {
            alerts: s.alerts.map((a) =>
              a.id === id ? { ...a, acknowledged: true } : a
            ),
            cameras: s.cameras.map((c) =>
              alert && c.id === alert.cameraId && c.status === 'alert'
                ? { ...c, status: 'online' as const }
                : c
            ),
          }
        }),

      clearAcknowledged: () =>
        set((s) => ({
          alerts: s.alerts.filter((a) => !a.acknowledged),
        })),

      runWalkoutSimulation: ({ tables, orders, projectId }) => {
        if (!get().monitoring) return null
        const alert = simulateWalkoutDetection({
          cameras: get().cameras,
          tables,
          orders,
          projectId,
        })
        if (!alert) return null
        get().pushAlert(alert)
        publishSecurityAlert(alert)
        return alert
      },
    }),
    {
      name: 'eventflow-cctv',
      partialize: (s) => ({
        cameras: s.cameras,
        alerts: s.alerts.slice(0, 20),
        monitoring: s.monitoring,
      }),
    }
  )
)
