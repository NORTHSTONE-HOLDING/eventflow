import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Camera, CctvEvent } from '../lib/types'
import { DEFAULT_CAMERAS } from '../lib/constants'
import { uid } from '../lib/format'

interface CctvState {
  cameras: Camera[]
  events: CctvEvent[]
  redAlert: CctvEvent | null
  updateCamera: (id: string, patch: Partial<Pick<Camera, 'ip' | 'zone' | 'name'>>) => void
  simulateEscape: () => void
  dismissAlert: () => void
  clearEvents: () => void
}

export const useCctvStore = create<CctvState>()(
  persist(
    (set) => ({
  cameras: DEFAULT_CAMERAS.map((c) => ({ ...c })),
  events: [],
  redAlert: null,

  updateCamera: (id, patch) =>
    set((s) => ({
      cameras: s.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  simulateEscape: () =>
    set((s) => {
      const cam = s.cameras[0]
      const event: CctvEvent = {
        id: uid('evt'),
        ts: Date.now(),
        cameraId: cam.id,
        cameraName: cam.name,
        message: 'DETEKCE: Podezření na útěk bez zaplacení (odchod bez úhrady účtu).',
        level: 'red',
      }
      return {
        cameras: s.cameras.map((c) => (c.id === cam.id ? { ...c, alert: true } : c)),
        events: [event, ...s.events].slice(0, 100),
        redAlert: event,
      }
    }),

  dismissAlert: () =>
    set((s) => ({
      redAlert: null,
      cameras: s.cameras.map((c) => (c.id === s.redAlert?.cameraId ? { ...c, alert: false } : c)),
    })),

  clearEvents: () => set({ events: [] }),
    }),
    {
      name: 'eventflow-cctv',
      partialize: (s) => ({ cameras: s.cameras, events: s.events, redAlert: s.redAlert }),
    },
  ),
)
