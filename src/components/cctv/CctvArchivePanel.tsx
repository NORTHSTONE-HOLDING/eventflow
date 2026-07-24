import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Archive, Cloud, Pause, Play, Trash2 } from 'lucide-react'
import type { CctvRecordingSegment } from '../../lib/cctvEngine'
import { CCTV_RETENTION_DAYS, useCctvStore } from '../../store/useCctvStore'
import {
  CCTV_STORAGE_BUCKET,
  cctvStorageStatusLabel,
  isCctvStorageReady,
} from '../../lib/cctvStorage'
import { useAppStore } from '../../store/useAppStore'

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
        borderRadius: 14,
        background: '#020617',
        overflow: 'hidden',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          aspectRatio: '16 / 9',
          background: `linear-gradient(145deg, #1e293b, #020617 50%, #0f172a)`,
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
          <div style={{ color: GOLD, fontWeight: 900, fontSize: '1.1rem' }}>
            Přehrávání záznamu
          </div>
          <div style={{ color: '#e2e8f0', fontWeight: 800, marginTop: 6 }}>
            {segment.cameraLabel}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: 6, fontWeight: 600 }}>
            {new Date(segment.createdAt).toLocaleString('cs-CZ')} · {segment.resolution}{' '}
            {segment.fps}fps
          </div>
          <div
            style={{
              color: '#64748b',
              fontSize: '0.68rem',
              marginTop: 8,
              fontFamily: 'ui-monospace, monospace',
              wordBreak: 'break-all',
            }}
          >
            {segment.storagePath}
          </div>
        </div>
      </div>

      <div style={{ padding: '0.85rem 1rem', background: '#0b1220' }}>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: '#1e293b',
            overflow: 'hidden',
            border: `1px solid ${GOLD}44`,
            marginBottom: 10,
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 42 }}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}{' '}
            {playing ? 'Pozastavit' : 'Přehrát záznam'}
          </button>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 42 }} onClick={onClose}>
            Zavřít přehrávač
          </button>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, marginLeft: 'auto' }}>
            Mock player · bucket {CCTV_STORAGE_BUCKET}
          </span>
        </div>
      </div>
    </div>
  )
}

