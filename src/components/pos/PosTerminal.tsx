import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePosStore } from '../../store/usePosStore'
import { useKdsStore } from '../../store/useKdsStore'
import { formatCZK } from '../../lib/format'
import { tap } from '../../lib/feedback'
import type { InventoryItem, OrderItem, RestaurantTable } from '../../lib/types'
import { ProductGrid } from './ProductGrid'
import { PaymentModal } from './PaymentModal'
import { TableQrModal } from './TableQrModal'
import { PinGate } from '../common/PinGate'
import { Modal } from '../common/Modal'
import { RedAlertBanner } from '../common/RedAlertBanner'
import { Logo } from '../layout/Logo'

function GoldAlerts() {
  const alerts = useKdsStore((s) => s.alerts)
  const dismiss = useKdsStore((s) => s.dismissAlert)
  if (alerts.length === 0) return null
  return (
    <div className="fixed right-4 top-20 z-40 w-80 space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="animate-fadeUp flex items-start justify-between gap-2 rounded-xl border border-gold bg-gold/15 px-4 py-3 text-sm text-gold shadow-gold"
        >
          <span>{a.message}</span>
          <button type="button" onClick={() => dismiss(a.id)} className="text-gold/70 hover:text-white">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

function AddTableModal({ open, onClose, spaceId }: { open: boolean; onClose: () => void; spaceId: string }) {
  const addTable = usePosStore((s) => s.addTable)
  const [seats, setSeats] = useState(4)
  const [name, setName] = useState('')
  return (
    <Modal open={open} title="➕ Přidat stůl" onClose={onClose} maxWidth="max-w-sm">
      <label className="label">Popis / název stolu (volitelné)</label>
      <input
        className="input mb-4"
        placeholder="např. VIP box u okna"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="label">Kapacita: {seats} {seats === 1 ? 'místo' : seats < 5 ? 'místa' : 'míst'}</label>
      <input
        type="range"
        min={1}
        max={16}
        value={seats}
        onChange={(e) => setSeats(Number(e.target.value))}
        className="w-full accent-gold"
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>1 místo</span>
        <span>16 míst</span>
      </div>
      <button
        type="button"
        onClick={() => {
          tap(880)
          addTable(spaceId, seats, name)
          setName('')
          onClose()
        }}
        className="btn btn-gold mt-5 w-full"
      >
        Vytvořit stůl
      </button>
    </Modal>
  )
}

function AddSpaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addSpace = usePosStore((s) => s.addSpace)
  const [name, setName] = useState('')
  return (
    <Modal open={open} title="➕ Přidat prostor" onClose={onClose} maxWidth="max-w-sm">
      <label className="label">Název prostoru</label>
      <input
        className="input"
        placeholder="např. VIP Terasa"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          tap(880)
          addSpace(name.trim())
          setName('')
          onClose()
        }}
        className="btn btn-gold mt-5 w-full disabled:opacity-40"
      >
        Vytvořit prostor
      </button>
    </Modal>
  )
}

