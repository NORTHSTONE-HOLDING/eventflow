import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Siren } from 'lucide-react'
import { getPosChannel, type PosBroadcastMessage } from '../../lib/kdsSync'
import { playSecurityAlarmSound, type CctvWalkoutAlert } from '../../lib/cctvEngine'
import { useCctvStore } from '../../store/useCctvStore'
import { usePosSessionStore } from '../../store/usePosSessionStore'

const GOLD = '#D4AF37'

/**
 * System-wide CCTV security flash — mount in AppShell, POS terminal, TV wall.
 * Prominent „Zavřít / Vyřešeno“ dismiss control for touch staff terminals.
 */
export function CctvSecurityBanner() {
  const globalAlert = useCctvStore((s) => s.globalAlert)
  const resolveGlobalAlert = useCctvStore((s) => s.resolveGlobalAlert)

  useEffect(() => {
    const applyRemote = (
      payload:
        | CctvWalkoutAlert
        | {
            message: string
            tableLabel?: string
            kind?: string
            cameraId?: string
            cameraLabel?: string
            id?: string
            createdAt?: string
          },
    ) => {
      if (!payload?.message) return
      const current = useCctvStore.getState().globalAlert
      if (
        current?.message === payload.message &&
        Date.now() - new Date(current.createdAt).getTime() < 2000
      ) {
        return
      }
      useCctvStore.setState({
        globalAlert: {
          id: payload.id || `remote_${Date.now()}`,
          message: payload.message,
          tableLabel: payload.tableLabel || '',
          cameraId: payload.cameraId || '',
          cameraLabel: payload.cameraLabel || '',
          createdAt: payload.createdAt || new Date().toISOString(),
          kind: (payload.kind as 'walkout' | 'fight' | 'queue') || 'walkout',
        },
      })
      try {
        usePosSessionStore.getState().pushSecurityAlert({
          message: payload.message,
          tableLabel: payload.tableLabel || '',
        })
      } catch {
        // ignore
      }
      if (!current) playSecurityAlarmSound()
    }

    const ch = getPosChannel()
    const onMsg = (ev: MessageEvent<PosBroadcastMessage>) => {
      if (ev.data?.type === 'security_alert' && ev.data.payload) {
        applyRemote(ev.data.payload)
      }
    }
    ch?.addEventListener('message', onMsg)

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'eventflow-security-alert' || !e.newValue) return
      try {
        applyRemote(JSON.parse(e.newValue))
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', onStorage)

    try {
      const raw = localStorage.getItem('eventflow-security-alert')
      if (raw) {
        const parsed = JSON.parse(raw) as { message?: string; ts?: number }
        if (parsed?.message && parsed.ts && Date.now() - parsed.ts < 15_000) {
          applyRemote(JSON.parse(raw))
        }
      }
    } catch {
      // ignore
    }

    return () => {
      ch?.removeEventListener('message', onMsg)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return (
    <AnimatePresence>
      {globalAlert && (
        <motion.div
          key={globalAlert.id}
          initial={{ opacity: 0, y: -28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ duration: 0.28 }}
          role="alertdialog"
          aria-live="assertive"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9000,
            width: 'min(96vw, 820px)',
            padding: '1.15rem 1.2rem 1.2rem',
            borderRadius: 16,
            background: 'linear-gradient(145deg, #7f1d1d 0%, #dc2626 45%, #7f1d1d 100%)',
            color: '#fff',
            border: `3px solid ${GOLD}`,
            boxShadow: '0 22px 60px rgba(239,68,68,0.55), 0 0 0 1px rgba(212,175,55,0.35)',
            touchAction: 'manipulation',
          }}
        >
          <motion.div
            animate={{ opacity: [1, 0.82, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
            style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}
          >
            <Siren size={32} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 'clamp(1.05rem, 2.6vw, 1.35rem)',
                  lineHeight: 1.3,
                  letterSpacing: '0.01em',
                }}
              >
                {globalAlert.message}
              </div>
              <div style={{ marginTop: 8, fontSize: '0.82rem', fontWeight: 700, color: '#fecaca' }}>
                {globalAlert.cameraLabel ? `${globalAlert.cameraLabel} · ` : ''}
                Priorita: KRITICKÁ · EventFlow Security
              </div>
            </div>
          </motion.div>

          <button
            type="button"
            title="Zavřít poplach — označit jako vyřešený"
            onClick={() => resolveGlobalAlert()}
            style={{
              marginTop: 14,
              width: '100%',
              minHeight: 56,
              borderRadius: 12,
              border: `2px solid ${GOLD}`,
              background: `linear-gradient(180deg, #f5e6a3 0%, ${GOLD} 55%, #b8860b 100%)`,
              color: '#1a1200',
              fontWeight: 900,
              fontSize: '1.05rem',
              letterSpacing: '0.02em',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              touchAction: 'manipulation',
              boxShadow: '0 8px 24px rgba(212,175,55,0.45)',
            }}
          >
            <CheckCircle2 size={22} />
            Zavřít / Vyřešeno
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
