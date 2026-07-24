import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Camera,
  Lock,
  MessageCircle,
  Radio,
  ShieldAlert,
  Siren,
} from 'lucide-react'
import { useAppStore, selectActiveProject, migrateProject } from '../store/useAppStore'
import { useCctvStore } from '../store/useCctvStore'
import { hasFeature } from '../lib/subscriptions'
import {
  buildWalkoutWhatsAppMessage,
  czechOrderStatus,
  isTableUnpaidOpen,
} from '../lib/cctvEngine'
import { openWhatsApp } from '../lib/whatsapp'
import { ensurePosTables as ensureTables } from '../lib/tableTabs'

export function CctvSurveillance() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const profile = useAppStore((s) => s.profile)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)
  const activeRaw = useAppStore(selectActiveProject)
  const posOrders = useAppStore((s) => s.posOrders)
  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])

  const cameras = useCctvStore((s) => s.cameras)
  const alerts = useCctvStore((s) => s.alerts)
  const monitoring = useCctvStore((s) => s.monitoring)
  const setMonitoring = useCctvStore((s) => s.setMonitoring)
  const runWalkoutSimulation = useCctvStore((s) => s.runWalkoutSimulation)
  const acknowledgeAlert = useCctvStore((s) => s.acknowledgeAlert)
  const clearAcknowledged = useCctvStore((s) => s.clearAcknowledged)

  const [emergencyPhone, setEmergencyPhone] = useState(profile.phone || '')

  const unlocked = hasFeature(subscription, 'BUSINESS')
  const tables = useMemo(
    () => (project ? ensureTables(project.posTables) : []),
    [project]
  )

  const unpaidTables = useMemo(
    () => tables.filter((t) => isTableUnpaidOpen(t, posOrders ?? [])),
    [tables, posOrders]
  )

  if (!unlocked) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">AI Kamerový dohled (CCTV)</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 300 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Kamerový dohled a detekce útěků = BUSINESS+</div>
          <button type="button" className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat
          </button>
        </div>
      </div>
    )
  }

  const triggerSimulation = () => {
    if (!project) {
      setToast('Nejdříve vyberte aktivní akci')
      return
    }
    if (!unpaidTables.length) {
      setToast(
        'Žádný stůl ve stavu OTEVŘENO s neuhrazeným účtem — přidejte položky na stůl v POS'
      )
      return
    }
    const alert = runWalkoutSimulation({
      tables,
      orders: posOrders ?? [],
      projectId: project.id,
    })
    if (!alert) {
      setToast('Simulace selhala — zkontrolujte kamery')
      return
    }
    setToast(alert.message)
  }

  const sendWhatsApp = (tableLabel: string, cameraLabel: string) => {
    const phone = emergencyPhone.trim() || profile.phone
    if (!phone) {
      setToast('Zadejte telefon pro emergency WhatsApp')
      return
    }
    openWhatsApp(
      phone,
      buildWalkoutWhatsAppMessage({
        tableLabel,
        cameraLabel,
        companyName: profile.companyName || 'EventFlow',
        locationHint: project?.location,
      })
    )
    setToast('Emergency WhatsApp připraven')
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease', touchAction: 'manipulation' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h1 className="section-title gold-text">📹 AI Kamerový dohled (CCTV)</h1>
          <p className="section-sub">
            Vision AI · detekce útěků bez placení · až 10 IP kamer · stav OTEVŘENO
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={monitoring ? 'btn btn-gold' : 'btn btn-ghost'}
            style={{ minHeight: 48 }}
            onClick={() => setMonitoring(!monitoring)}
          >
            <Radio size={15} /> {monitoring ? 'Monitoring ZAPNUT' : 'Monitoring VYPNUT'}
          </button>
          <button
            type="button"
            className="btn btn-gold"
            style={{
              minHeight: 52,
              fontWeight: 900,
              background: '#ef4444',
              borderColor: '#ef4444',
              color: '#fff',
            }}
            onClick={triggerSimulation}
          >
            <Siren size={16} /> Simulovat detekci útěku
          </button>
        </div>
      </div>

      <div
        className="panel"
        style={{
          marginBottom: 16,
          borderColor: unpaidTables.length ? 'rgba(239,68,68,0.45)' : '#334155',
          background: unpaidTables.length ? 'rgba(239,68,68,0.08)' : '#0f172a',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <ShieldAlert size={18} color={unpaidTables.length ? '#fca5a5' : '#D4AF37'} />
          <strong style={{ color: '#fff' }}>
            Stoly OTEVŘENO (neuhrazeno): {unpaidTables.length}
          </strong>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
          {unpaidTables.length
            ? unpaidTables.map((t) => t.label).join(' · ')
            : 'Žádné otevřené neuhrazené účty — Vision AI poplach se nespustí.'}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="label">Emergency WhatsApp telefon</label>
            <input
              className="input"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="+420…"
              style={{ minHeight: 48, background: '#1e293b', borderColor: '#334155' }}
            />
          </div>
        </div>
      </div>

      {(alerts ?? []).filter((a) => !a.acknowledged).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {alerts
            .filter((a) => !a.acknowledged)
            .slice(0, 8)
            .map((alert) => (
              <motion.div
                key={alert.id}
                className="panel"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                style={{
                  borderColor: '#ef4444',
                  background: 'rgba(239,68,68,0.15)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ color: '#fecaca', fontWeight: 900, fontSize: '1.05rem' }}>
                    {alert.message}
                  </div>
                  <div style={{ color: '#fca5a5', fontSize: '0.8rem', fontWeight: 700 }}>
                    {alert.cameraLabel} · stav účtu {czechOrderStatus('open')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={{
                      minHeight: 48,
                      padding: '0.65rem 1rem',
                      borderRadius: 10,
                      border: 'none',
                      background: '#10b981',
                      color: '#042f1a',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      touchAction: 'manipulation',
                    }}
                    onClick={() =>
                      sendWhatsApp(alert.tableLabel, alert.cameraLabel)
                    }
                  >
                    <MessageCircle size={16} /> WhatsApp poplach
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 48 }}
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    Potvrdit zásah
                  </button>
                </div>
              </motion.div>
            ))}
          <button type="button" className="btn btn-ghost" onClick={clearAcknowledged}>
            Vyčistit potvrzené alerty
          </button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {cameras.map((cam) => (
          <div
            key={cam.id}
            style={{
              borderRadius: 14,
              border: `2px solid ${
                cam.status === 'alert'
                  ? '#ef4444'
                  : cam.status === 'offline'
                    ? '#475569'
                    : '#334155'
              }`,
              background: '#0f172a',
              overflow: 'hidden',
              minHeight: 200,
            }}
          >
            <div
              style={{
                height: 120,
                background: `linear-gradient(135deg, ${cam.accent}33, #020617 60%)`,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Camera size={36} color={cam.status === 'offline' ? '#64748b' : cam.accent} />
              {cam.status === 'online' && (
                <motion.div
                  animate={{ opacity: [0.15, 0.45, 0.15] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px)',
                    pointerEvents: 'none',
                  }}
                />
              )}
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  padding: '0.2rem 0.5rem',
                  borderRadius: 999,
                  background:
                    cam.status === 'alert'
                      ? '#ef4444'
                      : cam.status === 'offline'
                        ? '#475569'
                        : '#10b981',
                  color: '#fff',
                }}
              >
                {cam.status === 'alert'
                  ? 'POPLACH'
                  : cam.status === 'offline'
                    ? 'OFFLINE'
                    : 'LIVE'}
              </span>
            </div>
            <div style={{ padding: '0.85rem' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>
                {cam.label}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginTop: 4 }}>
                Zóna: {cam.zone}
                {cam.linkedTableLabels.length
                  ? ` · stoly: ${cam.linkedTableLabels.join(', ')}`
                  : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="panel"
        style={{ marginTop: 16, borderColor: '#334155', background: '#0f172a' }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <AlertTriangle size={16} color="#D4AF37" />
          <strong style={{ color: '#D4AF37' }}>Logika Vision AI</strong>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
          Pokud matice Vision AI detekuje hosty vstávající a pohybující se od zóny stolu směrem k
          východu a současně je účet stolu ve stavu{' '}
          <strong style={{ color: '#fecaca' }}>OTEVŘENO</strong> (neuhrazené položky / pos_orders
          mimo ZAPLACENO), spustí se prioritní červený poplach na všech POS terminálech personálu:
          „🚨 POPLACH: Podezření na útěk bez placení ze STOLU [Číslo]!“ s možností okamžitého
          WhatsApp dispatch.
        </p>
      </div>
    </div>
  )
}
