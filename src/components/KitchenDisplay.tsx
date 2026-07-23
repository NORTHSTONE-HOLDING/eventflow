import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChefHat, Wine } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  getPosChannel,
  publishKdsStatus,
  type PosBroadcastMessage,
} from '../lib/kdsSync'
import type { KdsTicket, KdsTicketStatus } from '../types'

export function KitchenDisplayPage() {
  const storeTickets = useAppStore((s) => s.kdsTickets)
  const setKdsTicketStatus = useAppStore((s) => s.setKdsTicketStatus)
  const addKdsTickets = useAppStore((s) => s.addKdsTickets)
  const setToast = useAppStore((s) => s.setToast)
  const [filter, setFilter] = useState<'all' | 'kitchen' | 'bar'>('all')
  const [flashId, setFlashId] = useState<string | null>(null)

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
    }
    ch.addEventListener('message', onMsg)
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

  const markDone = (ticket: KdsTicket) => {
    const status: KdsTicketStatus = 'done'
    setKdsTicketStatus(ticket.id, status)
    publishKdsStatus(ticket.id, status)
    setToast(
      `Hotovo · ${ticket.station === 'kitchen' ? 'Kuchyň' : 'Bar'} · ${ticket.receiptNumber}`
    )
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('EventFlow KDS', {
          body: `Ticket ${ticket.receiptNumber} označen jako Hotovo`,
        })
      } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
        Notification.requestPermission()
      }
    } catch {
      // ignore
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-deep)',
        color: 'var(--text)',
        padding: '1.25rem',
      }}
    >
      <div className="gradient-mesh" style={{ opacity: 0.4 }} />
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
            <h1 className="gold-text" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>
              Kitchen Display System
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Digitální boničky · řazeno podle času · klepnutím Hotovo
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(
              [
                ['all', 'Vše'],
                ['kitchen', 'Kuchyň'],
                ['bar', 'Bar'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? 'btn btn-gold' : 'btn btn-ghost'}
                style={{ minHeight: 44 }}
                onClick={() => setFilter(id)}
              >
                {id === 'kitchen' ? <ChefHat size={15} /> : id === 'bar' ? <Wine size={15} /> : null}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {tickets.map((ticket) => {
            const ageMin = Math.max(
              0,
              Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000)
            )
            const urgent = ageMin >= 8
            return (
              <motion.button
                key={ticket.id}
                type="button"
                onClick={() => markDone(ticket)}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  boxShadow:
                    flashId === ticket.id
                      ? '0 0 30px rgba(212,175,55,0.45)'
                      : 'none',
                }}
                className="panel glass-glow"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'inherit',
                  borderColor: urgent ? 'rgba(239,68,68,0.5)' : 'var(--border-strong)',
                  minHeight: 200,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="badge badge-gold">
                    {ticket.station === 'kitchen' ? 'Kuchyň' : 'Bar'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: urgent ? '#fca5a5' : 'var(--text-dim)' }}>
                    {ageMin} min
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: 4 }}>
                  {ticket.tableLabel}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  {ticket.receiptNumber} · {ticket.projectName}
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(ticket.lines ?? []).map((l, i) => (
                    <li key={`${l.name}-${i}`} style={{ fontSize: '1.05rem', fontWeight: 500 }}>
                      <span style={{ color: 'var(--gold)' }}>{l.qty}×</span> {l.name}
                    </li>
                  ))}
                </ul>
                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--gold)',
                    fontSize: '0.85rem',
                  }}
                >
                  <Check size={16} /> Klepněte = Hotovo
                </div>
              </motion.button>
            )
          })}
        </div>

        {!tickets.length && (
          <div className="panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Žádné aktivní tickety. Nové objednávky z POS se zobrazí automaticky.
          </div>
        )}
      </div>
    </div>
  )
}
