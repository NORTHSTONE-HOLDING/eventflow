import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, ChevronDown, Cloud, Pause, Play, Trash2 } from 'lucide-react'
import type { CctvRecordingSegment } from '../../lib/cctvEngine'
import { CCTV_RETENTION_DAYS, useCctvStore } from '../../store/useCctvStore'
import {
  CCTV_STORAGE_BUCKET,
  cctvStorageStatusLabel,
  isCctvStorageReady,
} from '../../lib/cctvStorage'
import { useAppStore } from '../../store/useAppStore'
import {
  formatCzechDateTime,
  formatCzechHourRange,
} from '../../lib/czechDate'

const GOLD = '#D4AF37'

function MockVideoPlayer({
  segment,
  onClose,
}: {
  segment: CctvRecordingSegment
  onClose: () => void
}) {
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 0
        return p + 100 / Math.max(12, Math.min(60, segment.durationSec / 10))
      })
    }, 200)
    return () => window.clearInterval(id)
  }, [playing, segment.durationSec, segment.id])

  useEffect(() => {
    setProgress(0)
    setPlaying(true)
  }, [segment.id])

  return (
    <div
      style={{
        border: `2px solid ${GOLD}`,
        borderRadius: 16,
        background: '#020617',
        overflow: 'hidden',
        marginBottom: 16,
        width: '100%',
      }}
    >
      <div
        style={{
          aspectRatio: '16 / 9',
          maxHeight: 420,
          background: 'linear-gradient(145deg, #1e293b, #020617 50%, #0f172a)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.div
          animate={{ opacity: playing ? [0.25, 0.55, 0.25] : 0.35 }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(212,175,55,0.04) 4px, rgba(212,175,55,0.04) 8px)',
          }}
        />
        <div style={{ textAlign: 'center', zIndex: 1, padding: 16 }}>
          <div style={{ color: GOLD, fontWeight: 900, fontSize: '1.2rem' }}>
            Přehrávání záznamu
          </div>
          <div style={{ color: '#e2e8f0', fontWeight: 800, marginTop: 8, fontSize: '1.05rem' }}>
            {segment.cameraLabel}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 8, fontWeight: 600 }}>
            {formatCzechDateTime(segment.createdAt)} · {segment.resolution} {segment.fps}fps ·{' '}
            {Math.round(segment.durationSec / 60)} min
          </div>
          <div
            style={{
              color: '#64748b',
              fontSize: '0.72rem',
              marginTop: 10,
              fontFamily: 'ui-monospace, monospace',
              wordBreak: 'break-all',
            }}
          >
            {segment.storagePath}
          </div>
        </div>
      </div>

      <div style={{ padding: '1rem 1.15rem', background: '#0b1220' }}>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: '#1e293b',
            overflow: 'hidden',
            border: `1px solid ${GOLD}55`,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: `${Math.min(100, progress)}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${GOLD}, #f5e6a3)`,
              transition: 'width 0.2s linear',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 48, fontWeight: 900 }}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}{' '}
            {playing ? 'Pozastavit' : 'Přehrát záznam'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 48 }}
            onClick={onClose}
          >
            Zavřít přehrávač
          </button>
          <span
            style={{
              color: '#94a3b8',
              fontSize: '0.78rem',
              fontWeight: 700,
              marginLeft: 'auto',
            }}
          >
            Mock player · {CCTV_STORAGE_BUCKET}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Spacious archive: full-width day rows (DD.MM.YYYY + weekday),
 * expand to wide hourly clip grid with play controls.
 */
