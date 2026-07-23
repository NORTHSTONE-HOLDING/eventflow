import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CateringItem,
  InventuraSession,
  InventoryItem,
  InventoryLog,
  InvoiceVisionResult,
} from '../types'
import { inferIngredientsFromCatering } from '../lib/inventoryEngine'
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
  insertInventoryLogRemote,
  upsertInventoryRemote,
} from '../lib/inventoryCloud'
import { getInventorySyncMode, type SyncMode } from '../lib/supabase'
import { uid } from '../lib/documentIds'

interface InventoryState {
  items: InventoryItem[]
  logs: InventoryLog[]
  syncMode: SyncMode
  loading: boolean
  error: string | null
  lastSyncedAt: string | null
  inventura: InventuraSession | null
  hydrated: boolean

  setError: (msg: string | null) => void
  bootstrap: () => Promise<void>
  refreshFromCloud: () => Promise<void>

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
  if (getInventorySyncMode() === 'online') {
    await upsertInventoryRemote(item)
  }
}

async function persistLog(log: InventoryLog) {
  if (getInventorySyncMode() === 'online') {
    await insertInventoryLogRemote(log)
  }
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      items: [],
      logs: [],
      syncMode: getInventorySyncMode(),
      loading: false,
      error: null,
      lastSyncedAt: null,
      inventura: null,
      hydrated: false,

      setError: (msg) => set({ error: msg }),

      bootstrap: async () => {
        const mode = getInventorySyncMode()
        set({ loading: true, error: null, syncMode: mode })
        try {
          if (mode === 'online') {
            const remote = await fetchInventoryRemote()
            if (remote.ok && remote.items.length) {
              const logsRes = await fetchInventoryLogsRemote()
              set({
                items: remote.items,
                logs: logsRes.ok ? logsRes.logs : get().logs,
                lastSyncedAt: new Date().toISOString(),
                loading: false,
                hydrated: true,
              })
              return
            }
          }

          const existing = get().items
          if (!existing.length) {
            set({
              items: seedDefaultInventory(),
              loading: false,
              hydrated: true,
              syncMode: mode,
            })
            return
          }
          set({ loading: false, hydrated: true, syncMode: mode })
        } catch (e) {
          set({
            loading: false,
            hydrated: true,
            error: e instanceof Error ? e.message : 'Nepodařilo se načíst sklad',
            items: get().items.length ? get().items : seedDefaultInventory(),
            syncMode: 'offline',
          })
        }
      },

      refreshFromCloud: async () => {
        const mode = getInventorySyncMode()
        set({ loading: true, error: null, syncMode: mode })
        if (mode !== 'online') {
          set({ loading: false, error: 'Supabase klíče chybí — běží offline záloha' })
          return
        }
        const remote = await fetchInventoryRemote()
        if (!remote.ok) {
          set({
            loading: false,
            error: remote.error || 'Sync selhal',
            syncMode: 'offline',
          })
          return
        }
        const logsRes = await fetchInventoryLogsRemote()
        set({
          items: remote.items.length ? remote.items : get().items,
          logs: logsRes.ok ? logsRes.logs : get().logs,
          lastSyncedAt: new Date().toISOString(),
          loading: false,
        })
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
        const newLogs: InventoryLog[] = []
        const depleted: string[] = []
        const ingredients = inferIngredientsFromCatering(catering)

        const consume = (name: string, unit: string, amount: number) => {
          const target = matchInventoryItem(items, { name, unit })
          if (!target) return
          const nextQty = Math.max(
            0,
            Math.round((target.current_quantity - amount) * 1000) / 1000
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
            quantity_changed: -amount,
            note: note || `POS odepis · ${catering.name}`,
            unit_price: target.average_price,
          })
          newLogs.push(log)
          void persistItem(updatedItem)
          void persistLog(log)
        }

        if (ingredients.length) {
          for (const ing of ingredients) {
            consume(ing.name, ing.unit, ing.qtyPerPortion * qty)
          }
        } else {
          consume(catering.name, 'ks', qty)
          consume(catering.name, 'porce', qty)
        }

        if (newLogs.length) {
          set({
            items,
            logs: [...newLogs, ...get().logs].slice(0, 300),
          })
        }
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
          return { ok: false, mankoValue: 0, prebytekValue: 0, error: 'Inventura neběží' }
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

          return { ok: true, mankoValue, prebytekValue }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Uzavření inventury selhalo'
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
        inventura: s.inventura,
        lastSyncedAt: s.lastSyncedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.syncMode = getInventorySyncMode()
          state.hydrated = true
          if (!state.items?.length) {
            state.items = seedDefaultInventory()
          }
        }
      },
    }
  )
)

export { DEFAULT_USER_ID }
