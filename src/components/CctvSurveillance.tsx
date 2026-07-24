import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Flame,
  Lock,
  MessageCircle,
  Monitor,
  Radio,
  ScrollText,
  ShieldAlert,
  Siren,
} from 'lucide-react'
import { useAppStore, selectActiveProject, migrateProject } from '../store/useAppStore'
import { useCctvStore, CCTV_RETENTION_DAYS } from '../store/useCctvStore'
import { hasFeature } from '../lib/subscriptions'
import {
  buildWalkoutWhatsAppMessage,
  czechOrderStatus,
  isTableUnpaidOpen,
  type CctvCamera,
} from '../lib/cctvEngine'
import { cctvStorageStatusLabel } from '../lib/cctvStorage'
import { formatCzechTime } from '../lib/czechDate'
import { openWhatsApp } from '../lib/whatsapp'
import { ensurePosTables as ensureTables } from '../lib/tableTabs'
import { CctvCameraFeed, CctvFullscreenModal } from './cctv/CctvCameraTile'
import { CctvArchivePanel } from './cctv/CctvArchivePanel'

const GOLD = '#D4AF37'

export function CctvSurveillance() {
  const navigate = useNavigate()
  const subscription = useAppStore((s) => s.profile.subscription)
  const profile = useAppStore((s) => s.profile)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)
  const activeRaw = useAppStore(selectActiveProject)
  const posOrders = useAppStore((s) => s.posOrders)
  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])

  const cameras = useCctvStore((s) => s.cameras)
  const alerts = useCctvStore((s) => s.alerts)
  const eventLog = useCctvStore((s) => s.eventLog)
  const monitoring = useCctvStore((s) => s.monitoring)
  const aiToggles = useCctvStore((s) => s.aiToggles)
  const flashingCameraId = useCctvStore((s) => s.flashingCameraId)
  const theftSimRunning = useCctvStore((s) => s.theftSimRunning)
  const standbyTrack = useCctvStore((s) => s.standbyTrack)
  const customZones = useCctvStore((s) => s.customZones)
  const setMonitoring = useCctvStore((s) => s.setMonitoring)
  const setAiToggle = useCctvStore((s) => s.setAiToggle)
  const updateCamera = useCctvStore((s) => s.updateCamera)
  const addCustomZone = useCctvStore((s) => s.addCustomZone)
  const getZoneRegistry = useCctvStore((s) => s.getZoneRegistry)
  const ensureCameras = useCctvStore((s) => s.ensureCameras)
  const seedDemoArchiveIfEmpty = useCctvStore((s) => s.seedDemoArchiveIfEmpty)
  const runRetentionPurge = useCctvStore((s) => s.runRetentionPurge)
  const runTheftSimulation = useCctvStore((s) => s.runTheftSimulation)
  const simulateCashierPaymentHandshake = useCctvStore(
    (s) => s.simulateCashierPaymentHandshake,
  )
  const runFightSimulation = useCctvStore((s) => s.runFightSimulation)
  const acknowledgeAlert = useCctvStore((s) => s.acknowledgeAlert)
  const clearAcknowledged = useCctvStore((s) => s.clearAcknowledged)
  const clearEventLog = useCctvStore((s) => s.clearEventLog)

  const [emergencyPhone, setEmergencyPhone] = useState(profile.phone || '')
  const [fullscreenCam, setFullscreenCam] = useState<CctvCamera | null>(null)

  const unlocked = hasFeature(subscription, 'BUSINESS')
  const tables = useMemo(
    () => (project ? ensureTables(project.posTables) : []),
    [project],
  )

  const unpaidTables = useMemo(
    () => tables.filter((t) => isTableUnpaidOpen(t, posOrders ?? [])),
    [tables, posOrders],
  )

  const zoneRegistry = useMemo(() => getZoneRegistry(), [customZones, getZoneRegistry])

  useEffect(() => {
    if (!unlocked) return
    ensureCameras()
    seedDemoArchiveIfEmpty()
    runRetentionPurge()
  }, [unlocked, ensureCameras, seedDemoArchiveIfEmpty, runRetentionPurge])

  useEffect(() => {
    if (!unlocked) return
    const id = window.setInterval(() => {
      runRetentionPurge()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [unlocked, runRetentionPurge])

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

  const openTvWall = () => {
    // Explicit router switch to standalone layout (no AppShell / sidebar)
    navigate('/cctv-wall')
  }

  const openTvWallNewWindow = () => {
    window.open(`${window.location.origin}/cctv-wall`, 'eventflow_cctv_wall', 'noopener,noreferrer')
  }

  const triggerTheft = async () => {
    const alert = await runTheftSimulation({
      tables,
      orders: posOrders ?? [],
      projectId: project?.id || 'sim',
      forceUnpaidPath: true,
    })
    if (!alert) {
      const track = useCctvStore.getState().standbyTrack
      if (track?.phase === 'cancelled_paid') {
        setToast('Standby zrušen — platba u pokladny (nulový poplach)')
        return
      }
      if (useCctvStore.getState().theftSimRunning) {
        setToast('Simulace handshake právě běží…')
        return
      }
      setToast('Simulace ukončena bez poplachu')
      return
    }
    setToast(alert.message)
  }

  const triggerCashierCancel = () => {
    const ok = simulateCashierPaymentHandshake()
    setToast(
      ok
        ? '✓ Platba u pokladny (Kamera 02) — standby zrušen, nulový poplach'
        : 'Žádný aktivní standby — nejdříve spusťte simulaci útěku',
    )
  }

  const triggerFight = () => {
    const alert = runFightSimulation()
    if (!alert) {
      setToast('Detekce konfliktů vypnuta nebo žádná online kamera v barové zóně')
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
      }),
    )
    setToast('Emergency WhatsApp připraven')
  }

  const activeAlerts = (alerts ?? []).filter((a) => !a.acknowledged)

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
          <h1 className="section-title gold-text">AI Kamerový dohled (CCTV)</h1>
          <p className="section-sub">
            Dynamické párování · TV režim · archiv {CCTV_RETENTION_DAYS} dní · Supabase Storage
          </p>
          <p style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginTop: 4 }}>
            {cctvStorageStatusLabel()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 48 }}
            onClick={openTvWall}
            title="Přepnout React router na /cctv-wall (bez ERP)"
          >
            <Monitor size={15} /> TV režim /cctv-wall
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 48 }}
            onClick={openTvWallNewWindow}
            title="Otevřít TV matici v novém okně / monitoru"
          >
            Nový monitor
          </button>
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
            disabled={theftSimRunning}
            style={{
              minHeight: 52,
              fontWeight: 900,
              background: theftSimRunning ? '#7f1d1d' : '#ef4444',
              borderColor: '#ef4444',
              color: '#fff',
              opacity: theftSimRunning ? 0.85 : 1,
            }}
            onClick={() => void triggerTheft()}
            title="Chytrý handshake: Fáze 1 odchod → Fáze 2 pokladna → Fáze 3 východ = poplach"
          >
            <Siren size={16} />{' '}
            {theftSimRunning
              ? `Handshake běží (${standbyTrack?.phase || '…'})…`
              : '🧪 Nasimulovat útěk bez placení'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              minHeight: 52,
              fontWeight: 800,
              borderColor: '#22c55e',
              color: '#86efac',
            }}
            onClick={triggerCashierCancel}
            title="Fáze 2: simulovat platbu u pokladny — zruší standby (nulový poplach)"
          >
            ✓ Platba u pokladny (zrušit standby)
          </button>
          <button
            type="button"
            className="btn btn-gold"
            style={{
              minHeight: 52,
              fontWeight: 900,
              background: '#d97706',
              borderColor: '#f59e0b',
              color: '#fff',
            }}
            onClick={triggerFight}
            title="Detekce rvaček / konfliktů → jantarové varování na pokladně"
          >
            <Flame size={16} /> Simulovat konflikt / rvačku
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
          <ShieldAlert size={18} color={unpaidTables.length ? '#fca5a5' : GOLD} />
          <strong style={{ color: '#fff' }}>
            Stoly OTEVŘENO (neuhrazeno): {unpaidTables.length}
          </strong>
          <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>
            · napojeno na pos_orders / tables
          </span>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
          {unpaidTables.length
            ? unpaidTables.map((t) => t.label).join(' · ')
            : 'Žádné otevřené neuhrazené účty — simulace útěku přesto cílí na STŮL 3 (demo).'}
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

      <div
        className="panel"
        style={{
          marginBottom: 16,
          borderColor: `${GOLD}55`,
          background: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <AlertTriangle size={16} color={GOLD} />
          <strong style={{ color: GOLD }}>Pokročilá AI analýza — přepínače overlay</strong>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 10,
          }}
        >
          {(
            [
              {
                key: 'walkoutDetection' as const,
                label: 'Útěk bez placení',
                hint: 'Vázáno na stoly OTEVŘENO / pos_orders mimo ZAPLACENO',
              },
              {
                key: 'fightDetection' as const,
                label: 'Detekce rvaček / konfliktů',
                hint: 'Erratický pohyb v barové zóně → jantarové varování na pokladně',
              },
              {
                key: 'heatmap' as const,
                label: 'AI Heatmapa / Hustota fronty',
                hint: 'Barevná mřížka míst s nejdelším stáním hostů',
              },
            ] as const
          ).map((item) => (
            <label
              key={item.key}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                border: `1px solid ${aiToggles[item.key] ? GOLD : '#334155'}`,
                background: aiToggles[item.key] ? 'rgba(212,175,55,0.08)' : '#020617',
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
              title={item.hint}
            >
              <input
                type="checkbox"
                checked={aiToggles[item.key]}
                onChange={(e) => setAiToggle(item.key, e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: GOLD }}
              />
              <span>
                <span style={{ display: 'block', color: '#fff', fontWeight: 800 }}>{item.label}</span>
                <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem', marginTop: 4 }}>
                  {item.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {activeAlerts.slice(0, 8).map((alert) => {
            const isFight = alert.kind === 'fight'
            return (
              <motion.div
                key={alert.id}
                className="panel"
                animate={{ opacity: [1, 0.72, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                style={{
                  borderColor: isFight ? '#f59e0b' : '#ef4444',
                  background: isFight ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      color: isFight ? '#fde68a' : '#fecaca',
                      fontWeight: 900,
                      fontSize: '1.05rem',
                    }}
                  >
                    {alert.message}
                  </div>
                  <div
                    style={{
                      color: isFight ? '#fbbf24' : '#fca5a5',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                    }}
                  >
                    {alert.cameraLabel}
                    {!isFight ? ` · stav účtu ${czechOrderStatus('open')}` : ` · zóna ${alert.tableLabel}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!isFight && (
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
                      onClick={() => sendWhatsApp(alert.tableLabel, alert.cameraLabel)}
                    >
                      <MessageCircle size={16} /> WhatsApp poplach
                    </button>
                  )}
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
            )
          })}
          <button type="button" className="btn btn-ghost" onClick={clearAcknowledged}>
            Vyčistit potvrzené alerty
          </button>
        </div>
      )}

      <div
        className="panel"
        style={{ marginBottom: 16, borderColor: '#334155', background: '#0f172a' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ScrollText size={16} color={GOLD} />
            <strong style={{ color: GOLD }}>Živý event log</strong>
          </div>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={clearEventLog}>
            Vymazat log
          </button>
        </div>
        <div
          style={{
            maxHeight: 180,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '0.78rem',
          }}
        >
          {(eventLog ?? []).length === 0 && (
            <div style={{ color: '#64748b', fontWeight: 600 }}>
              Zatím žádné události — spusťte 🧪 Nasimulovat útěk bez placení.
            </div>
          )}
          {(eventLog ?? []).slice(0, 24).map((row) => (
            <div
              key={row.id}
              style={{
                padding: '0.45rem 0.65rem',
                borderRadius: 8,
                border: '1px solid #1e293b',
                background:
                  row.level === 'alarm'
                    ? 'rgba(239,68,68,0.12)'
                    : row.level === 'warn'
                      ? 'rgba(245,158,11,0.1)'
                      : '#020617',
                color:
                  row.level === 'alarm' ? '#fecaca' : row.level === 'warn' ? '#fde68a' : '#cbd5e1',
              }}
            >
              <span style={{ color: '#64748b' }}>
                {formatCzechTime(row.createdAt)} ·{' '}
              </span>
              {row.message}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {cameras.map((cam) => (
          <CctvCameraFeed
            key={cam.id}
            camera={cam}
            aiToggles={aiToggles}
            enlargeHint
            showConfig
            isFlashing={flashingCameraId === cam.id}
            zoneRegistry={zoneRegistry}
            onAddZone={(zone) => {
              const ok = addCustomZone(zone)
              setToast(
                ok
                  ? `Zóna „${zone.trim()}“ přidána do registru`
                  : `Zóna „${zone.trim()}“ už v registru je nebo je prázdná`,
              )
              return ok
            }}
            onOpen={() => setFullscreenCam(cam)}
            onSaveConfig={(patch) => {
              updateCamera(cam.id, patch)
              setToast(`Kamera „${patch.label || cam.label}“ uložena`)
            }}
          />
        ))}
      </div>

      <CctvArchivePanel />

      <div className="panel" style={{ borderColor: '#334155', background: '#0f172a' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <AlertTriangle size={16} color={GOLD} />
          <strong style={{ color: GOLD }}>Logika Vision AI + infrastruktura</strong>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
          Chytré hlídání: Fáze 1 — klient odchází od stolu (standby log). Fáze 2 — Kamera 02 /
          pokladna: pokud číšník zpracuje platbu, standby se ihned zruší (nulový poplach). Fáze 3 —
          pouze pokud Kamera 01 (Hlavní vchod) detekuje odchod a účet zůstává{' '}
          <strong style={{ color: '#fecaca' }}>OTEVŘENO</strong>, spustí se červený systémový
          poplach. Video chunky cílí do Supabase bucketu{' '}
          <strong style={{ color: GOLD }}>cctv-recordings</strong> ve tvaru{' '}
          <code style={{ color: '#e2e8f0' }}>
            /cctv-recordings/&#123;camera_id&#125;/&#123;YYYY-MM-DD&#125;/&#123;hour&#125;.mp4
          </code>{' '}
          s retencí {CCTV_RETENTION_DAYS} dní. Data v UI: formát <strong>DD.MM.YYYY</strong>.
        </p>
      </div>

      <CctvFullscreenModal
        camera={fullscreenCam}
        aiToggles={aiToggles}
        onClose={() => setFullscreenCam(null)}
      />
    </div>
  )
}
