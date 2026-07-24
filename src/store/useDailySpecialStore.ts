import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InventoryItem, RecipeIngredientRecord } from '../types'
import {
  isSpecialActiveToday,
  localCalendarDate,
  parseDailySpecialText,
  type DailySpecial,
  type DailySpecialParseResult,
} from '../lib/dailySpecials'
import { DEFAULT_USER_ID, normalizeUnit } from '../lib/inventoryModels'
import { uid } from '../lib/documentIds'
import { useInventoryStore } from './useInventoryStore'

type DailySpecialState = {
  specials: DailySpecial[]
  lastPurgeDate: string | null
  purgeExpired: () => number
  addFromText: (
    text: string,
    inventory?: InventoryItem[],
  ) => Promise<DailySpecialParseResult>
  removeSpecial: (id: string) => void
  clearToday: () => void
  getActiveSpecials: () => DailySpecial[]
  bumpSold: (id: string, qty: number) => void
}

function specialToRecipeRecords(special: DailySpecial): RecipeIngredientRecord[] {
  const now = new Date().toISOString()
  return (special.ingredients || []).map((ing) => ({
    id: uid('ri'),
    catering_id: special.id,
    catering_name: special.name,
    inventory_item_id: ing.inventoryItemId ?? null,
    ingredient_name: ing.name,
    qty_per_portion: ing.qtyPerPortion,
    unit: normalizeUnit(ing.unit),
    user_id: DEFAULT_USER_ID,
    updated_at: now,
  }))
}

export const useDailySpecialStore = create<DailySpecialState>()(
  persist(
    (set, get) => ({
      specials: [],
      lastPurgeDate: null,

      purgeExpired: () => {
        const today = localCalendarDate()
        const before = get().specials
        const active = before.filter((s) => isSpecialActiveToday(s))
        const removed = before.length - active.length
        if (removed > 0 || get().lastPurgeDate !== today) {
          set({ specials: active, lastPurgeDate: today })
        }
        return removed
      },

      getActiveSpecials: () => {
        get().purgeExpired()
        return get().specials.filter((s) => isSpecialActiveToday(s))
      },

      addFromText: async (text, inventory) => {
        get().purgeExpired()
        const stock =
          inventory ?? useInventoryStore.getState().items.map((i) => i)
        const result = await parseDailySpecialText(text, stock)
        if (!result.ok || !result.special) return result

        const special = result.special
        const key = special.name.trim().toLowerCase()
        const existing = get().specials.find(
          (s) =>
            isSpecialActiveToday(s) && s.name.trim().toLowerCase() === key,
        )
        const saved: DailySpecial = existing
          ? {
              ...special,
              id: existing.id,
              soldPortions: existing.soldPortions,
            }
          : special

        if (existing) {
          set({
            specials: get().specials.map((s) =>
              s.id === existing.id ? saved : s,
            ),
          })
        } else {
          set({ specials: [saved, ...get().specials] })
        }

        const recipes = specialToRecipeRecords(saved)
        if (recipes.length) {
          const invStore = useInventoryStore.getState()
          const without = (invStore.recipes ?? []).filter(
            (r) => r.catering_id !== saved.id,
          )
          useInventoryStore.setState({
            recipes: [...recipes, ...without].slice(0, 2000),
          })
        }

        return {
          ...result,
          special: saved,
          message: `${result.message} · dlaždice je aktivní v Kase do půlnoci`,
        }
      },

      removeSpecial: (id) => {
        set({ specials: get().specials.filter((s) => s.id !== id) })
        const invStore = useInventoryStore.getState()
        useInventoryStore.setState({
          recipes: (invStore.recipes ?? []).filter((r) => r.catering_id !== id),
        })
      },

      clearToday: () => {
        const ids = new Set(get().specials.map((s) => s.id))
        set({ specials: [], lastPurgeDate: localCalendarDate() })
        const invStore = useInventoryStore.getState()
        useInventoryStore.setState({
          recipes: (invStore.recipes ?? []).filter((r) => !ids.has(r.catering_id)),
        })
      },

      bumpSold: (id, qty) => {
        set({
          specials: get().specials.map((s) =>
            s.id === id
              ? { ...s, soldPortions: (s.soldPortions || 0) + qty }
              : s,
          ),
        })
      },
    }),
    {
      name: 'eventflow-daily-specials-v1',
      partialize: (state) => ({
        specials: state.specials,
        lastPurgeDate: state.lastPurgeDate,
      }),
      onRehydrateStorage: () => (state) => {
        state?.purgeExpired()
      },
    },
  ),
)
