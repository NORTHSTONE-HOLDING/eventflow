import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MonitorSmartphone } from 'lucide-react'
import { useCctvStore } from '../store/useCctvStore'
import type { CctvCamera } from '../lib/cctvEngine'
import { CctvCameraFeed, CctvFullscreenModal } from './cctv/CctvCameraTile'

const GOLD = '#D4AF37'

/**
 * Standalone multi-monitor / mobile CCTV wall — no ERP chrome.
 * Optimized for 16:9 office TVs; fluid grid for phone/tablet.
 */
export function CctvWallPage() {
  const cameras = useCctvStore((s) => s.cameras)
  const aiToggles = useCctvStore((s) => s.aiToggles)
  const ensureCameras = useCctvStore((s) => s.ensureCameras)
  const runRetentionPurge = useCctvStore((s) => s.runRetentionPurge)
  const [fullscreenCam, setFullscreenCam] = useState<CctvCamera | null>(null)
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    ensureCameras()
    runRetentionPurge()
  }, [ensureCameras, runRetentionPurge])

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const onlineCount = cameras.filter((c) => c.status !== 'offline').length

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        background:
          'radial-gradient(ellipse at top, #1e293b 0%, #020617 45%, #000 100%)',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        touchAction: 'manipulation',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '0.55rem 0.85rem',
          borderBottom: `1px solid ${GOLD}44`,
          background: 'rgba(2,6,23,0.92)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MonitorSmartphone size={18} color={GOLD} />
          <div>
            <div style={{ color: GOLD, fontWeight: 900, letterSpacing: '0.04em', fontSize: '0.95rem' }}>
              EVENTFLOW · CCTV WALL
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700 }}>
              Samostatný TV režim · {onlineCount}/{cameras.length} online · bez ERP navigace
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <time
            dateTime={clock.toISOString()}
            style={{ color: '#cbd5e1', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
          >
            {clock.toLocaleString('cs-CZ')}
          </time>
          <Link
            to="/"
            style={{
              color: GOLD,
              fontWeight: 800,
              fontSize: '0.8rem',
              textDecoration: 'none',
              border: `1px solid ${GOLD}66`,
              borderRadius: 8,
              padding: '0.4rem 0.7rem',
            }}
          >
            Zpět do ERP
          </Link>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          padding: 'clamp(4px, 0.6vw, 10px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: 'clamp(4px, 0.5vw, 8px)',
          minHeight: 0,
        }}
        className="cctv-wall-grid"
      >
        {cameras.map((cam) => (
          <div key={cam.id} style={{ minHeight: 0, minWidth: 0 }}>
            <CctvCameraFeed
              camera={cam}
              aiToggles={aiToggles}
              wallMode
              enlargeHint
              onOpen={() => setFullscreenCam(cam)}
            />
          </div>
        ))}
      </main>

      <style>{`
        @media (max-width: 1100px) {
          .cctv-wall-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-template-rows: repeat(4, minmax(140px, 1fr)) !important;
          }
        }
        @media (max-width: 700px) {
          .cctv-wall-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-rows: repeat(5, minmax(120px, auto)) !important;
            overflow: auto;
          }
        }
        @media (max-width: 420px) {
          .cctv-wall-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: none !important;
          }
        }
      `}</style>

      <CctvFullscreenModal
        camera={fullscreenCam}
        aiToggles={aiToggles}
        onClose={() => setFullscreenCam(null)}
      />
    </div>
  )
}
