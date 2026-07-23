import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard } from 'lucide-react'
import type { CustomerDisplayState } from '../types'
import { emptyCustomerDisplay, getPosChannel, type PosBroadcastMessage } from '../lib/kdsSync'
import { formatCurrency } from '../lib/documentIds'

export function CustomerDisplayPage() {
  const [state, setState] = useState<CustomerDisplayState>(() => {
    try {
      const raw = localStorage.getItem('eventflow-customer-display')
      if (raw) return JSON.parse(raw) as CustomerDisplayState
    } catch {
      // ignore
    }
    return emptyCustomerDisplay()
  })

  useEffect(() => {
    const ch = getPosChannel()
    if (!ch) return
    const onMsg = (ev: MessageEvent<PosBroadcastMessage>) => {
      if (ev.data?.type === 'customer_display') {
        setState(ev.data.payload)
      }
    }
    ch.addEventListener('message', onMsg)
    return () => ch.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'eventflow-customer-display' && e.newValue) {
        try {
          setState(JSON.parse(e.newValue) as CustomerDisplayState)
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const lines = Array.isArray(state.lines) ? state.lines : []

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-deep)',
        color: 'var(--text)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="gradient-mesh" />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 'clamp(1.5rem, 4vw, 3rem)',
          maxWidth: 900,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            className="gold-text"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 5vw, 3.2rem)',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            EventFlow
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '0.8rem' }}>
            {state.projectName || 'Zákaznický display'}
          </div>
        </div>

        <div className="panel" style={{ flex: 1, borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-gold)' }}>
          <AnimatePresence mode="wait">
            {state.phase === 'tap_card' ? (
              <motion.div
                key="tap"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: '2rem 1rem' }}
              >
                <motion.div
                  animate={{ y: [0, -10, 0], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  style={{ marginBottom: 20 }}
                >
                  <CreditCard size={72} color="var(--gold)" />
                </motion.div>
                <div className="gold-text" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontFamily: 'var(--font-display)' }}>
                  Přiložte kartu
                </div>
                <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                  {state.message}
                </div>
                <div style={{ marginTop: 24, fontSize: 'clamp(2rem, 5vw, 3rem)', color: 'var(--gold)', fontWeight: 600 }}>
                  {formatCurrency(state.total || 0)}
                </div>
              </motion.div>
            ) : state.phase === 'approved' ? (
              <motion.div
                key="ok"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ textAlign: 'center', padding: '3rem 1rem' }}
              >
                <div className="gold-text" style={{ fontSize: '2.2rem', fontFamily: 'var(--font-display)' }}>
                  Platba schválena
                </div>
                <div style={{ marginTop: 10, color: 'var(--text-muted)' }}>{state.message}</div>
              </motion.div>
            ) : state.phase === 'rejected' ? (
              <motion.div
                key="rej"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ textAlign: 'center', padding: '3rem 1rem', color: '#fca5a5' }}
              >
                <div style={{ fontSize: '2rem', fontFamily: 'var(--font-display)' }}>Platba zamítnuta</div>
                <div style={{ marginTop: 10 }}>{state.message}</div>
              </motion.div>
            ) : (
              <motion.div key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 style={{ fontSize: '1.4rem', marginBottom: 16, color: 'var(--gold)' }}>Vaše položky</h2>
                {!lines.length && (
                  <div style={{ color: 'var(--text-dim)', padding: '2rem 0', textAlign: 'center' }}>
                    {state.message || 'Čekáme na objednávku…'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lines.map((l, i) => (
                    <div
                      key={`${l.name}-${i}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.85rem 0',
                        borderBottom: '1px solid var(--border)',
                        fontSize: '1.15rem',
                      }}
                    >
                      <span>
                        {l.name} <span style={{ color: 'var(--text-muted)' }}>×{l.qty}</span>
                      </span>
                      <span style={{ color: 'var(--gold)' }}>{formatCurrency(l.price)}</span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 24,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
                    fontWeight: 600,
                  }}
                >
                  <span>Celkem</span>
                  <span className="gold-text">{formatCurrency(state.total || 0)}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
