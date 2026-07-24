import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  fetchProductImageUrl,
  readImageFileAsDataUrl,
  uploadProductImage,
} from '../lib/productImages'
import { DEFAULT_USER_ID, normalizeName } from '../lib/inventoryModels'
import type { InventoryItem } from '../types'

type ProductImageStore = {
  /** Klíč = inventory/product id nebo normalizovaný název položky. */
  byKey: Record<string, string>
  fetching: Record<string, boolean>
  setImage: (key: string, url: string, productName?: string) => void
  clearImage: (key: string) => void
  isFetching: (key: string) => boolean
  getImage: (key: string, name?: string) => string | null
  ensureAiImage: (
    item: Pick<InventoryItem, 'id' | 'name' | 'category' | 'image_url'>,
  ) => Promise<string | null>
  saveManualImage: (
    item: Pick<InventoryItem, 'id' | 'name' | 'user_id'>,
    file: File,
  ) => Promise<string | null>
}

export function productNameKey(name: string): string {
  return `name:${normalizeName(name)}`
}

export const useProductImageStore = create<ProductImageStore>()(
  persist(
    (set, get) => ({
      byKey: {},
      fetching: {},

      setImage: (key, url, productName) =>
        set((state) => {
          const byKey = { ...state.byKey, [key]: url }
          if (productName) {
            byKey[productNameKey(productName)] = url
          }
          return { byKey }
        }),

      clearImage: (key) =>
        set((state) => {
          const next = { ...state.byKey }
          delete next[key]
          return { byKey: next }
        }),

      isFetching: (key) => Boolean(get().fetching[key]),

      getImage: (key, name) => {
        const map = get().byKey
        if (map[key]) return map[key]
        if (name) {
          const nk = productNameKey(name)
          if (map[nk]) return map[nk]
        }
        return null
      },

      ensureAiImage: async (item) => {
        const idKey = item.id
        const nk = productNameKey(item.name)
        const existing =
          get().byKey[idKey] || get().byKey[nk] || item.image_url || null
        if (existing) {
          set((state) => ({
            byKey: {
              ...state.byKey,
              [idKey]: existing,
              [nk]: existing,
            },
          }))
          return existing
        }

        if (get().fetching[idKey] || get().fetching[nk]) {
          return null
        }

        set((state) => ({
          fetching: { ...state.fetching, [idKey]: true, [nk]: true },
        }))

        try {
          const url = await fetchProductImageUrl(item.name, item.category)
          if (url) {
            set((state) => ({
              byKey: {
                ...state.byKey,
                [idKey]: url,
                [nk]: url,
              },
              fetching: {
                ...state.fetching,
                [idKey]: false,
                [nk]: false,
              },
            }))
            return url
          }
          set((state) => ({
            fetching: {
              ...state.fetching,
              [idKey]: false,
              [nk]: false,
            },
          }))
          return null
        } catch {
          set((state) => ({
            fetching: {
              ...state.fetching,
              [idKey]: false,
              [nk]: false,
            },
          }))
          return null
        }
      },

      saveManualImage: async (item, file) => {
        const idKey = item.id
        const nk = productNameKey(item.name)
        set((state) => ({
          fetching: { ...state.fetching, [idKey]: true, [nk]: true },
        }))
        try {
          const dataUrl = await readImageFileAsDataUrl(file)
          const result = await uploadProductImage({
            userId: item.user_id || DEFAULT_USER_ID,
            productId: item.id,
            dataUrl,
          })
          const url = result.url || dataUrl
          set((state) => ({
            byKey: {
              ...state.byKey,
              [idKey]: url,
              [nk]: url,
            },
            fetching: {
              ...state.fetching,
              [idKey]: false,
              [nk]: false,
            },
          }))
          return url
        } catch {
          set((state) => ({
            fetching: {
              ...state.fetching,
              [idKey]: false,
              [nk]: false,
            },
          }))
          return null
        }
      },
    }),
    {
      name: 'eventflow-product-images-v1',
      partialize: (state) => ({ byKey: state.byKey }),
    },
  ),
)

/** Synchronní lookup pro POS dlaždice — reaguje přes subscribe/persist. */
export function resolveProductImageUrl(
  productId: string | undefined,
  productName: string,
  explicitUrl?: string | null,
): string | null {
  if (explicitUrl) return explicitUrl
  const store = useProductImageStore.getState()
  if (productId) {
    const byId = store.byKey[productId]
    if (byId) return byId
  }
  return store.byKey[productNameKey(productName)] || null
}

export function isProductImageFetching(
  productId: string | undefined,
  productName: string,
): boolean {
  const store = useProductImageStore.getState()
  if (productId && store.fetching[productId]) return true
  return Boolean(store.fetching[productNameKey(productName)])
}
