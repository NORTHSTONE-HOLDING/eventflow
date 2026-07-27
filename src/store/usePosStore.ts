import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  InventoryItem,
  OrderItem,
  PaymentMethod,
  RestaurantTable,
  SaleLineItem,
  SaleRecord,
  Space,
  Station,
  Waiter,
} from '../lib/types'
import { DEFAULT_WAITERS } from '../lib/constants'
import { nextDocNumber, uid } from '../lib/format'
import { useKdsStore } from './useKdsStore'
import { useShiftStore } from './useShiftStore'
import { useAuditStore } from './useAuditStore'
import { useInventoryStore } from './useInventoryStore'

interface PosState {
  spaces: Space[]
  tables: RestaurantTable[]
  waiters: Waiter[]
  currentWaiterId: string
  activeSpaceId: string
  activeTableId: string | null
  activeSeat: number
  mobileMode: boolean
  quickCart: OrderItem[]

  setCurrentWaiter: (id: string) => void
  setActiveSpace: (id: string) => void
  addSpace: (name: string) => void
  addTable: (spaceId: string, seats: number, name?: string) => void
  deleteTable: (id: string) => boolean
  selectTable: (id: string) => void
  backToMap: () => void
  setSeat: (seat: number) => void
  toggleMobile: () => void

  addProductToActive: (product: InventoryItem) => void
  voidItem: (tableId: string, itemId: string) => void
  sendOrder: (tableId: string) => void
  payTable: (tableId: string, method: PaymentMethod | 'split', cashPart: number, cardPart: number) => SaleRecord | null

  addQuickItem: (product: InventoryItem) => void
  removeQuickItem: (itemId: string) => void
  clearQuickCart: () => void
  payQuick: (method: PaymentMethod | 'split', cashPart: number, cardPart: number) => SaleRecord | null

  submitOnlineOrder: (
    tableId: string,
    lines: {
      inventoryId: string
      name: string
      price: number
      station: Station
      servingSize: number
    }[],
  ) => SaleRecord | null

  tableById: (id: string | null) => RestaurantTable | undefined
  waiterName: (id: string) => string
  tableTotal: (table: RestaurantTable) => number
}

const initialSpaces: Space[] = [
  { id: 'sp-salonek', name: 'Salonek' },
  { id: 'sp-zahradka', name: 'Zahrádka' },
  { id: 'sp-sal', name: 'Hlavní sál' },
]

function makeTable(spaceId: string, name: string, seats: number): RestaurantTable {
  return { id: uid('tbl'), spaceId, name, seats, items: [] }
}

const initialTables: RestaurantTable[] = [
  makeTable('sp-salonek', 'Stůl 1', 4),
  makeTable('sp-salonek', 'Stůl 2', 2),
  makeTable('sp-zahradka', 'Stůl 3', 6),
  makeTable('sp-zahradka', 'Stůl 4', 4),
  makeTable('sp-sal', 'Stůl 5', 8),
  makeTable('sp-sal', 'Stůl 6', 4),
]

