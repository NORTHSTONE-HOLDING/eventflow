import { useEffect, useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Maximize2, Plus, Settings2, X } from 'lucide-react'
import {
  type CctvAiToggles,
  type CctvCamera,
  type CctvZoneCategory,
} from '../../lib/cctvEngine'

const GOLD = '#D4AF37'

export function ConnectionDot({ status }: { status: CctvCamera['status'] }) {
  const color =
    status === 'offline' ? '#ef4444' : status === 'alert' ? '#f59e0b' : '#22c55e'
  const title =
    status === 'offline'
      ? 'Stav připojení: OFFLINE'
      : status === 'alert'
        ? 'Stav připojení: POPLACH'
        : 'Stav připojení: ONLINE'
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 0 3px ${color}33`,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

function HeatmapOverlay({ active }: { active: boolean }) {
  const cells = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        const row = Math.floor(i / 8)
        const col = i % 8
        // Hotter near bottom-center (queue / bar density)
        const heat = Math.max(
          0,
          1 - Math.hypot(col - 3.5, row - 4.2) / 5.2 + ((i * 17) % 10) / 40,
        )
        return heat
      }),
    [],
  )
  if (!active) return null
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(6, 1fr)',
        pointerEvents: 'none',
        opacity: 0.55,
        mixBlendMode: 'screen',
      }}
    >
      {cells.map((heat, i) => (
        <div
          key={i}
          style={{
            background:
              heat > 0.72
                ? 'rgba(239,68,68,0.75)'
                : heat > 0.45
                  ? 'rgba(245,158,11,0.55)'
                  : heat > 0.25
                    ? 'rgba(34,197,94,0.35)'
                    : 'transparent',
          }}
        />
      ))}
    </div>
  )
}

function Scanlines({ online }: { online: boolean }) {
  if (!online) return null
  return (
    <motion.div
      animate={{ opacity: [0.12, 0.35, 0.12] }}
      transition={{ duration: 2.6, repeat: Infinity }}
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px)',
        pointerEvents: 'none',
      }}
    />
  )
}

export function CameraConfigForm({
  camera,
  onSave,
  compact,
  zoneRegistry,
  onAddZone,
}: {
  camera: CctvCamera
  onSave: (patch: Partial<CctvCamera>) => void
  compact?: boolean
  zoneRegistry: string[]
  onAddZone: (zone: string) => boolean
}) {
  const [label, setLabel] = useState(camera.label)
  const [zone, setZone] = useState(camera.zone)
  const [zoneCategory, setZoneCategory] = useState<CctvZoneCategory>(camera.zoneCategory)
  const [rtspUrl, setRtspUrl] = useState(camera.rtspUrl)
  const [newZone, setNewZone] = useState('')

  useEffect(() => {
    setLabel(camera.label)
    setZone(camera.zone)
    setZoneCategory(camera.zoneCategory)
    setRtspUrl(camera.rtspUrl)
  }, [camera.id, camera.label, camera.zone, camera.zoneCategory, camera.rtspUrl])

  const registry = useMemo(() => {
    const base = [...zoneRegistry]
    if (zoneCategory && !base.includes(zoneCategory)) base.unshift(zoneCategory)
    return base
  }, [zoneRegistry, zoneCategory])

  const save = () => {
    onSave({
      label: label.trim() || camera.label,
      zone: zone.trim() || zoneCategory,
      zoneCategory,
      rtspUrl: rtspUrl.trim(),
    })
  }

  const addZone = () => {
    const ok = onAddZone(newZone)
    if (ok) {
      const cleaned = newZone.trim()
      setZoneCategory(cleaned)
      setZone(cleaned)
      setNewZone('')
    }
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 10,
        padding: compact ? 10 : 12,
        background: '#0b1220',
        borderTop: '1px solid #334155',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <Settings2 size={14} color={GOLD} />
        <strong style={{ color: GOLD, fontSize: '0.78rem' }}>Správa oken a IP adres</strong>
      </div>
      <label className="label" style={{ margin: 0 }}>
        Název kamery
      </label>
      <input
        className="input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="např. Hlavní vchod"
        style={{ minHeight: 42, background: '#1e293b', borderColor: '#334155' }}
      />
      <label className="label" style={{ margin: 0 }}>
        Zóna / Umístění
      </label>
      <select
        className="input"
        value={zoneCategory}
        onChange={(e) => {
          const v = e.target.value as CctvZoneCategory
          setZoneCategory(v)
          setZone(v)
        }}
        style={{ minHeight: 42, background: '#1e293b', borderColor: '#334155' }}
        title="Registr zón (včetně vlastních)"
      >
        {registry.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </select>
      <input
        className="input"
        value={zone}
        onChange={(e) => setZone(e.target.value)}
        placeholder="Detail umístění (volitelné)"
        style={{ minHeight: 42, background: '#1e293b', borderColor: '#334155' }}
        title="Volný popis zóny"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <input
          className="input"
          value={newZone}
          onChange={(e) => setNewZone(e.target.value)}
          placeholder="Nová zóna (např. Zahrádka, Sklep)"
          style={{ minHeight: 42, background: '#1e293b', borderColor: '#334155' }}
          title="Přidat vlastní zónu do registru"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addZone()
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 42, borderColor: GOLD, color: GOLD }}
          onClick={addZone}
          title="Přidat zónu do výběru"
        >
          <Plus size={15} /> Přidat
        </button>
      </div>
      <label className="label" style={{ margin: 0 }}>
        RTSP / IP Adresa
      </label>
      <input
        className="input"
        value={rtspUrl}
        onChange={(e) => setRtspUrl(e.target.value)}
        placeholder="rtsp://admin:heslo@192.168.1.50:554/stream1"
        style={{
          minHeight: 42,
          background: '#1e293b',
          borderColor: '#334155',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.78rem',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: '0.8rem' }}>
          <ConnectionDot status={camera.status} />
          Stav připojení:{' '}
          <strong style={{ color: camera.status === 'offline' ? '#fca5a5' : '#86efac' }}>
            {camera.status === 'offline' ? 'OFFLINE' : camera.status === 'alert' ? 'POPLACH' : 'ONLINE'}
          </strong>
        </div>
        <button
          type="button"
          className="btn btn-gold"
          style={{ minHeight: 40, padding: '0.45rem 0.9rem' }}
          onClick={save}
        >
          Uložit kameru
        </button>
      </div>
    </div>
  )
}

export function CctvCameraFeed({
  camera,
  aiToggles,
  enlargeHint,
  onOpen,
  showConfig,
  onSaveConfig,
  wallMode,
  isFlashing,
  zoneRegistry,
  onAddZone,
}: {
  camera: CctvCamera
  aiToggles: CctvAiToggles
  enlargeHint?: boolean
  onOpen?: () => void
  showConfig?: boolean
  onSaveConfig?: (patch: Partial<CctvCamera>) => void
  wallMode?: boolean
  isFlashing?: boolean
  zoneRegistry?: string[]
  onAddZone?: (zone: string) => boolean
}) {
  const online = camera.status !== 'offline'
  const [configOpen, setConfigOpen] = useState(false)
  const alertish = camera.status === 'alert' || Boolean(isFlashing)

  return (
    <div
      style={{
        borderRadius: wallMode ? 0 : 14,
        border: wallMode
          ? `1px solid ${alertish ? '#ef4444' : '#0f172a'}`
          : `2px solid ${
              alertish ? '#ef4444' : camera.status === 'offline' ? '#475569' : '#334155'
            }`,
        background: '#020617',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: wallMode ? 0 : 240,
        height: wallMode ? '100%' : undefined,
        cursor: onOpen ? 'pointer' : 'default',
        touchAction: 'manipulation',
        boxShadow: isFlashing ? '0 0 0 2px #ef4444, 0 0 24px rgba(239,68,68,0.55)' : undefined,
      }}
      onClick={() => onOpen?.()}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onOpen) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      title={enlargeHint ? 'Klikněte pro zvětšení na celou obrazovku' : undefined}
    >
      <div
        style={{
          flex: 1,
          minHeight: wallMode ? 0 : 140,
          background: online
            ? `linear-gradient(145deg, ${alertish ? '#ef4444' : camera.accent}55, #020617 55%, #0f172a)`
            : 'linear-gradient(145deg, #1e293b, #020617)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          aspectRatio: wallMode ? undefined : '16 / 9',
        }}
      >
        {isFlashing && (
          <motion.div
            animate={{ opacity: [0.15, 0.7, 0.15] }}
            transition={{ duration: 0.45, repeat: Infinity }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(239,68,68,0.55)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}
        <Camera size={wallMode ? 42 : 34} color={alertish ? '#fecaca' : online ? camera.accent : '#64748b'} />
        <Scanlines online={online} />
        <HeatmapOverlay active={Boolean(aiToggles.heatmap && online)} />

        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <ConnectionDot status={camera.status} />
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 900,
              padding: '0.2rem 0.5rem',
              borderRadius: 6,
              background: alertish
                ? '#ef4444'
                : camera.status === 'offline'
                  ? '#475569'
                  : '#0f172a',
              color: '#fff',
              border: `1px solid ${camera.status === 'offline' ? '#64748b' : GOLD}`,
            }}
          >
            {alertish ? 'POPLACH' : camera.status === 'offline' ? 'OFFLINE' : 'LIVE'}
          </span>
          {camera.recording && online && (
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 900,
                padding: '0.2rem 0.5rem',
                borderRadius: 6,
                background: 'rgba(127,29,29,0.92)',
                color: '#fecaca',
                border: '1px solid #ef4444',
                letterSpacing: '0.02em',
              }}
              title="Stav nahrávání"
            >
              🔴 REC · {camera.resolution} {camera.fps}fps
            </span>
          )}
        </div>

        {enlargeHint && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.68rem',
              fontWeight: 800,
              color: '#e2e8f0',
              background: 'rgba(15,23,42,0.85)',
              border: `1px solid ${GOLD}66`,
              borderRadius: 6,
              padding: '0.2rem 0.45rem',
            }}
          >
            <Maximize2 size={12} color={GOLD} /> Zvětšit
          </span>
        )}

        {aiToggles.fightDetection && online && /bar/i.test(camera.zoneCategory + camera.label) && (
          <span
            title="Detekce rvaček / konfliktů aktivní"
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              fontSize: '0.65rem',
              fontWeight: 800,
              color: '#fbbf24',
              background: 'rgba(120,53,15,0.85)',
              border: '1px solid #f59e0b',
              borderRadius: 6,
              padding: '0.15rem 0.4rem',
            }}
          >
            AI konflikt
          </span>
        )}

        {showConfig && (
          <button
            type="button"
            title="Nastavení kamery"
            onClick={(e) => {
              e.stopPropagation()
              setConfigOpen((v) => !v)
            }}
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              minHeight: 36,
              minWidth: 36,
              borderRadius: 8,
              border: `1px solid ${GOLD}`,
              background: 'rgba(15,23,42,0.9)',
              color: GOLD,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation',
            }}
          >
            <Settings2 size={15} />
          </button>
        )}
      </div>

      {!wallMode && (
        <div style={{ padding: '0.75rem 0.85rem', background: '#0f172a' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>{camera.label}</div>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginTop: 4 }}>
            {camera.zoneCategory}
            {camera.zone && camera.zone !== camera.zoneCategory ? ` · ${camera.zone}` : ''}
          </div>
          {camera.rtspUrl ? (
            <div
              style={{
                color: '#64748b',
                fontSize: '0.68rem',
                marginTop: 6,
                fontFamily: 'ui-monospace, monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={camera.rtspUrl}
            >
              {camera.rtspUrl}
            </div>
          ) : (
            <div style={{ color: '#f87171', fontSize: '0.72rem', marginTop: 6, fontWeight: 700 }}>
              Chybí RTSP / IP adresa
            </div>
          )}
        </div>
      )}

      {wallMode && (
        <div
          style={{
            padding: '0.35rem 0.55rem',
            background: 'rgba(2,6,23,0.92)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            alignItems: 'center',
            borderTop: '1px solid #1e293b',
          }}
        >
          <span style={{ color: '#f8fafc', fontWeight: 800, fontSize: '0.78rem' }}>{camera.label}</span>
          <span style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700 }}>
            {camera.zoneCategory}
          </span>
        </div>
      )}

      {showConfig && configOpen && onSaveConfig && zoneRegistry && onAddZone && (
        <CameraConfigForm
          camera={camera}
          compact
          zoneRegistry={zoneRegistry}
          onAddZone={onAddZone}
          onSave={(patch) => {
            onSaveConfig(patch)
            setConfigOpen(false)
          }}
        />
      )}
    </div>
  )
}

