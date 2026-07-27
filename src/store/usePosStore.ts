import { create } from 'zustand'
import type {
  OrderItem,
  PaymentMethod,
  Product,
  RestaurantTable,
  SaleLineItem,
  SaleRecord,
  Space,
  Waiter,
} from '../lib/types'
import { DEFAULT_WAITERS } from '../lib/constants'
import { nextDocNumber, uid } from '../lib/format'
import { useKdsStore } from './useKdsStore'
import { useShiftStore } from './useShiftStore'
import { useAuditStore } from './useAuditStore'

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
  addTable: (spaceId: string, seats: number) => void
  deleteTable: (id: string) => boolean
  selectTable: (id: string) => void
  backToMap: () => void
  setSeat: (seat: number) => void
  toggleMobile: () => void

  addProductToActive: (product: Product) => void
  voidItem: (tableId: string, itemId: string) => void
  sendOrder: (tableId: string) => void
  payTable: (tableId: string, method: PaymentMethod | 'split', cashPart: number, cardPart: number) => SaleRecord | null

  addQuickItem: (product: Product) => void
  removeQuickItem: (itemId: string) => void
  clearQuickCart: () => void
  payQuick: (method: PaymentMethod | 'split', cashPart: number, cardPart: number) => SaleRecord | null

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

function orderItemFromProduct(product: Product, waiterId: string, seat: number): OrderItem {
  return {
    id: uid('oi'),
    productId: product.id,
    name: product.name,
    price: product.price,
    vatRate: product.vatRate,
    station: product.station,
    state: 'draft',
    sentAt: null,
    kitchenStatus: 'nova',
    waiterId,
    seat,
  }
}

export const usePosStore = create<PosState>((set, get) => ({
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

  addTable: (spaceId, seats) =>
    set((s) => {
      const count = s.tables.length + 1
      return { tables: [...s.tables, makeTable(spaceId, `Stůl ${count}`, seats)] }
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

  tableById: (id) => get().tables.find((t) => t.id === id),
  waiterName: (id) => get().waiters.find((w) => w.id === id)?.name ?? 'Neznámý',
  tableTotal: (table) => table.items.reduce((sum, i) => sum + i.price, 0),
}))