function orderItemFromProduct(product: InventoryItem, waiterId: string, seat: number): OrderItem {
  return {
    id: uid('oi'),
    productId: product.id,
    inventoryId: product.id,
    servingSize: product.servingSize,
    name: product.name,
    price: product.sellPrice,
    vatRate: product.vatRate,
    station: product.station,
    state: 'draft',
    sentAt: null,
    kitchenStatus: 'nova',
    waiterId,
    seat,
  }
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
  spaces: initialSpaces,
  tables: initialTables,
  waiters: DEFAULT_WAITERS,
  currentWaiterId: DEFAULT_WAITERS[0].id,
  activeSpaceId: initialSpaces[0].id,
  activeTableId: null,
  activeSeat: 1,
  mobileMode: false,
  quickCart: [],

  setCurrentWaiter: (id) => set({ currentWaiterId: id }),
  setActiveSpace: (id) => set({ activeSpaceId: id }),

  addSpace: (name) =>
    set((s) => {
      const space: Space = { id: uid('sp'), name }
      return { spaces: [...s.spaces, space], activeSpaceId: space.id }
    }),

  addTable: (spaceId, seats, name) =>
    set((s) => {
      const count = s.tables.length + 1
      const label = name && name.trim() ? name.trim() : `Stůl ${count}`
      return { tables: [...s.tables, makeTable(spaceId, label, seats)] }
    }),

  deleteTable: (id) => {
    const table = get().tables.find((t) => t.id === id)
    if (!table || table.items.length > 0) return false
    set((s) => ({ tables: s.tables.filter((t) => t.id !== id) }))
    return true
  },

  selectTable: (id) => set({ activeTableId: id, activeSeat: 1 }),
  backToMap: () => set({ activeTableId: null }),
  setSeat: (seat) => set({ activeSeat: seat }),
  toggleMobile: () => set((s) => ({ mobileMode: !s.mobileMode })),

  addProductToActive: (product) => {
    const { activeTableId, currentWaiterId, activeSeat } = get()
    if (!activeTableId) return
    const item = orderItemFromProduct(product, currentWaiterId, activeSeat)
    set((s) => ({
      tables: s.tables.map((t) =>
        t.id === activeTableId ? { ...t, items: [...t.items, item] } : t,
      ),
    }))
    const wname = get().waiterName(currentWaiterId)
    useAuditStore.getState().log({
      waiterId: currentWaiterId,
      waiterName: wname,
      action: 'add-item',
      detail: `${product.name} → ${get().tableById(activeTableId)?.name ?? ''} / židle ${activeSeat}`,
      amount: 0,
    })
  },

  voidItem: (tableId, itemId) => {
    const table = get().tableById(tableId)
    const item = table?.items.find((i) => i.id === itemId)
    set((s) => ({
      tables: s.tables.map((t) =>
        t.id === tableId ? { ...t, items: t.items.filter((i) => i.id !== itemId) } : t,
      ),
    }))
    if (item) {
      const wname = get().waiterName(item.waiterId)
      useAuditStore.getState().log({
        waiterId: item.waiterId,
        waiterName: wname,
        action: 'void-item',
        detail: `Storno ${item.name} (${item.state === 'sent' ? 'odeslaná' : 'rozpracovaná'})`,
        amount: 0,
      })
    }
  },

  sendOrder: (tableId) => {
    const table = get().tableById(tableId)
    if (!table) return
    const drafts = table.items.filter((i) => i.state === 'draft')
    if (drafts.length === 0) return
    const now = Date.now()
    const waiterId = get().currentWaiterId
    const wname = get().waiterName(waiterId)

    set((s) => ({
      tables: s.tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              items: t.items.map((i) =>
                i.state === 'draft' ? { ...i, state: 'sent', sentAt: now } : i,
              ),
            }
          : t,
      ),
      activeTableId: null,
    }))

    const stations: ('kitchen' | 'bar')[] = ['kitchen', 'bar']
    for (const station of stations) {
      const stationItems = drafts.filter((i) => i.station === station)
      if (stationItems.length === 0) continue
      useKdsStore.getState().pushTicket({
        id: uid('tkt'),
        tableId,
        tableName: table.name,
        seat: null,
        station,
        createdAt: now,
        waiterId,
        waiterName: wname,
        isOnline: false,
        items: stationItems.map((i) => ({ id: uid('ki'), name: i.name, status: 'nova' })),
      })
    }

    useAuditStore.getState().log({
      waiterId,
      waiterName: wname,
      action: 'send-order',
      detail: `Odeslána objednávka (${drafts.length} položek) — ${table.name}`,
      amount: 0,
    })
  },

  payTable: (tableId, method, cashPart, cardPart) => {
    const table = get().tableById(tableId)
    if (!table || table.items.length === 0) return null
    const items: SaleLineItem[] = table.items.map((i) => ({
      name: i.name,
      price: i.price,
      station: i.station,
    }))
    const total = items.reduce((sum, i) => sum + i.price, 0)
    const waiterId = get().currentWaiterId
    const wname = get().waiterName(waiterId)
    const sale: SaleRecord = {
      id: uid('sale'),
      ts: Date.now(),
      waiterId,
      waiterName: wname,
      tableName: table.name,
      items,
      total,
      method,
      cashPart,
      cardPart,
      docNumber: nextDocNumber(),
    }
    useShiftStore.getState().recordSale(sale)
    useInventoryStore.getState().deductForSale(
      table.items.map((i) => ({ inventoryId: i.inventoryId, servingSize: i.servingSize })),
    )
    useAuditStore.getState().log({
      waiterId,
      waiterName: wname,
      action: 'payment',
      detail: `Platba ${table.name} (${method}) ${total} Kč`,
      amount: total,
    })
    // Clear the table and drop its live KDS tickets.
    const tickets = useKdsStore.getState().tickets.filter((t) => t.tableId === tableId)
    tickets.forEach((t) => useKdsStore.getState().removeTicket(t.id))
    set((s) => ({
      tables: s.tables.map((t) => (t.id === tableId ? { ...t, items: [] } : t)),
      activeTableId: null,
    }))
    return sale
  },

  addQuickItem: (product) =>
    set((s) => ({
      quickCart: [...s.quickCart, orderItemFromProduct(product, s.currentWaiterId, 0)],
    })),

  removeQuickItem: (itemId) =>
    set((s) => ({ quickCart: s.quickCart.filter((i) => i.id !== itemId) })),

  clearQuickCart: () => set({ quickCart: [] }),

  payQuick: (method, cashPart, cardPart) => {
    const { quickCart, currentWaiterId } = get()
    if (quickCart.length === 0) return null
    const items: SaleLineItem[] = quickCart.map((i) => ({
      name: i.name,
      price: i.price,
      station: i.station,
    }))
    const total = items.reduce((sum, i) => sum + i.price, 0)
    const wname = get().waiterName(currentWaiterId)
    const sale: SaleRecord = {
      id: uid('sale'),
      ts: Date.now(),
      waiterId: currentWaiterId,
      waiterName: wname,
      tableName: null,
      items,
      total,
      method,
      cashPart,
      cardPart,
      docNumber: nextDocNumber(),
    }
    useShiftStore.getState().recordSale(sale)
    useInventoryStore.getState().deductForSale(
      quickCart.map((i) => ({ inventoryId: i.inventoryId, servingSize: i.servingSize })),
    )
    useAuditStore.getState().log({
      waiterId: currentWaiterId,
      waiterName: wname,
      action: 'quick-sale',
      detail: `Rychlý prodej (${items.length} položek) ${total} Kč`,
      amount: total,
    })
    set({ quickCart: [] })
    return sale
  },

  submitOnlineOrder: (tableId, lines) => {
    if (lines.length === 0) return null
    const now = Date.now()
    const table = get().tableById(tableId)
    const tableName = table ? table.name : `Online stůl ${tableId.slice(-4)}`
    const total = lines.reduce((sum, l) => sum + l.price, 0)

    const stations: ('kitchen' | 'bar')[] = ['kitchen', 'bar']
    for (const station of stations) {
      const stationLines = lines.filter((l) => l.station === station)
      if (stationLines.length === 0) continue
      useKdsStore.getState().pushTicket({
        id: uid('tkt'),
        tableId: table ? tableId : null,
        tableName,
        seat: null,
        station,
        createdAt: now,
        waiterId: 'online',
        waiterName: 'Online objednávka',
        isOnline: true,
        items: stationLines.map((l) => ({ id: uid('ki'), name: l.name, status: 'nova' })),
      })
    }

    const sale: SaleRecord = {
      id: uid('sale'),
      ts: now,
      waiterId: 'online',
      waiterName: 'Online objednávka',
      tableName,
      items: lines.map((l) => ({ name: l.name, price: l.price, station: l.station })),
      total,
      method: 'card',
      cashPart: 0,
      cardPart: total,
      docNumber: nextDocNumber(),
    }
    useShiftStore.getState().recordSale(sale)
    useInventoryStore.getState().deductForSale(
      lines.map((l) => ({ inventoryId: l.inventoryId, servingSize: l.servingSize })),
    )
    useAuditStore.getState().log({
      waiterId: 'online',
      waiterName: 'Online objednávka',
      action: 'quick-sale',
      detail: `Online QR objednávka (${lines.length} položek) — ${tableName}`,
      amount: total,
    })
    return sale
  },

  tableById: (id) => get().tables.find((t) => t.id === id),
  waiterName: (id) => get().waiters.find((w) => w.id === id)?.name ?? 'Neznámý',
  tableTotal: (table) => table.items.reduce((sum, i) => sum + i.price, 0),
    }),
    {
      name: 'eventflow-pos',
      partialize: (s) => ({
        spaces: s.spaces,
        tables: s.tables,
        waiters: s.waiters,
        currentWaiterId: s.currentWaiterId,
        activeSpaceId: s.activeSpaceId,
        activeSeat: s.activeSeat,
        mobileMode: s.mobileMode,
        quickCart: s.quickCart,
      }),
    },
  ),
)
