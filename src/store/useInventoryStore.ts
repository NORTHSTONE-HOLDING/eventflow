import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CateringItem,
  CloudSyncStatus,
  EventProject,
  InventuraSession,
  InventoryItem,
  InventoryLog,
  InvoiceVisionResult,
  RecipeIngredientRecord,
} from '../types'
import {
  createEmptyInventoryItem,
  createInventoryLog,
  DEFAULT_USER_ID,
  inventuraVarianceValue,
  matchInventoryItem,
  seedDefaultInventory,
  weightedAveragePrice,
  normalizeUnit,
} from '../lib/inventoryModels'
import {
  fetchInventoryLogsRemote,
  fetchInventoryRemote,
  fetchRecipesRemote,
} from '../lib/inventoryCloud'
import {
  getInventorySyncMode,
  probeSupabaseConnection,
  subscribeConnectivity,
  type SyncMode,
} from '../lib/supabase'
import {
  flushOfflineQueue,
  getOfflineQueueSize,
  persistOrQueue,
} from '../lib/offlineQueue'
import {
  buildRecipeRecordsFromCatering,
  resolveRecipeForCatering,
} from '../lib/recipeEngine'
import { uid } from '../lib/documentIds'

interface InventoryState {
  items: InventoryItem[]
  logs: InventoryLog[]
  recipes: RecipeIngredientRecord[]
  syncMode: SyncMode
  cloudStatus: CloudSyncStatus
  pendingQueue: number
  loading: boolean
  error: string | null
  lastSyncedAt: string | null
  inventura: InventuraSession | null
  hydrated: boolean

  setError: (msg: string | null) => void
  bootstrap: () => Promise<void>
  refreshFromCloud: () => Promise<void>
  refreshSyncStatus: () => Promise<void>
  flushQueue: () => Promise<void>
  syncRecipesFromProjects: (projects: EventProject[]) => Promise<void>

  applyInvoiceRestock: (
    invoice: InvoiceVisionResult
  ) => Promise<{ ok: boolean; created: number; updated: number; error?: string }>

  applyPosSaleDeduction: (
    catering: CateringItem | null | undefined,
    qty: number,
    note?: string
  ) => Promise<{ ok: boolean; depleted: string[] }>

  startInventura: (warehouseName?: string) => void
  setInventuraCount: (itemId: string, actual: number | null) => void
  highlightByBarcode: (barcode: string) => InventoryItem | null
  closeInventura: () => Promise<{
    ok: boolean
    mankoValue: number
    prebytekValue: number
    error?: string
  }>
  clearInventura: () => void
}

async function persistItem(item: InventoryItem) {
  await persistOrQueue('inventory_upsert', item)
}

async function persistLog(log: InventoryLog) {
  await persistOrQueue('inventory_log', log)
}

