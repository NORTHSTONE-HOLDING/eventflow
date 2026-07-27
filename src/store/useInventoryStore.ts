import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InventoryItem } from '../lib/types'
import { applyAiCommand, seedInventory } from '../lib/inventory'

export interface StockDeduction {
  inventoryId: string
  servingSize: number
}

interface InventoryState {
  items: InventoryItem[]
  addItem: (item: InventoryItem) => void
  updateItem: (id: string, patch: Partial<InventoryItem>) => void
  deleteItem: (id: string) => void
  togglePosVisible: (id: string) => void
  importItems: (items: InventoryItem[]) => void
  runCommand: (command: string) => string
  deductForSale: (deductions: StockDeduction[]) => void
  lowStock: () => InventoryItem[]
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      items: seedInventory(),

      addItem: (item) => set((s) => ({ items: [item, ...s.items] })),

      updateItem: (id, patch) =>
        set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })),

      deleteItem: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),

      togglePosVisible: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, isPosVisible: !it.isPosVisible } : it,
          ),
        })),

      importItems: (items) => set((s) => ({ items: [...items, ...s.items] })),

      runCommand: (command) => {
        const { items, message } = applyAiCommand(get().items, command)
        set({ items })
        return message
      },

      deductForSale: (deductions) =>
        set((s) => {
          const map = new Map<string, number>()
          for (const d of deductions) {
            if (d.servingSize <= 0) continue
            map.set(d.inventoryId, (map.get(d.inventoryId) ?? 0) + d.servingSize)
          }
          if (map.size === 0) return {}
          return {
            items: s.items.map((it) => {
              const dec = map.get(it.id)
              if (!dec) return it
              return { ...it, stockQty: Math.max(0, Number((it.stockQty - dec).toFixed(3))) }
            }),
          }
        }),

      lowStock: () => get().items.filter((it) => it.minQty > 0 && it.stockQty <= it.minQty),
    }),
    { name: 'eventflow-inventory', partialize: (s) => ({ items: s.items }) },
  ),
)
