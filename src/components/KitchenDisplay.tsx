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
import type { KdsTicket, KdsTicketStatus } from '../types'

type StationFilter = 'all' | 'kitchen' | 'bar'

export function KitchenDisplayPage() {
  const location = useLocation()
  const pathFilter: StationFilter = location.pathname.endsWith('/kitchen')
    ? 'kitchen'
    : location.pathname.endsWith('/bar')
      ? 'bar'
      : 'all'

  const storeTickets = useAppStore((s) => s.kdsTickets)
  const setKdsTicketStatus = useAppStore((s) => s.setKdsTicketStatus)
  const addKdsTickets = useAppStore((s) => s.addKdsTickets)
  const [filter, setFilter] = useState<StationFilter>(pathFilter)
  const [flashId, setFlashId] = useState<string | null>(null)

  useEffect(() => {
    setFilter(pathFilter)
  }, [pathFilter])

  useEffect(() => {
    const ch = getPosChannel()
    if (!ch) return
    const onMsg = (ev: MessageEvent<PosBroadcastMessage>) => {
      if (ev.data?.type === 'kds_upsert' && ev.data.payload) {
        addKdsTickets([ev.data.payload])
        setFlashId(ev.data.payload.id)
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
      (useAppStore.getState().kdsTickets ?? []).filter((t) => t.status !== 'done')
    )
    return () => ch.removeEventListener('message', onMsg)
  }, [addKdsTickets, setKdsTicketStatus])

  const tickets = useMemo(() => {
    const list = Array.isArray(storeTickets) ? [...storeTickets] : []
    return list
      .filter((t) => (filter === 'all' ? true : t.station === filter))
      .filter((t) => t.status !== 'done')
      .sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
  }, [storeTickets, filter])

  const title =
    filter === 'kitchen'
      ? 'Displej KUCHYŇ'
      : filter === 'bar'
        ? 'Displej BAR'
        : 'Kitchen Display System'

  const setStatus = (ticket: KdsTicket, status: KdsTicketStatus) => {
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
              Aktivní tickety dle času · Přípravuji · Hotovo / Vydáno
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                onClick={() => setFilter(id)}
                style={{
                  minHeight: 48,
                  minWidth: 48,
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
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {tickets.map((ticket) => {
            const ageMin = Math.max(
              0,
              Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000)
            )
            const preparing = ticket.status === 'preparing'
            const urgent = ageMin >= 8
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
                    preparing
                      ? '#f59e0b'
                      : urgent
                        ? 'rgba(239,68,68,0.55)'
                        : '#334155'
                  }`,
                  background: '#1e293b',
                  borderRadius: 16,
                  padding: '1rem',
                  minHeight: 220,
                  touchAction: 'manipulation',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                  <span
                    style={{
                      background: ticket.station === 'kitchen' ? 'rgba(212,175,55,0.2)' : 'rgba(96,165,250,0.2)',
                      color: ticket.station === 'kitchen' ? '#D4AF37' : '#93c5fd',
                      borderRadius: 999,
                      padding: '0.25rem 0.65rem',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                    }}
                  >
                    {ticket.station === 'kitchen' ? 'Kuchyň' : 'Bar'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: urgent ? '#fca5a5' : '#94a3b8',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Clock3 size={14} /> {ageMin} min
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    color: '#fff',
                    marginBottom: 4,
                  }}
                >
                  {ticket.tableLabel}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 8 }}>
                  {ticket.receiptNumber} · {ticket.projectName}
                  {ticket.waiterName ? ` · ${ticket.waiterName}` : ''}
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    marginBottom: 10,
                    borderRadius: 999,
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background: preparing ? 'rgba(245,158,11,0.2)' : 'rgba(148,163,184,0.15)',
                    color: preparing ? '#fbbf24' : '#cbd5e1',
                    border: `1px solid ${preparing ? '#f59e0b' : '#64748b'}`,
                  }}
                >
                  {preparing ? 'Přípravuji' : 'Nová objednávka'}
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
                      minHeight: 52,
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
                    Přípravuji
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(ticket, 'done')}
                    style={{
                      minHeight: 52,
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
