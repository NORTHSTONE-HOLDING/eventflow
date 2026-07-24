import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BUILTIN_INVENTORY_CATEGORIES,
  createCustomCategoryDef,
  findCategoryDef,
  mergeCategoryLists,
  resolveInventoryCategoryId,
  type InventoryCategoryDef,
} from '../lib/inventoryCategories'
import { normalizeName } from '../lib/inventoryModels'

type CategoryRegistryState = {
  customCategories: InventoryCategoryDef[]
  getAllCategories: () => InventoryCategoryDef[]
  getCategoryOptions: () => Array<{ value: string; label: string }>
  addCustomCategory: (
    label: string,
  ) => { ok: boolean; category?: InventoryCategoryDef; error?: string }
  ensureCategoryFromLabel: (label: string) => InventoryCategoryDef
  resolveCategoryId: (raw: string) => string
  removeCustomCategory: (id: string) => void
}

export const useCategoryRegistryStore = create<CategoryRegistryState>()(
  persist(
    (set, get) => ({
      customCategories: [],

      getAllCategories: () => mergeCategoryLists(get().customCategories),

      getCategoryOptions: () =>
        get()
          .getAllCategories()
          .map((c) => ({ value: c.id, label: c.label })),

      addCustomCategory: (label) => {
        const trimmed = label.trim()
        if (!trimmed) {
          return { ok: false, error: 'Zadejte název nové kategorie' }
        }
        const all = get().getAllCategories()
        const existing = findCategoryDef(all, trimmed)
        if (existing) {
          return {
            ok: true,
            category: existing,
            error: existing.builtin
              ? 'Tato kategorie již existuje v systému'
              : 'Kategorie je již registrována',
          }
        }
        const neu = createCustomCategoryDef(trimmed)
        // Avoid id collision
        if (all.some((c) => c.id === neu.id)) {
          neu.id = `${neu.id}_${Date.now().toString(36)}`
        }
        set((state) => ({
          customCategories: [...state.customCategories, neu],
        }))
        return { ok: true, category: neu }
      },

      ensureCategoryFromLabel: (label) => {
        const trimmed = label.trim()
        const all = get().getAllCategories()
        const existing = findCategoryDef(all, trimmed)
        if (existing) return existing
        const res = get().addCustomCategory(trimmed)
        return res.category || createCustomCategoryDef(trimmed)
      },

      resolveCategoryId: (raw) =>
        resolveInventoryCategoryId(raw, get().getAllCategories()),

      removeCustomCategory: (id) => {
        set((state) => ({
          customCategories: state.customCategories.filter(
            (c) => c.id !== id && !c.builtin,
          ),
        }))
      },
    }),
    {
      name: 'eventflow-category-registry-v1',
      partialize: (state) => ({ customCategories: state.customCategories }),
      merge: (persisted, current) => {
        const p = persisted as Partial<CategoryRegistryState> | undefined
        const custom = Array.isArray(p?.customCategories)
          ? p!.customCategories!.filter(
              (c) => c && typeof c.id === 'string' && typeof c.label === 'string',
            )
          : []
        return {
          ...current,
          ...p,
          customCategories: custom,
        }
      },
    },
  ),
)

/** Non-hook access for importer / AI parsers. */
export function getRegistryCategories(): InventoryCategoryDef[] {
  return useCategoryRegistryStore.getState().getAllCategories()
}

export function registerCategoryFromImportLabel(label: string): string {
  const store = useCategoryRegistryStore.getState()
  const cat = store.ensureCategoryFromLabel(label)
  return cat.id
}

export function matchItemToCategoryToken(
  item: { category: string; subcategory: string; name: string; warehouse_section?: string },
  token: string,
): boolean {
  const t = normalizeName(token)
  if (!t) return true
  const categories = getRegistryCategories()
  const cat = findCategoryDef(categories, token)
  if (cat) {
    return (
      item.category === cat.id ||
      normalizeName(item.category) === normalizeName(cat.label) ||
      cat.aliases.some((a) => normalizeName(a) === normalizeName(item.category))
    )
  }

  const blob = normalizeName(
    `${item.category} ${item.subcategory} ${item.name} ${item.warehouse_section || ''}`,
  )

  if (t.includes('piti') || t.includes('napoj') || t.includes('bar') || t.includes('drink')) {
    return item.category === 'beverage' || /pivo|vino|rum|vodka|cola|prosecco|gin|whisky/.test(blob)
  }
  if (t.includes('jidlo') || t.includes('food') || t.includes('kuchy')) {
    return item.category === 'raw' || item.category === 'food'
  }
  if (t.includes('inventar')) return item.category === 'package'
  if (t.includes('technik') || t === 'tech' || t.includes('ozvuc') || t.includes('osvetl')) {
    return item.category === 'tech'
  }
  if (t.includes('vino')) return /vino|prosecco|sekt/.test(blob)
  if (t.includes('koktejl') || t.includes('cocktail') || t.includes('alkohol')) {
    return (
      item.category === 'beverage' &&
      (/rum|gin|vodka|whisky|limet|mata|mint|prosecco|destil|alkohol|koktejl/.test(blob) ||
        ['alkohol', 'destilaty', 'koktejly'].includes(item.subcategory))
    )
  }

  // Custom category label substring
  for (const c of categories) {
    if (!c.builtin && (t.includes(normalizeName(c.label)) || normalizeName(c.label).includes(t))) {
      return item.category === c.id
    }
  }

  if (t.length >= 3) return blob.includes(t)
  return true
}

export { BUILTIN_INVENTORY_CATEGORIES }
