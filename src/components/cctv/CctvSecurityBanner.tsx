import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Siren, X } from 'lucide-react'
import { getPosChannel, type PosBroadcastMessage } from '../../lib/kdsSync'
import { playSecurityAlarmSound, type CctvWalkoutAlert } from '../../lib/cctvEngine'
import { useCctvStore } from '../../store/useCctvStore'
import { usePosSessionStore } from '../../store/usePosSessionStore'

const GOLD = '#D4AF37'

/**
 * System-wide CCTV security flash — mount in AppShell, POS terminal, TV wall.
 * Consumes zustand globalAlert + BroadcastChannel / localStorage for cross-tab.
 */
export function CctvSecurityBanner() {
  const globalAlert = useCctvStore((s) => s.globalAlert)
  const dismissGlobalAlert = useCctvStore((s) => s.dismissGlobalAlert)
  const acknowledgeAlert = useCctvStore((s) => s.acknowledgeAlert)
  const pushEventLog = useCctvStore((s) => s.pushEventLog)

  useEffect(() => {
    const applyRemote = (payload: CctvWalkoutAlert | { message: string; tableLabel?: string; kind?: string; cameraId?: string; cameraLabel?: string; id?: string; createdAt?: string }) => {
      if (!payload?.message) return
      // Avoid double-apply if we already own this alert
      const current = useCctvStore.getState().globalAlert
      if (current?.message === payload.message && Date.now() - new Date(current.createdAt).getTime() < 2000) {
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
      // Sound for cross-tab / hydrate only (same-tab sim already beeped)
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

    // Hydrate last alert if arriving on a fresh mount (same tab after navigation)
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
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: [1, 0.85, 1], y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, opacity: { repeat: Infinity, duration: 0.85 } }}
          role="alertdialog"
          aria-live="assertive"
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9000,
            width: 'min(96vw, 760px)',
            padding: '1.15rem 1.25rem',
            borderRadius: 14,
            background: 'linear-gradient(135deg, #7f1d1d, #ef4444 55%, #991b1b)',
            color: '#fff',
            border: `2px solid ${GOLD}`,
            boxShadow: '0 18px 50px rgba(239,68,68,0.55)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            touchAction: 'manipulation',
          }}
        >
          <Siren size={28} color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.15rem', lineHeight: 1.35 }}>
              {globalAlert.message}
            </div>
            <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 700, color: '#fecaca' }}>
              {globalAlert.cameraLabel
                ? `${globalAlert.cameraLabel} · `
                : ''}
              Priorita: KRITICKÁ · EventFlow Security
            </div>
          </div>
          <button
            type="button"
            title="Potvrdit a zavřít poplach"
            onClick={() => {
              acknowledgeAlert(globalAlert.id)
              dismissGlobalAlert()
              pushEventLog({
                level: 'info',
                message: `Poplach potvrzen operátorem — ${globalAlert.message}`,
                cameraId: globalAlert.cameraId,
                tableLabel: globalAlert.tableLabel,
              })
            }}
            style={{
              minHeight: 40,
              minWidth: 40,
              borderRadius: 10,
              border: '1px solid #fff',
              background: 'rgba(0,0,0,0.25)',
              color: '#fff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
