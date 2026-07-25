import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PosSpace, ShiftClosureRecord } from '../types'
import { uid } from '../lib/documentIds'

const DEFAULT_SPACES: PosSpace[] = [
  { id: 'space_salon', name: 'Salonek', sort: 0, createdAt: new Date().toISOString() },
  { id: 'space_garden', name: 'Zahrádka', sort: 1, createdAt: new Date().toISOString() },
  { id: 'space_main', name: 'Hlavní sál', sort: 2, createdAt: new Date().toISOString() },
]

type PosSpaceState = {
  spaces: PosSpace[]
  activeSpaceId: string
  closures: ShiftClosureRecord[]
  setActiveSpace: (id: string) => void
  addSpace: (name: string) => PosSpace
  removeSpace: (id: string) => { ok: boolean; error?: string }
  renameSpace: (id: string, name: string) => void
  getSpaceName: (id: string | null | undefined) => string
  addClosure: (row: ShiftClosureRecord) => void
}

export const usePosSpaceStore = create<PosSpaceState>()(
  persist(
    (set, get) => ({
      spaces: DEFAULT_SPACES,
      activeSpaceId: DEFAULT_SPACES[0].id,
      closures: [],

      setActiveSpace: (id) => {
        if (get().spaces.some((s) => s.id === id)) set({ activeSpaceId: id })
      },

      addSpace: (name) => {
        const trimmed = name.trim() || `Prostor ${get().spaces.length + 1}`
        const space: PosSpace = {
          id: uid('space'),
          name: trimmed,
          sort: get().spaces.length,
          createdAt: new Date().toISOString(),
        }
        set({ spaces: [...get().spaces, space], activeSpaceId: space.id })
        return space
      },

      removeSpace: (id) => {
        const list = get().spaces
        if (list.length <= 1) {
          return { ok: false, error: 'Musí zůstat alespoň jeden prostor.' }
        }
        const next = list.filter((s) => s.id !== id)
        set({
          spaces: next,
          activeSpaceId:
            get().activeSpaceId === id ? next[0].id : get().activeSpaceId,
        })
        return { ok: true }
      },

      renameSpace: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set({
          spaces: get().spaces.map((s) =>
            s.id === id ? { ...s, name: trimmed } : s,
          ),
        })
      },

      getSpaceName: (id) =>
        get().spaces.find((s) => s.id === id)?.name || 'Prostor',

      addClosure: (row) =>
        set({ closures: [row, ...get().closures].slice(0, 200) }),
    }),
    {
      name: 'eventflow-pos-spaces-v1',
      partialize: (s) => ({
        spaces: s.spaces,
        activeSpaceId: s.activeSpaceId,
        closures: s.closures,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PosSpaceState> | undefined
        const spaces =
          Array.isArray(p?.spaces) && p!.spaces!.length > 0
            ? p!.spaces!
            : DEFAULT_SPACES
        const active =
          p?.activeSpaceId && spaces.some((s) => s.id === p.activeSpaceId)
            ? p.activeSpaceId!
            : spaces[0].id
        return {
          ...current,
          spaces,
          activeSpaceId: active,
          closures: Array.isArray(p?.closures) ? p!.closures! : [],
        }
      },
    },
  ),
)