function SpacePanel() {
  const spaces = usePosStore((s) => s.spaces)
  const tables = usePosStore((s) => s.tables)
  const activeSpaceId = usePosStore((s) => s.activeSpaceId)
  const activeTableId = usePosStore((s) => s.activeTableId)
  const setActiveSpace = usePosStore((s) => s.setActiveSpace)
  const selectTable = usePosStore((s) => s.selectTable)
  const deleteTable = usePosStore((s) => s.deleteTable)
  const tableTotal = usePosStore((s) => s.tableTotal)
  const [addSpaceOpen, setAddSpaceOpen] = useState(false)
  const [addTableOpen, setAddTableOpen] = useState(false)
  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const spaceTables = tables.filter((t) => t.spaceId === activeSpaceId)

  const tryDelete = (id: string) => {
    tap(440)
    const ok = deleteTable(id)
    if (!ok) {
      setNote('Nelze smazat stůl s otevřeným účtem.')
      setTimeout(() => setNote(null), 2500)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl text-white">Prostory</h2>
        <button
          type="button"
          onClick={() => {
            tap(700)
            setAddSpaceOpen(true)
          }}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-gold hover:text-gold"
        >
          ➕ Přidat prostor
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {spaces.map((sp) => (
          <button
            key={sp.id}
            type="button"
            onClick={() => {
              tap(620)
              setActiveSpace(sp.id)
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeSpaceId === sp.id ? 'bg-gold/20 text-gold' : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            {sp.name}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">Mapa stolů</span>
        <button
          type="button"
          onClick={() => {
            tap(700)
            setAddTableOpen(true)
          }}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-gold hover:text-gold"
        >
          ➕ Přidat stůl
        </button>
      </div>

      {note && <p className="mb-3 rounded-lg bg-red-900/40 px-3 py-2 text-xs text-red-300">{note}</p>}

      <div className="grid grid-cols-2 content-start gap-3 overflow-y-auto pr-1">
        {spaceTables.map((t) => {
          const total = tableTotal(t)
          const open = t.items.length > 0
          const active = activeTableId === t.id
          return (
            <div
              key={t.id}
              className={`relative rounded-2xl border p-3 transition ${
                active
                  ? 'border-gold bg-gold/10 shadow-gold'
                  : open
                    ? 'border-emerald-600/60 bg-emerald-900/15'
                    : 'border-slate-700 bg-slate-800/40'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  tap(760)
                  selectTable(t.id)
                }}
                className="block w-full text-left"
                style={{ minHeight: 72 }}
              >
                <div className="text-sm font-bold text-white">{t.name}</div>
                <div className="text-xs text-slate-400">{t.seats} míst</div>
                {open ? (
                  <div className="mt-1 font-display text-lg text-gold">{formatCZK(total)}</div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">volný</div>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  tap(620)
                  setQrTable(t)
                }}
                className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-gold/20 hover:text-gold"
                aria-label="Vytisknout QR kód"
                title="Vytisknout QR kód pro stůl"
              >
                🖨️
              </button>
              {!open && (
                <button
                  type="button"
                  onClick={() => tryDelete(t.id)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-red-600/30 hover:text-red-300"
                  aria-label="Smazat stůl"
                >
                  🗑
                </button>
              )}
            </div>
          )
        })}
      </div>

      <AddSpaceModal open={addSpaceOpen} onClose={() => setAddSpaceOpen(false)} />
      <AddTableModal open={addTableOpen} onClose={() => setAddTableOpen(false)} spaceId={activeSpaceId} />
      <TableQrModal table={qrTable} onClose={() => setQrTable(null)} />
    </div>
  )
}

function CartRow({ item, onVoid }: { item: OrderItem; onVoid: (item: OrderItem) => void }) {
  const isSent = item.state === 'sent'
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
        isSent
          ? 'border-emerald-600/60 bg-emerald-900/25 text-emerald-100'
          : 'border-slate-300/20 bg-white/90 text-slate-900'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="truncate">{item.name}</span>
          {isSent && <span className="badge bg-emerald-500 text-emerald-950">Odesláno</span>}
        </div>
        <div className={`text-xs ${isSent ? 'text-emerald-300' : 'text-slate-500'}`}>
          Židle {item.seat} · {item.station === 'kitchen' ? 'Kuchyně' : 'Bar'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-display text-base ${isSent ? 'text-gold' : 'text-slate-900'}`}>
          {formatCZK(item.price)}
        </span>
        <button
          type="button"
          onClick={() => onVoid(item)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500"
          aria-label="Storno položky"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function CartPanel({ table }: { table: RestaurantTable }) {
  const activeSeat = usePosStore((s) => s.activeSeat)
  const setSeat = usePosStore((s) => s.setSeat)
  const sendOrder = usePosStore((s) => s.sendOrder)
  const voidItem = usePosStore((s) => s.voidItem)
  const payTable = usePosStore((s) => s.payTable)
  const tableTotal = usePosStore((s) => s.tableTotal)

  const [payOpen, setPayOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pendingVoid, setPendingVoid] = useState<OrderItem | null>(null)

  const total = tableTotal(table)
  const hasDraft = table.items.some((i) => i.state === 'draft')

  const requestVoid = (item: OrderItem) => {
    tap(440)
    if (item.state === 'sent') {
      setPendingVoid(item)
      setPinOpen(true)
    } else {
      voidItem(table.id, item.id)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 rounded-xl bg-slate-800/60 px-3 py-2">
        <div className="text-sm font-bold text-gold">
          🛒 ÚČET: STŮL {table.name.replace(/^Stůl\s*/i, '')} · ŽIDLE {activeSeat}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Židle</div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: table.seats }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                tap(600)
                setSeat(n)
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${
                activeSeat === n ? 'bg-gold text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {table.items.length === 0 ? (
          <p className="pt-8 text-center text-sm text-slate-500">
            Prázdný účet — klepněte na položku vlevo.
          </p>
        ) : (
          table.items.map((item) => <CartRow key={item.id} item={item} onVoid={requestVoid} />)
        )}
      </div>

      <div className="mt-3 border-t border-slate-800 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-400">Celkem</span>
          <span className="font-display text-2xl text-gold">{formatCZK(total)}</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            disabled={!hasDraft}
            onClick={() => {
              tap(990)
              sendOrder(table.id)
            }}
            className="btn btn-gold w-full disabled:opacity-40"
          >
            🔥 Odeslat objednávku
          </button>
          <button
            type="button"
            disabled={table.items.length === 0}
            onClick={() => {
              tap(880)
              setPayOpen(true)
            }}
            className="btn btn-ghost w-full disabled:opacity-40"
          >
            💳 Zaplatit účet
          </button>
        </div>
      </div>

      <PaymentModal
        open={payOpen}
        total={total}
        title={`Platba — ${table.name}`}
        onClose={() => setPayOpen(false)}
        onConfirm={(method, cash, card) => {
          payTable(table.id, method, cash, card)
          setPayOpen(false)
        }}
      />
      <PinGate
        open={pinOpen}
        reason="Úprava nebo smazání odeslané položky vyžaduje manažerský PIN."
        onClose={() => {
          setPinOpen(false)
          setPendingVoid(null)
        }}
        onSuccess={() => {
          if (pendingVoid) voidItem(table.id, pendingVoid.id)
          setPinOpen(false)
          setPendingVoid(null)
        }}
      />
    </div>
  )
}

function QuickSaleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const quickCart = usePosStore((s) => s.quickCart)
  const addQuickItem = usePosStore((s) => s.addQuickItem)
  const removeQuickItem = usePosStore((s) => s.removeQuickItem)
  const clearQuickCart = usePosStore((s) => s.clearQuickCart)
  const payQuick = usePosStore((s) => s.payQuick)
  const [payOpen, setPayOpen] = useState(false)
  const total = quickCart.reduce((sum, i) => sum + i.price, 0)

  return (
    <Modal open={open} title="⚡ Rychlý prodej (přímý pult)" onClose={onClose} maxWidth="max-w-5xl">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2" style={{ minHeight: 380 }}>
          <ProductGrid onPick={addQuickItem} />
        </div>
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-sm font-bold text-gold">🛒 Expresní účet</div>
          <div className="flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: 300 }}>
            {quickCart.length === 0 ? (
              <p className="pt-6 text-center text-sm text-slate-500">Zatím prázdné.</p>
            ) : (
              quickCart.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between rounded-lg bg-white/90 px-3 py-2 text-sm text-slate-900"
                >
                  <span className="truncate">{i.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCZK(i.price)}</span>
                    <button
                      type="button"
                      onClick={() => removeQuickItem(i.id)}
                      className="flex h-7 w-7 items-center justify-center rounded bg-red-600 text-white"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 border-t border-slate-800 pt-3">
            <div className="mb-2 flex justify-between">
              <span className="text-sm text-slate-400">Celkem</span>
              <span className="font-display text-2xl text-gold">{formatCZK(total)}</span>
            </div>
            <button
              type="button"
              disabled={quickCart.length === 0}
              onClick={() => {
                tap(990)
                setPayOpen(true)
              }}
              className="btn btn-gold w-full disabled:opacity-40"
            >
              💳 Expresní platba
            </button>
            {quickCart.length > 0 && (
              <button
                type="button"
                onClick={clearQuickCart}
                className="mt-2 w-full text-xs text-slate-500 hover:text-red-300"
              >
                Vyprázdnit
              </button>
            )}
          </div>
        </div>
      </div>

      <PaymentModal
        open={payOpen}
        total={total}
        title="Expresní platba"
        onClose={() => setPayOpen(false)}
        onConfirm={(method, cash, card) => {
          payQuick(method, cash, card)
          setPayOpen(false)
          onClose()
        }}
      />
    </Modal>
  )
}

export function PosTerminal() {
  const waiters = usePosStore((s) => s.waiters)
  const currentWaiterId = usePosStore((s) => s.currentWaiterId)
  const setCurrentWaiter = usePosStore((s) => s.setCurrentWaiter)
  const mobileMode = usePosStore((s) => s.mobileMode)
  const toggleMobile = usePosStore((s) => s.toggleMobile)
  const activeTableId = usePosStore((s) => s.activeTableId)
  const backToMap = usePosStore((s) => s.backToMap)
  const addProductToActive = usePosStore((s) => s.addProductToActive)
  const table = usePosStore((s) => s.tables.find((t) => t.id === s.activeTableId) ?? null)
  const [quickOpen, setQuickOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <RedAlertBanner />
      <GoldAlerts />

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="hidden text-sm text-slate-500 sm:inline">POS Terminál</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currentWaiterId}
            onChange={(e) => setCurrentWaiter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>
                👤 {w.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              tap(880)
              setQuickOpen(true)
            }}
            className="btn btn-gold"
          >
            ⚡ Rychlý prodej
          </button>
          <button
            type="button"
            onClick={() => {
              tap(700)
              toggleMobile()
            }}
            className="btn btn-ghost"
          >
            📱 {mobileMode ? 'Klasický režim' : 'Přepnout na Mobilního číšníka'}
          </button>
          <Link to="/" className="btn btn-ghost">
            🏠 Přehled
          </Link>
        </div>
      </header>

      {mobileMode ? (
        <MobileWaiter
          table={table}
          onBack={backToMap}
          onPick={addProductToActive}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="card min-h-[75vh] p-4">
            <SpacePanel />
          </section>
          <section className="card min-h-[75vh] p-4">
            {activeTableId ? (
              <ProductGrid onPick={addProductToActive} />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-slate-500">
                <div>
                  <div className="mb-2 text-5xl">👈</div>
                  Vyberte stůl v mapě pro zahájení objednávky.
                </div>
              </div>
            )}
          </section>
          <section className="card min-h-[75vh] p-4">
            {table ? (
              <CartPanel table={table} />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-slate-500">
                Účet se zobrazí po výběru stolu.
              </div>
            )}
          </section>
        </div>
      )}

      <QuickSaleModal open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  )
}

function MobileWaiter({
  table,
  onBack,
  onPick,
}: {
  table: RestaurantTable | null
  onBack: () => void
  onPick: (product: InventoryItem) => void
}) {
  if (!table) {
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="card p-4">
          <SpacePanel />
        </div>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <button type="button" onClick={onBack} className="btn btn-gold w-full">
        ⬅ Zpět na přehled stolů
      </button>
      <div className="card p-4" style={{ minHeight: 340 }}>
        <ProductGrid onPick={onPick} />
      </div>
      <div className="card p-4">
        <CartPanel table={table} />
      </div>
    </div>
  )
}