export function CctvArchivePanel() {
  const recordings = useCctvStore((s) => s.recordings)
  const lastRetentionPurgeAt = useCctvStore((s) => s.lastRetentionPurgeAt)
  const lastPurgedCount = useCctvStore((s) => s.lastPurgedCount)
  const runRetentionPurge = useCctvStore((s) => s.runRetentionPurge)
  const getArchiveTimeline = useCctvStore((s) => s.getArchiveTimeline)
  const setToast = useAppStore((s) => s.setToast)

  const timeline = useMemo(() => getArchiveTimeline(), [recordings, getArchiveTimeline])
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [playing, setPlaying] = useState<CctvRecordingSegment | null>(null)

  useEffect(() => {
    if (!expandedDay && timeline[0]) setExpandedDay(timeline[0].dayKey)
  }, [timeline, expandedDay])

  return (
    <div
      className="panel"
      style={{
        marginBottom: 16,
        borderColor: `${GOLD}66`,
        background: '#0f172a',
        width: '100%',
        padding: '1.15rem 1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Archive size={18} color={GOLD} />
          <strong style={{ color: GOLD, fontSize: '1.05rem' }}>Archiv záznamů</strong>
          <span style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600 }}>
            retence {CCTV_RETENTION_DAYS} dní · {recordings.length} klipů · formát DD.MM.YYYY
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 46 }}
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

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 14,
          padding: '0.75rem 1rem',
          borderRadius: 12,
          border: '1px solid #334155',
          background: '#020617',
          color: '#94a3b8',
          fontSize: '0.8rem',
          fontWeight: 600,
        }}
      >
        <Cloud size={15} color={isCctvStorageReady() ? GOLD : '#64748b'} />
        {cctvStorageStatusLabel()}
      </div>

      <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 600, marginBottom: 14 }}>
        Poslední čištění:{' '}
        {lastRetentionPurgeAt ? formatCzechDateTime(lastRetentionPurgeAt) : 'ještě neproběhlo'}
        {lastPurgedCount > 0 ? ` · naposledy smazáno ${lastPurgedCount}` : ''}
      </div>

      {playing && <MockVideoPlayer segment={playing} onClose={() => setPlaying(null)} />}

      <div
        className="cctv-archive-scroll"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: '100%',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: '0.65rem 0.55rem',
          background: 'rgba(2,6,23,0.65)',
        }}
        title="Rolovací archiv — max. výška 500px"
      >
        {timeline.length === 0 && (
          <div style={{ color: '#94a3b8', fontWeight: 600, padding: '1rem 0' }}>
            Archiv je prázdný.
          </div>
        )}

        {timeline.map((day) => {
          const open = expandedDay === day.dayKey
          const clipCount = day.hours.reduce((n, h) => n + h.items.length, 0)
          return (
            <div
              key={day.dayKey}
              style={{
                width: '100%',
                border: `1px solid ${open ? GOLD : '#334155'}`,
                borderRadius: 14,
                background: '#020617',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedDay(open ? null : day.dayKey)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '1.05rem 1.2rem',
                  minHeight: 64,
                  border: 'none',
                  background: open
                    ? 'linear-gradient(90deg, rgba(212,175,55,0.16), rgba(15,23,42,0.4))'
                    : '#0b1220',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  touchAction: 'manipulation',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ display: 'inline-flex', color: GOLD, flexShrink: 0 }}
                  >
                    <ChevronDown size={22} />
                  </motion.span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: open ? GOLD : '#f8fafc',
                        fontWeight: 900,
                        fontSize: '1.08rem',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {day.label}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700, marginTop: 2 }}>
                      Klikněte pro {open ? 'sbalení' : 'rozbalení'} hodinových klipů
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    color: '#cbd5e1',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {clipCount} klipů · ~{day.totalMb} MB
                </div>
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="day-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        padding: '0.85rem 1.1rem 1.2rem',
                        borderTop: `1px solid ${GOLD}33`,
                        background: '#020617',
                      }}
                    >
                      {day.hours.map((hour) => (
                        <div key={hour.hourKey} style={{ marginBottom: 18 }}>
                          <div
                            style={{
                              color: GOLD,
                              fontWeight: 900,
                              fontSize: '0.92rem',
                              marginBottom: 10,
                              paddingBottom: 6,
                              borderBottom: '1px solid #1e293b',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {formatCzechHourRange(hour.hourKey)}
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                              gap: 12,
                              width: '100%',
                            }}
                          >
                            {hour.items.map((seg) => (
                              <div
                                key={seg.id}
                                style={{
                                  border: `1px solid #334155`,
                                  borderRadius: 12,
                                  background: '#0f172a',
                                  padding: '0.9rem 1rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 10,
                                  minHeight: 140,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    alignItems: 'flex-start',
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        color: '#f8fafc',
                                        fontWeight: 900,
                                        fontSize: '0.95rem',
                                      }}
                                    >
                                      {seg.cameraLabel}
                                    </div>
                                    <div
                                      style={{
                                        color: '#94a3b8',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        marginTop: 4,
                                      }}
                                    >
                                      {formatCzechDateTime(seg.createdAt)}
                                    </div>
                                  </div>
                                  <span
                                    style={{
                                      color: GOLD,
                                      fontWeight: 900,
                                      fontSize: '0.82rem',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {seg.sizeMb} MB
                                  </span>
                                </div>

                                <div
                                  style={{
                                    color: '#64748b',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {seg.resolution} · {seg.fps} fps ·{' '}
                                  {Math.round(seg.durationSec / 60)} min
                                  <br />
                                  {seg.note}
                                </div>

                                <div
                                  style={{
                                    height: 6,
                                    borderRadius: 999,
                                    background: '#1e293b',
                                    overflow: 'hidden',
                                  }}
                                  title="Délka klipu"
                                >
                                  <div
                                    style={{
                                      width: `${Math.min(100, Math.round((seg.durationSec / 7200) * 100))}%`,
                                      height: '100%',
                                      background: GOLD,
                                    }}
                                  />
                                </div>

                                <button
                                  type="button"
                                  className="btn btn-gold"
                                  style={{
                                    minHeight: 46,
                                    width: '100%',
                                    fontWeight: 900,
                                    marginTop: 'auto',
                                  }}
                                  onClick={() => setPlaying(seg)}
                                >
                                  <Play size={16} /> Přehrát záznam
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