export function CctvArchivePanel() {
  const recordings = useCctvStore((s) => s.recordings)
  const lastRetentionPurgeAt = useCctvStore((s) => s.lastRetentionPurgeAt)
  const lastPurgedCount = useCctvStore((s) => s.lastPurgedCount)
  const runRetentionPurge = useCctvStore((s) => s.runRetentionPurge)
  const getArchiveTimeline = useCctvStore((s) => s.getArchiveTimeline)
  const setToast = useAppStore((s) => s.setToast)

  const timeline = useMemo(() => getArchiveTimeline(), [recordings, getArchiveTimeline])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playing, setPlaying] = useState<CctvRecordingSegment | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  useEffect(() => {
    if (!expandedDay && timeline[0]) setExpandedDay(timeline[0].dayKey)
  }, [timeline, expandedDay])

  const selected = useMemo(
    () => recordings.find((r) => r.id === selectedId) || null,
    [recordings, selectedId],
  )

  return (
    <div
      className="panel"
      style={{ marginBottom: 16, borderColor: `${GOLD}66`, background: '#0f172a' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Archive size={16} color={GOLD} />
          <strong style={{ color: GOLD }}>Archiv záznamů</strong>
          <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
            · časová osa dny/hodiny · retence {CCTV_RETENTION_DAYS} dní · {recordings.length}{' '}
            klipů
          </span>
        </div>
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

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
          padding: '0.65rem 0.85rem',
          borderRadius: 10,
          border: '1px solid #334155',
          background: '#020617',
          color: '#94a3b8',
          fontSize: '0.78rem',
          fontWeight: 600,
        }}
      >
        <Cloud size={14} color={isCctvStorageReady() ? GOLD : '#64748b'} />
        {cctvStorageStatusLabel()}
      </div>

      <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 600, marginBottom: 12 }}>
        Poslední čištění:{' '}
        {lastRetentionPurgeAt
          ? new Date(lastRetentionPurgeAt).toLocaleString('cs-CZ')
          : 'ještě neproběhlo'}
        {lastPurgedCount > 0 ? ` · naposledy smazáno ${lastPurgedCount}` : ''}
      </div>

      {playing && (
        <MockVideoPlayer segment={playing} onClose={() => setPlaying(null)} />
      )}

      {selected && !playing && (
        <div
          style={{
            marginBottom: 12,
            padding: '0.85rem 1rem',
            borderRadius: 12,
            border: `1px solid ${GOLD}`,
            background: 'rgba(212,175,55,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ color: '#fff', fontWeight: 800 }}>{selected.cameraLabel}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>
              {new Date(selected.createdAt).toLocaleString('cs-CZ')} · {selected.note}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 44, fontWeight: 900 }}
            onClick={() => setPlaying(selected)}
          >
            <Play size={15} /> Přehrát záznam
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: 520,
          overflow: 'auto',
          paddingRight: 4,
        }}
      >
        {timeline.length === 0 && (
          <div style={{ color: '#94a3b8', fontWeight: 600 }}>Archiv je prázdný.</div>
        )}

        {timeline.map((day) => {
          const open = expandedDay === day.dayKey
          return (
            <div
              key={day.dayKey}
              style={{
                border: `1px solid ${open ? GOLD : '#334155'}`,
                borderRadius: 12,
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
                  padding: '0.75rem 0.9rem',
                  border: 'none',
                  background: open ? 'rgba(212,175,55,0.12)' : '#0b1220',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  touchAction: 'manipulation',
                }}
              >
                <strong style={{ color: open ? GOLD : '#e2e8f0', textTransform: 'capitalize' }}>
                  {day.label}
                </strong>
                <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700 }}>
                  {day.hours.reduce((n, h) => n + h.items.length, 0)} klipů · ~{day.totalMb} MB
                </span>
              </button>

              {open && (
                <div style={{ padding: '0.35rem 0.65rem 0.85rem', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 22,
                      top: 8,
                      bottom: 12,
                      width: 2,
                      background: `linear-gradient(180deg, ${GOLD}, #334155)`,
                    }}
                  />
                  {day.hours.map((hour) => (
                    <div key={hour.hourKey} style={{ marginBottom: 12, paddingLeft: 28 }}>
                      <div
                        style={{
                          color: GOLD,
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          marginBottom: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: GOLD,
                            boxShadow: `0 0 0 3px ${GOLD}33`,
                            marginLeft: -23,
                          }}
                        />
                        {hour.label}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {hour.items.map((seg) => {
                          const active = selectedId === seg.id
                          const pct = Math.min(
                            100,
                            Math.round((seg.durationSec / 7200) * 100),
                          )
                          return (
                            <button
                              key={seg.id}
                              type="button"
                              onClick={() => setSelectedId(seg.id)}
                              style={{
                                textAlign: 'left',
                                padding: '0.65rem 0.75rem',
                                borderRadius: 10,
                                border: `1px solid ${active ? GOLD : '#334155'}`,
                                background: active ? 'rgba(212,175,55,0.1)' : '#0f172a',
                                cursor: 'pointer',
                                touchAction: 'manipulation',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 8,
                                  marginBottom: 6,
                                }}
                              >
                                <span style={{ color: '#f8fafc', fontWeight: 800, fontSize: '0.85rem' }}>
                                  {seg.cameraLabel}
                                </span>
                                <span style={{ color: GOLD, fontWeight: 800, fontSize: '0.75rem' }}>
                                  {seg.sizeMb} MB
                                </span>
                              </div>
                              <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>
                                {new Date(seg.createdAt).toLocaleTimeString('cs-CZ', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                · {Math.round(seg.durationSec / 60)} min · {seg.resolution}{' '}
                                {seg.fps}fps
                              </div>
                              <div
                                style={{
                                  marginTop: 8,
                                  height: 5,
                                  borderRadius: 999,
                                  background: '#1e293b',
                                  overflow: 'hidden',
                                }}
                                title="Délka klipu (náhled)"
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: active ? GOLD : '#475569',
                                  }}
                                />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
