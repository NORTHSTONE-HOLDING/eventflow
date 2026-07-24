import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Archive,
  Flame,
  Lock,
  MessageCircle,
  Monitor,
  Radio,
  ShieldAlert,
  Siren,
  Trash2,
} from 'lucide-react'
import { useAppStore, selectActiveProject, migrateProject } from '../store/useAppStore'
import { useCctvStore, CCTV_RETENTION_DAYS } from '../store/useCctvStore'
import { hasFeature } from '../lib/subscriptions'
import {
  buildWalkoutWhatsAppMessage,
  czechOrderStatus,
  isTableUnpaidOpen,
} from '../lib/cctvEngine'
import { openWhatsApp } from '../lib/whatsapp'
import { ensurePosTables as ensureTables } from '../lib/tableTabs'
import { CctvCameraFeed, CctvFullscreenModal } from './cctv/CctvCameraTile'
import type { CctvCamera } from '../lib/cctvEngine'

const GOLD = '#D4AF37'

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
  const aiToggles = useCctvStore((s) => s.aiToggles)
  const recordings = useCctvStore((s) => s.recordings)
  const lastRetentionPurgeAt = useCctvStore((s) => s.lastRetentionPurgeAt)
  const lastPurgedCount = useCctvStore((s) => s.lastPurgedCount)
  const setMonitoring = useCctvStore((s) => s.setMonitoring)
  const setAiToggle = useCctvStore((s) => s.setAiToggle)
  const updateCamera = useCctvStore((s) => s.updateCamera)
  const ensureCameras = useCctvStore((s) => s.ensureCameras)
  const seedDemoArchiveIfEmpty = useCctvStore((s) => s.seedDemoArchiveIfEmpty)
  const runRetentionPurge = useCctvStore((s) => s.runRetentionPurge)
  const runWalkoutSimulation = useCctvStore((s) => s.runWalkoutSimulation)
  const runFightSimulation = useCctvStore((s) => s.runFightSimulation)
  const acknowledgeAlert = useCctvStore((s) => s.acknowledgeAlert)
  const clearAcknowledged = useCctvStore((s) => s.clearAcknowledged)
  const getArchiveByDay = useCctvStore((s) => s.getArchiveByDay)

  const [emergencyPhone, setEmergencyPhone] = useState(profile.phone || '')
  const [fullscreenCam, setFullscreenCam] = useState<CctvCamera | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(true)

  const unlocked = hasFeature(subscription, 'BUSINESS')
  const tables = useMemo(
    () => (project ? ensureTables(project.posTables) : []),
    [project],
  )

  const unpaidTables = useMemo(
    () => tables.filter((t) => isTableUnpaidOpen(t, posOrders ?? [])),
    [tables, posOrders],
  )

  const archiveByDay = useMemo(() => getArchiveByDay(), [recordings, getArchiveByDay])

  useEffect(() => {
    if (!unlocked) return
    ensureCameras()
    seedDemoArchiveIfEmpty()
    const purged = runRetentionPurge()
    if (purged > 0) {
      setToast(`Retence ${CCTV_RETENTION_DAYS} dní: smazáno ${purged} expirovaných segmentů`)
    }
  }, [unlocked, ensureCameras, seedDemoArchiveIfEmpty, runRetentionPurge, setToast])

  // Periodic retention sweep (capacity guard)
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

  const triggerWalkout = () => {
    if (!project) {
      setToast('Nejdříve vyberte aktivní akci')
      return
    }
    if (!unpaidTables.length) {
      setToast(
        'Žádný stůl ve stavu OTEVŘENO s neuhrazeným účtem — přidejte položky na stůl v POS',
      )
      return
    }
    const alert = runWalkoutSimulation({
      tables,
      orders: posOrders ?? [],
      projectId: project.id,
    })
    if (!alert) {
      setToast('Simulace selhala — zkontrolujte kamery / AI přepínače')
      return
    }
    setToast(alert.message)
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
            Dynamické párování · TV režim · archiv {CCTV_RETENTION_DAYS} dní · pokročilá AI analýza
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            to="/cctv-wall"
            className="btn btn-ghost"
            style={{
              minHeight: 48,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
            }}
            title="Samostatná TV matice bez ERP navigace"
          >
            <Monitor size={15} /> TV režim /cctv-wall
          </Link>
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
            onClick={triggerWalkout}
            title="Simulace útěku bez placení (pos_orders OTEVŘENO)"
          >
            <Siren size={16} /> Simulovat útěk bez placení
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
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
          {unpaidTables.length
            ? unpaidTables.map((t) => t.label).join(' · ')
            : 'Žádné otevřené neuhrazené účty — algoritmus „Útěk bez placení“ se nespustí.'}
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
            onOpen={() => setFullscreenCam(cam)}
            onSaveConfig={(patch) => {
              updateCamera(cam.id, patch)
              setToast(`Kamera „${patch.label || cam.label}“ uložena`)
            }}
          />
        ))}
      </div>

      <div
        className="panel"
        style={{ marginBottom: 16, borderColor: '#334155', background: '#0f172a' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: archiveOpen ? 12 : 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Archive size={16} color={GOLD} />
            <strong style={{ color: GOLD }}>Archiv záznamů</strong>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
              · rotace {CCTV_RETENTION_DAYS} dní (~2 měsíce) · {recordings.length} segmentů
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 42 }}
              onClick={() => setArchiveOpen((v) => !v)}
            >
              {archiveOpen ? 'Skrýt archiv' : 'Zobrazit archiv'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 42 }}
              title="Spustit čištění expirovaných nahrávek"
              onClick={() => {
                const n = runRetentionPurge()
                setToast(
                  n > 0
                    ? `Trvale smazáno ${n} segmentů starších než ${CCTV_RETENTION_DAYS} dní`
                    : `Žádné segmenty starší než ${CCTV_RETENTION_DAYS} dní`,
                )
              }}
            >
              <Trash2 size={14} /> Spustit retenci
            </button>
          </div>
        </div>

        <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 600, marginBottom: archiveOpen ? 12 : 0 }}>
          Poslední čištění:{' '}
          {lastRetentionPurgeAt
            ? new Date(lastRetentionPurgeAt).toLocaleString('cs-CZ')
            : 'ještě neproběhlo'}
          {lastPurgedCount > 0 ? ` · naposledy smazáno ${lastPurgedCount}` : ''}
        </div>

        {archiveOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflow: 'auto' }}>
            {archiveByDay.length === 0 && (
              <div style={{ color: '#94a3b8', fontWeight: 600 }}>Archiv je prázdný.</div>
            )}
            {archiveByDay.map((day) => (
              <div
                key={day.dayKey}
                style={{
                  border: '1px solid #334155',
                  borderRadius: 12,
                  background: '#020617',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    background: '#0b1220',
                  }}
                >
                  <strong style={{ color: '#e2e8f0' }}>
                    {new Date(day.dayKey + 'T12:00:00').toLocaleDateString('cs-CZ', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </strong>
                  <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700 }}>
                    {day.items.length} záznamů · ~{day.totalMb} MB
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {day.items.map((seg) => (
                    <div
                      key={seg.id}
                      style={{
                        padding: '0.55rem 0.85rem',
                        borderTop: '1px solid #1e293b',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.85rem' }}>
                          {seg.cameraLabel}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>
                          {new Date(seg.createdAt).toLocaleTimeString('cs-CZ', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {Math.round(seg.durationSec / 60)} min · {seg.resolution} {seg.fps}fps ·{' '}
                          {seg.note}
                        </div>
                      </div>
                      <span style={{ color: GOLD, fontWeight: 800, fontSize: '0.78rem' }}>
                        {seg.sizeMb} MB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="panel"
        style={{ borderColor: '#334155', background: '#0f172a' }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <AlertTriangle size={16} color={GOLD} />
          <strong style={{ color: GOLD }}>Logika Vision AI</strong>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
          Útěk bez placení: pokud Vision AI detekuje pohyb od stolu k východu a účet je ve stavu{' '}
          <strong style={{ color: '#fecaca' }}>OTEVŘENO</strong> (neuhrazené položky / pos_orders
          mimo ZAPLACENO), spustí se červený poplach na POS. Detekce rvaček / konfliktů v barové zóně
          vyšle jantarové varování na pokladní obrazovku. Heatmapa zobrazuje hustotu stání pro
          optimalizaci obsluhy. Archiv automaticky maže metadata starší než {CCTV_RETENTION_DAYS}{' '}
          dní.
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
