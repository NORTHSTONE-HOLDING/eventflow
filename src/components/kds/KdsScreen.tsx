import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useKdsStore } from '../../store/useKdsStore'
import { elapsed, formatClock } from '../../lib/format'
import { tap } from '../../lib/feedback'
import type { KdsTicket, KitchenStatus, Station } from '../../lib/types'
import { PinGate } from '../common/PinGate'
import { ShiftClosure } from './ShiftClosure'
import { RedAlertBanner } from '../common/RedAlertBanner'

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const STATUS_STYLE: Record<KitchenStatus, string> = {
  nova: 'bg-slate-700 text-slate-200',
  priprava: 'bg-amber-500 text-amber-950',
  hotovo: 'bg-emerald-500 text-emerald-950',
}

const STATUS_LABEL: Record<KitchenStatus, string> = {
  nova: 'Nová',
  priprava: 'Příprava',
  hotovo: 'Hotovo',
}

function TicketCard({ ticket, now }: { ticket: KdsTicket; now: number }) {
  const setItemStatus = useKdsStore((s) => s.setItemStatus)
  const removeTicket = useKdsStore((s) => s.removeTicket)
  const allDone = ticket.items.every((i) => i.status === 'hotovo')
  const waited = elapsed(ticket.createdAt, now)
  const overdue = now - ticket.createdAt > 10 * 60 * 1000

  return (
    <div
      className={`flex flex-col rounded-2xl border p-4 ${
        allDone
          ? 'border-emerald-600 bg-emerald-900/20'
          : overdue
            ? 'border-red-500 bg-red-900/20'
            : 'border-slate-700 bg-slate-900/70'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-display text-xl text-white">{ticket.tableName}</div>
          <div className="text-xs text-slate-400">
            {ticket.waiterName} · {formatClock(ticket.createdAt)}
          </div>
          {ticket.isOnline && (
            <div className="mt-1 inline-block animate-pulse rounded-md bg-gold px-2 py-0.5 text-[11px] font-bold text-slate-950">
              📥 ONLINE OBJEDNÁVKA
            </div>
          )}
        </div>
        <div
          className={`rounded-lg px-3 py-1.5 font-mono text-lg font-bold ${
            overdue ? 'bg-red-600 text-white' : 'bg-slate-800 text-gold'
          }`}
        >
          ⏱ {waited}
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {ticket.items.map((it) => (
          <div key={it.id} className="rounded-xl bg-slate-800/60 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-white">{it.name}</span>
              <span className={`badge ${STATUS_STYLE[it.status]}`}>{STATUS_LABEL[it.status]}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  tap(660)
                  setItemStatus(ticket.id, it.id, 'priprava')
                }}
                className={`btn ${it.status === 'priprava' ? 'btn-gold' : 'btn-ghost'} py-2`}
              >
                👨‍🍳 Příprava
              </button>
              <button
                type="button"
                onClick={() => {
                  tap(990)
                  setItemStatus(ticket.id, it.id, 'hotovo')
                }}
                className={`btn ${it.status === 'hotovo' ? 'btn-gold' : 'btn-ghost'} py-2`}
              >
                ✅ Hotovo
              </button>
            </div>
          </div>
        ))}
      </div>

      {allDone && (
        <button
          type="button"
          onClick={() => {
            tap(880)
            removeTicket(ticket.id)
          }}
          className="btn btn-gold mt-3 w-full"
        >
          📦 Vydáno — odebrat tiket
        </button>
      )}
    </div>
  )
}

export function KdsScreen({ station }: { station: Station }) {
  const now = useNow(1000)
  const allTickets = useKdsStore((s) => s.tickets)
  const tickets = useMemo(() => allTickets.filter((t) => t.station === station), [allTickets, station])
  const [pinOpen, setPinOpen] = useState(false)
  const [closureOpen, setClosureOpen] = useState(false)

  const title = station === 'kitchen' ? '🍳 KDS Kuchyně' : '🍸 KDS Bar'
  const accent = station === 'kitchen' ? 'text-orange-400' : 'text-cyan-400'

  return (
    <div className="min-h-screen">
      <RedAlertBanner />
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <h1 className={`font-display text-2xl ${accent}`}>{title}</h1>
        <div className="flex items-center gap-2">
          <span className="badge badge-gold">{tickets.length} aktivních</span>
          <button
            type="button"
            onClick={() => {
              tap(700)
              setPinOpen(true)
            }}
            className="btn btn-ghost"
          >
            🏁 Uzávěrka & Směna
          </button>
          <Link to="/" className="btn btn-ghost">
            🏠 Přehled
          </Link>
        </div>
      </header>

      <div className="p-4">
        {tickets.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center text-center text-slate-500">
            <div>
              <div className="mb-3 text-6xl">🎫</div>
              Žádné aktivní tikety. Objednávky se zobrazí po odeslání z POS.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} now={now} />
            ))}
          </div>
        )}
      </div>

      <PinGate
        open={pinOpen}
        reason="Uzávěrka směny vyžaduje manažerský PIN."
        onClose={() => setPinOpen(false)}
        onSuccess={() => {
          setPinOpen(false)
          setClosureOpen(true)
        }}
      />
      <ShiftClosure open={closureOpen} onClose={() => setClosureOpen(false)} />
    </div>
  )
}