export function CctvFullscreenModal({
  camera,
  aiToggles,
  onClose,
}: {
  camera: CctvCamera | null
  aiToggles: CctvAiToggles
  onClose: () => void
}) {
  const titleId = useId()
  useEffect(() => {
    if (!camera) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [camera, onClose])

  return (
    <AnimatePresence>
      {camera && (
        <motion.div
          key={camera.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            background: 'rgba(2,6,23,0.94)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            touchAction: 'manipulation',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(96vw, 1600px)',
              maxHeight: '96vh',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ConnectionDot status={camera.status} />
                <div>
                  <div id={titleId} style={{ color: GOLD, fontWeight: 900, fontSize: '1.15rem' }}>
                    {camera.label}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                    {camera.zoneCategory} · {camera.zone}
                    {camera.recording && camera.status !== 'offline'
                      ? ` · 🔴 REC · ${camera.resolution} ${camera.fps}fps`
                      : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 44 }}
                onClick={onClose}
                title="Zavřít celoobrazovkové zobrazení"
              >
                <X size={16} /> Zavřít
              </button>
            </div>

            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                maxHeight: 'calc(96vh - 72px)',
                borderRadius: 12,
                border: `2px solid ${GOLD}`,
                overflow: 'hidden',
                background: `linear-gradient(145deg, ${camera.accent}55, #020617 50%, #0f172a)`,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 0 1px ${GOLD}33, 0 24px 80px rgba(0,0,0,0.65)`,
              }}
            >
              <Camera size={72} color={camera.status === 'offline' ? '#64748b' : GOLD} />
              <Scanlines online={camera.status !== 'offline'} />
              <HeatmapOverlay active={Boolean(aiToggles.heatmap && camera.status !== 'offline')} />
              {camera.rtspUrl && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 14,
                    left: 14,
                    right: 14,
                    color: '#cbd5e1',
                    fontSize: '0.78rem',
                    fontFamily: 'ui-monospace, monospace',
                    background: 'rgba(2,6,23,0.75)',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '0.55rem 0.75rem',
                    wordBreak: 'break-all',
                  }}
                >
                  Stream: {camera.rtspUrl}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