async function persistRecipe(row: RecipeIngredientRecord) {
  await persistOrQueue('recipe_upsert', row)
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      items: [],
      logs: [],
      recipes: [],
      syncMode: getInventorySyncMode(),
      cloudStatus: getInventorySyncMode() === 'online' ? 'synced' : 'local',
      pendingQueue: 0,
      loading: false,
      error: null,
      lastSyncedAt: null,
      inventura: null,
      hydrated: false,

      setError: (msg) => set({ error: msg }),

      refreshSyncStatus: async () => {
        const mode = getInventorySyncMode()
        const pending = getOfflineQueueSize()
        if (mode === 'offline') {
          set({
            syncMode: 'offline',
            cloudStatus: pending > 0 ? 'pending' : 'local',
            pendingQueue: pending,
          })
          return
        }
        const ok = await probeSupabaseConnection()
        set({
          syncMode: ok ? 'online' : 'offline',
          cloudStatus: !ok ? 'error' : pending > 0 ? 'pending' : 'synced',
          pendingQueue: pending,
        })
      },

      flushQueue: async () => {
        const res = await flushOfflineQueue()
        await get().refreshSyncStatus()
        if (res.flushed > 0) {
          set({ lastSyncedAt: new Date().toISOString() })
        }
      },

      bootstrap: async () => {
        const mode = getInventorySyncMode()
        set({ loading: true, error: null, syncMode: mode })
        try {
          if (mode === 'online') {
            const reachable = await probeSupabaseConnection()
            if (reachable) {
              await flushOfflineQueue()
              const remote = await fetchInventoryRemote()
              const recipesRes = await fetchRecipesRemote()
              if (remote.ok && remote.items.length) {
                const logsRes = await fetchInventoryLogsRemote()
                set({
                  items: remote.items,
                  logs: logsRes.ok ? logsRes.logs : get().logs,
                  recipes: recipesRes.ok ? recipesRes.recipes : get().recipes,
                  lastSyncedAt: new Date().toISOString(),
                  loading: false,
                  hydrated: true,
                  cloudStatus: 'synced',
                  pendingQueue: getOfflineQueueSize(),
                })
                return
              }
            }
          }

          const existing = get().items
          if (!existing.length) {
            set({
              items: seedDefaultInventory(),
              loading: false,
              hydrated: true,
              syncMode: mode,
              cloudStatus: mode === 'online' ? 'pending' : 'local',
              pendingQueue: getOfflineQueueSize(),
            })
            return
          }
          set({
            loading: false,
            hydrated: true,
            syncMode: mode,
            cloudStatus: mode === 'online' ? 'synced' : 'local',
            pendingQueue: getOfflineQueueSize(),
          })
        } catch (e) {
          set({
            loading: false,
            hydrated: true,
            error: e instanceof Error ? e.message : 'Nepodařilo se načíst sklad',
            items: get().items.length ? get().items : seedDefaultInventory(),
            syncMode: 'offline',
            cloudStatus: 'local',
            pendingQueue: getOfflineQueueSize(),
          })
        }
      },

      refreshFromCloud: async () => {
        const mode = getInventorySyncMode()
        set({ loading: true, error: null, syncMode: mode })
        if (mode !== 'online') {
          set({
            loading: false,
            error:
              'Chybí Supabase klíče nebo jste offline — běží lokální ochrana dat',
            cloudStatus: 'local',
          })
          return
        }
        const reachable = await probeSupabaseConnection()
        if (!reachable) {
          set({
            loading: false,
            error: 'Cloud je dočasně nedostupný — data zůstávají lokálně chráněna',
            cloudStatus: 'error',
            syncMode: 'offline',
          })
          return
        }
        await flushOfflineQueue()
        const remote = await fetchInventoryRemote()
        if (!remote.ok) {
          set({
            loading: false,
            error: remote.error || 'Synchronizace selhala',
            cloudStatus: 'error',
          })
          return
        }
        const logsRes = await fetchInventoryLogsRemote()
        const recipesRes = await fetchRecipesRemote()
        set({
          items: remote.items.length ? remote.items : get().items,
          logs: logsRes.ok ? logsRes.logs : get().logs,
          recipes: recipesRes.ok ? recipesRes.recipes : get().recipes,
          lastSyncedAt: new Date().toISOString(),
          loading: false,
          cloudStatus: 'synced',
          pendingQueue: getOfflineQueueSize(),
        })
      },

      syncRecipesFromProjects: async (projects) => {
        const inventory = get().items
        const built: RecipeIngredientRecord[] = []
        for (const p of projects ?? []) {
          built.push(
            ...buildRecipeRecordsFromCatering(p.catering ?? [], inventory)
          )
        }
        if (!built.length) return

        const cateringIds = new Set(built.map((r) => r.catering_id))
        const kept = (get().recipes ?? []).filter(
          (r) => !cateringIds.has(r.catering_id)
        )
        const next = [...kept, ...built]
        set({ recipes: next })
        for (const row of built) {
          await persistRecipe(row)
        }
        await get().refreshSyncStatus()
      },

      applyInvoiceRestock: async (invoice) => {
        set({ loading: true, error: null })
        try {
          let items = [...get().items]
          const newLogs: InventoryLog[] = []
          let created = 0
          let updated = 0
          const supplier = invoice.supplier_name || ''

          for (const line of invoice.items ?? []) {
            const existing = matchInventoryItem(items, {
              name: line.name,
              barcode: line.barcode,
              unit: line.unit,
            })
            const qty = Number(line.quantity) || 0
            const price = Number(line.purchase_price_ex_vat) || 0
            if (qty <= 0) continue

            if (existing) {
              const nextQty = existing.current_quantity + qty
              const avg = weightedAveragePrice(
                existing.current_quantity,
                existing.average_price,
                qty,
                price
              )
              const updatedItem: InventoryItem = {
                ...existing,
                current_quantity: Math.round(nextQty * 1000) / 1000,
                purchase_price: price,
                average_price: avg,
                vat_rate: line.vat_rate ?? existing.vat_rate,
                supplier: supplier || existing.supplier,
                barcode: line.barcode || existing.barcode,
                unit: normalizeUnit(line.unit || existing.unit),
                updated_at: new Date().toISOString(),
              }
              items = items.map((i) => (i.id === existing.id ? updatedItem : i))
              const log = createInventoryLog({
                item_id: existing.id,
                type: 'naskladneni',
                quantity_changed: qty,
                note: `Faktura ${invoice.ico} · ${supplier}`,
                unit_price: price,
              })
              newLogs.push(log)
              await persistItem(updatedItem)
              await persistLog(log)
              updated += 1
            } else {
              const neu = createEmptyInventoryItem({
                name: line.name,
                barcode: line.barcode ?? null,
                category: 'raw',
                subcategory: 'ostatni',
                supplier,
                purchase_price: price,
                average_price: price,
                vat_rate: line.vat_rate || 12,
                unit: normalizeUnit(line.unit),
                current_quantity: qty,
                minimum_quantity: 0,
                warehouse_section: 'Příjem zboží',
              })
              items = [...items, neu]
              const log = createInventoryLog({
                item_id: neu.id,
                type: 'naskladneni',
                quantity_changed: qty,
                note: `Nová položka · faktura ${invoice.ico}`,
                unit_price: price,
              })
              newLogs.push(log)
              await persistItem(neu)
              await persistLog(log)
              created += 1
            }
          }

          set({
            items,
            logs: [...newLogs, ...get().logs].slice(0, 300),
            loading: false,
            lastSyncedAt: new Date().toISOString(),
          })
          await get().refreshSyncStatus()
          return { ok: true, created, updated }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Naskladnění selhalo'
          set({ loading: false, error: msg })
          return { ok: false, created: 0, updated: 0, error: msg }
        }
      },

      applyPosSaleDeduction: async (catering, qty, note) => {
        if (!catering || qty <= 0) return { ok: true, depleted: [] }
        let items = [...get().items]
        const recipes = get().recipes ?? []
        const newLogs: InventoryLog[] = []
        const depleted: string[] = []

        const resolved = resolveRecipeForCatering(catering, recipes, items)

        const consumeById = async (
          itemId: string | null | undefined,
          amount: number,
          fallbackName: string,
          unit: string
        ) => {
          if (amount <= 0) return
          const target =
            (itemId && items.find((i) => i.id === itemId)) ||
            matchInventoryItem(items, { name: fallbackName, unit })
          if (!target) return

          const deduct = Math.round(amount * 1000) / 1000
          const nextQty = Math.max(
            0,
            Math.round((target.current_quantity - deduct) * 1000) / 1000
          )
          if (nextQty <= target.minimum_quantity) depleted.push(target.name)
          const updatedItem: InventoryItem = {
            ...target,
            current_quantity: nextQty,
            updated_at: new Date().toISOString(),
          }
          items = items.map((i) => (i.id === target.id ? updatedItem : i))
          const log = createInventoryLog({
            item_id: target.id,
            type: 'odpis_pos',
            quantity_changed: -deduct,
            note:
              note ||
              `POS odepis · ${catering.name} · ${fallbackName} ${deduct} ${unit}`,
            unit_price: target.average_price,
          })
          newLogs.push(log)
          await persistItem(updatedItem)
          await persistLog(log)
        }

        if (resolved.length) {
          for (const line of resolved) {
            await consumeById(
              line.inventory_item_id,
              line.qty_per_portion * qty,
              line.ingredient_name,
              line.unit
            )
          }
        } else {
          await consumeById(null, qty, catering.name, 'ks')
        }

        if (!(recipes ?? []).some((r) => r.catering_id === catering.id)) {
          const neu = buildRecipeRecordsFromCatering([catering], items)
          if (neu.length) {
            set({ recipes: [...(get().recipes ?? []), ...neu] })
            for (const row of neu) await persistRecipe(row)
          }
        }

        if (newLogs.length) {
          set({
            items,
            logs: [...newLogs, ...get().logs].slice(0, 300),
          })
        }
        await get().refreshSyncStatus()
        return { ok: true, depleted }
      },

      startInventura: (warehouseName = 'Hlavní sklad EventFlow') => {
        const items = get().items
        set({
          inventura: {
            id: uid('aud'),
            warehouse_name: warehouseName,
            started_at: new Date().toISOString(),
            closed_at: null,
            status: 'open',
            counts: items.map((i) => ({
              item_id: i.id,
              expected_quantity: i.current_quantity,
              actual_quantity: null,
              unit_price: i.average_price || i.purchase_price,
            })),
          },
        })
      },

      setInventuraCount: (itemId, actual) => {
        const session = get().inventura
        if (!session || session.status !== 'open') return
        set({
          inventura: {
            ...session,
            counts: session.counts.map((c) =>
              c.item_id === itemId
                ? {
                    ...c,
                    actual_quantity:
                      actual == null || Number.isNaN(actual) ? null : actual,
                  }
                : c
            ),
          },
        })
      },

      highlightByBarcode: (barcode) => {
        const code = String(barcode || '').trim()
        if (!code) return null
        return (
          get().items.find((i) => i.barcode && i.barcode === code) ||
          get().items.find((i) => i.barcode && i.barcode.endsWith(code)) ||
          null
        )
      },

      closeInventura: async () => {
        const session = get().inventura
        if (!session) {
          return {
            ok: false,
            mankoValue: 0,
            prebytekValue: 0,
            error: 'Inventura neběží',
          }
        }
        set({ loading: true, error: null })
        try {
          let items = [...get().items]
          const newLogs: InventoryLog[] = []
          let mankoValue = 0
          let prebytekValue = 0

          for (const row of session.counts) {
            if (row.actual_quantity == null) continue
            const item = items.find((i) => i.id === row.item_id)
            if (!item) continue
            const variance = inventuraVarianceValue({
              expected_quantity: row.expected_quantity,
              actual_quantity: row.actual_quantity,
              unit_price: row.unit_price,
            })
            if (variance.kind === 'manko') mankoValue += Math.abs(variance.deltaValue)
            if (variance.kind === 'prebytek') prebytekValue += variance.deltaValue

            const updatedItem: InventoryItem = {
              ...item,
              current_quantity: row.actual_quantity,
              updated_at: new Date().toISOString(),
            }
            items = items.map((i) => (i.id === item.id ? updatedItem : i))

            if (variance.deltaQty !== 0) {
              const log = createInventoryLog({
                item_id: item.id,
                type: 'inventura_rozdil',
                quantity_changed: variance.deltaQty,
                note:
                  variance.kind === 'manko'
                    ? `Manko ${Math.abs(variance.deltaQty)} ${item.unit}`
                    : `Přebytek ${variance.deltaQty} ${item.unit}`,
                unit_price: row.unit_price,
              })
              newLogs.push(log)
              await persistItem(updatedItem)
              await persistLog(log)
            } else {
              await persistItem(updatedItem)
            }
          }

          const closed: InventuraSession = {
            ...session,
            status: 'closed',
            closed_at: new Date().toISOString(),
          }

          set({
            items,
            logs: [...newLogs, ...get().logs].slice(0, 300),
            inventura: closed,
            loading: false,
            lastSyncedAt: new Date().toISOString(),
          })
          await get().refreshSyncStatus()

          return { ok: true, mankoValue, prebytekValue }
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : 'Uzavření inventury selhalo'
          set({ loading: false, error: msg })
          return { ok: false, mankoValue: 0, prebytekValue: 0, error: msg }
        }
      },

      clearInventura: () => set({ inventura: null }),
    }),
    {
      name: 'eventflow-inventory',
      partialize: (s) => ({
        items: s.items,
        logs: s.logs,
        recipes: s.recipes,
        inventura: s.inventura,
        lastSyncedAt: s.lastSyncedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.syncMode = getInventorySyncMode()
          state.hydrated = true
          state.pendingQueue = getOfflineQueueSize()
          state.cloudStatus =
            state.syncMode === 'online'
              ? state.pendingQueue > 0
                ? 'pending'
                : 'synced'
              : 'local'
          if (!state.items?.length) {
            state.items = seedDefaultInventory()
          }
          if (!Array.isArray(state.recipes)) state.recipes = []
        }
      },
    }
  )
)

let connectivityWired = false
export function wireInventoryConnectivity() {
  if (connectivityWired || typeof window === 'undefined') return
  connectivityWired = true
  subscribeConnectivity(() => {
    const api = useInventoryStore.getState()
    void api.refreshSyncStatus()
    if (navigator.onLine) void api.flushQueue()
  })
}

export { DEFAULT_USER_ID }
