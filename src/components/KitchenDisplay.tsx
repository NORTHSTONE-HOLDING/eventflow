import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ChefHat, Clock3, Wine } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  getPosChannel,
  publishKdsSnapshot,
  type PosBroadcastMessage,
} from '../lib/kdsSync'
import { formatCurrency } from '../lib/documentIds'
import { tapFeedback } from '../lib/touchFeedback'
import { toDateKey } from '../lib/czechHolidays'
import type { KdsTicket, KdsTicketStatus } from '../types'

type StationFilter = 'all' | 'kitchen' | 'bar'

function formatStopwatch(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function LiveStopwatch({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const sec = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000))
  const urgent = sec >= 8 * 60
  return (
    <span style={{ color: urgent ? '#fca5a5' : '#94a3b8', fontWeight: 800 }}>
      <Clock3 size={14} style={{ marginRight: 4, display: 'inline' }} />
      {formatStopwatch(sec)}
    </span>
  )
}

export function KitchenDisplayPage() {
  const location = useLocation()
  const pathFilter: StationFilter =
    location.pathname.includes('kitchen') || location.pathname.endsWith('/kds-kitchen')
      ? 'kitchen'
      : location.pathname.includes('bar') || location.pathname.endsWith('/kds-bar')
        ? 'bar'
        : 'all'

  const storeTickets = useAppStore((s) => s.kdsTickets)
  const setKdsTicketStatus = useAppStore((s) => s.setKdsTicketStatus)
  const addKdsTickets = useAppStore((s) => s.addKdsTickets)
  const [filter, setFilter] = useState<StationFilter>(pathFilter)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setFilter(pathFilter)
  }, [pathFilter])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const ch = getPosChannel()
    if (!ch) return
    const onMsg = (ev: MessageEvent<PosBroadcastMessage>) => {
      if (ev.data?.type === 'kds_upsert' && ev.data.payload) {
        addKdsTickets([ev.data.payload])
        setFlashId(ev.data.payload.id)
        tapFeedback('kds')
        window.setTimeout(() => setFlashId(null), 2500)
      }
      if (ev.data?.type === 'kds_status') {
        setKdsTicketStatus(ev.data.payload.id, ev.data.payload.status)
      }
      if (ev.data?.type === 'kds_snapshot' && Array.isArray(ev.data.payload)) {
        addKdsTickets(ev.data.payload)
      }
    }
    ch.addEventListener('message', onMsg)
    publishKdsSnapshot(
      (useAppStore.getState().kdsTickets ?? []).filter((t) => t.status !== 'done'),
    )
    return () => ch.removeEventListener('message', onMsg)
  }, [addKdsTickets, setKdsTicketStatus])

  const tickets = useMemo(() => {
    void tick
    const list = Array.isArray(storeTickets) ? [...storeTickets] : []
    return list
      .filter((t) => (filter === 'all' ? true : t.station === filter))
      .filter((t) => t.status !== 'done')
      .sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
  }, [storeTickets, filter, tick])

  const todayRevenue = useMemo(() => {
    const today = toDateKey(new Date())
    return Math.round(
      (storeTickets ?? [])
        .filter((t) => (filter === 'all' ? true : t.station === filter))
        .filter((t) => toDateKey(t.createdAt) === today)
        .reduce((s, t) => s + (Number(t.ticketValue) || 0), 0),
    )
  }, [storeTickets, filter])

  const title =
    filter === 'kitchen'
      ? 'Displej KUCHYŇ'
      : filter === 'bar'
        ? 'Displej BAR'
        : 'Kitchen Display System'

  const revenueLabel =
    filter === 'bar' ? 'Dnešní obrat baru' : 'Dnešní obrat kuchyně'

  const setStatus = (ticket: KdsTicket, status: KdsTicketStatus) => {
    tapFeedback(status === 'done' ? 'success' : 'kds')
    setKdsTicketStatus(ticket.id, status)
  }

  return (
    <div
      className="kds-root"
      style={{
        minHeight: '100vh',
        background: '#070a0e',
        color: '#e8ecf1',
        padding: '1.25rem',
        touchAction: 'manipulation',
      }}
    >
      <div className="gradient-mesh" style={{ opacity: 0.35 }} />
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1400, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                color: '#D4AF37',
                fontSize: 'clamp(1.7rem, 3.4vw, 2.4rem)',
                fontWeight: 700,
              }}
            >
              {title}
            </h1>
            <p style={{ color: '#8b95a5', fontSize: '0.9rem' }}>
              Stůl · obsluha · čas objednávky · živá časomíra · Příprava / Hotovo
            </p>
          </div>
          <div
            style={{
              padding: '0.75rem 1.1rem',
              borderRadius: 14,
              border: '1px solid rgba(212,175,55,0.45)',
              background: 'rgba(212,175,55,0.12)',
              minWidth: 220,
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>
              {revenueLabel}
            </div>
            <div
              style={{
                fontSize: '1.55rem',
                fontWeight: 900,
                color: '#D4AF37',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatCurrency(todayRevenue)}
            </div>
          </div>
        </div>

        {pathFilter === 'all' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {(
              [
                ['all', 'Vše'],
                ['kitchen', 'Displej KUCHYŇ'],
                ['bar', 'Displej BAR'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  tapFeedback()
                  setFilter(id)
                }}
                style={{
                  minHeight: 48,
                  padding: '0.7rem 1rem',
                  borderRadius: 12,
                  border: `1px solid ${filter === id ? '#D4AF37' : '#334155'}`,
                  background: filter === id ? 'rgba(212,175,55,0.18)' : '#0f172a',
                  color: filter === id ? '#D4AF37' : '#e2e8f0',
                  fontWeight: 800,
                  touchAction: 'manipulation',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {id === 'kitchen' ? <ChefHat size={16} /> : id === 'bar' ? <Wine size={16} /> : null}
                {label}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {tickets.map((ticket) => {
            const ageSec = Math.max(
              0,
              Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 1000),
            )
            const preparing = ticket.status === 'preparing'
            const urgent = ageSec >= 8 * 60
            const orderTime = new Date(ticket.createdAt).toLocaleTimeString('cs-CZ', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
            return (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  boxShadow:
                    flashId === ticket.id
                      ? '0 0 30px rgba(212,175,55,0.45)'
                      : preparing
                        ? '0 0 18px rgba(245,158,11,0.35)'
                        : 'none',
                }}
                style={{
                  textAlign: 'left',
                  color: 'inherit',
                  border: `2px solid ${
                    preparing ? '#f59e0b' : urgent ? 'rgba(239,68,68,0.55)' : '#334155'
                  }`,
                  background: '#1e293b',
                  borderRadius: 16,
                  padding: '1rem',
                  minHeight: 240,
                  touchAction: 'manipulation',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      background:
                        ticket.station === 'kitchen'
                          ? 'rgba(212,175,55,0.2)'
                          : 'rgba(96,165,250,0.2)',
                      color: ticket.station === 'kitchen' ? '#D4AF37' : '#93c5fd',
                      borderRadius: 999,
                      padding: '0.25rem 0.65rem',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                    }}
                  >
                    {ticket.station === 'kitchen' ? 'Kuchyň' : 'Bar'}
                  </span>
                  <LiveStopwatch createdAt={ticket.createdAt} />
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.45rem',
                    fontWeight: 700,
                    color: '#fff',
                    marginBottom: 4,
                  }}
                >
                  {ticket.tableLabel}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                  Obsluha: <strong style={{ color: '#e2e8f0' }}>{ticket.waiterName || '—'}</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 8 }}>
                  Objednáno {orderTime} · {ticket.receiptNumber}
                  {ticket.ticketValue ? ` · ${formatCurrency(ticket.ticketValue)}` : ''}
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    marginBottom: 10,
                    borderRadius: 999,
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background: preparing
                      ? 'rgba(245,158,11,0.2)'
                      : 'rgba(148,163,184,0.15)',
                    color: preparing ? '#fbbf24' : '#cbd5e1',
                    border: `1px solid ${preparing ? '#f59e0b' : '#64748b'}`,
                  }}
                >
                  {preparing ? 'Příprava' : 'Nová objednávka'}
                </div>

                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(ticket.lines ?? []).map((l, i) => (
                    <li
                      key={`${l.name}-${i}`}
                      style={{ fontSize: '1.12rem', fontWeight: 700, color: '#fff' }}
                    >
                      <span style={{ color: '#D4AF37' }}>{l.qty}×</span> {l.name}
                    </li>
                  ))}
                </ul>

                <div
                  style={{
                    marginTop: 14,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setStatus(ticket, 'preparing')}
                    style={{
                      minHeight: 56,
                      borderRadius: 12,
                      border: '2px solid #f59e0b',
                      background: preparing ? '#f59e0b' : 'rgba(245,158,11,0.15)',
                      color: preparing ? '#111' : '#fbbf24',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      touchAction: 'manipulation',
                      cursor: 'pointer',
                    }}
                  >
                    Příprava
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(ticket, 'done')}
                    style={{
                      minHeight: 56,
                      borderRadius: 12,
                      border: '2px solid #D4AF37',
                      background: '#D4AF37',
                      color: '#0b0f14',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      touchAction: 'manipulation',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Check size={18} /> Hotovo / Vydáno
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>

        {!tickets.length && (
          <div
            style={{
              marginTop: 20,
              textAlign: 'center',
              padding: '3rem',
              color: '#94a3b8',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 16,
            }}
          >
            Žádné aktivní tickety. Nové objednávky z POS se zobrazí automaticky.
          </div>
        )}
      </div>
    </div>
  )
}
