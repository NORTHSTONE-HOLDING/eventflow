import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCctvStore } from '../store/useCctvStore'
import type { CctvCamera } from '../lib/cctvEngine'
import { CctvCameraFeed, CctvFullscreenModal } from './cctv/CctvCameraTile'
import { CctvSecurityBanner } from './cctv/CctvSecurityBanner'

const GOLD = '#D4AF37'

/**
 * Standalone multi-monitor / mobile CCTV wall — 100% clean, no ERP chrome.
 * Route: /cctv-wall (top-level router entry, outside AppShell).
 */
export function CctvWallPage() {
  const navigate = useNavigate()
  const cameras = useCctvStore((s) => s.cameras)
  const aiToggles = useCctvStore((s) => s.aiToggles)
  const flashingCameraId = useCctvStore((s) => s.flashingCameraId)
  const ensureCameras = useCctvStore((s) => s.ensureCameras)
  const runRetentionPurge = useCctvStore((s) => s.runRetentionPurge)
  const [fullscreenCam, setFullscreenCam] = useState<CctvCamera | null>(null)
  const [hudVisible, setHudVisible] = useState(true)

  useEffect(() => {
    ensureCameras()
    runRetentionPurge()
    // Force full-bleed document for TV monitors
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyMargin = body.style.margin
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.margin = '0'
    document.title = 'EventFlow · CCTV TV režim'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.margin = prevBodyMargin
    }
  }, [ensureCameras, runRetentionPurge])

  useEffect(() => {
    const id = window.setTimeout(() => setHudVisible(false), 4000)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div
      className="cctv-wall-root"
      onMouseMove={() => setHudVisible(true)}
      onTouchStart={() => setHudVisible(true)}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        margin: 0,
        padding: 0,
        background: '#000',
        color: '#e2e8f0',
        zIndex: 1,
        overflow: 'hidden',
        touchAction: 'manipulation',
      }}
    >
      <CctvSecurityBanner />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          padding: '0.45rem 0.75rem',
          background: 'linear-gradient(180deg, rgba(2,6,23,0.85), transparent)',
          opacity: hudVisible ? 1 : 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: hudVisible ? 'auto' : 'none',
        }}
      >
        <div style={{ color: GOLD, fontWeight: 900, letterSpacing: '0.06em', fontSize: '0.82rem' }}>
          EVENTFLOW · CCTV WALL · 16:9
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            color: GOLD,
            fontWeight: 800,
            fontSize: '0.78rem',
            background: 'rgba(2,6,23,0.75)',
            border: `1px solid ${GOLD}66`,
            borderRadius: 8,
            padding: '0.35rem 0.7rem',
            cursor: 'pointer',
          }}
        >
          Zpět do ERP
        </button>
      </div>

      <main
        className="cctv-wall-grid"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
        }}
      >
        {cameras.map((cam) => (
          <div
            key={cam.id}
            style={{
              minHeight: 0,
              minWidth: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <CctvCameraFeed
              camera={cam}
              aiToggles={aiToggles}
              wallMode
              enlargeHint={hudVisible}
              isFlashing={flashingCameraId === cam.id}
              onOpen={() => setFullscreenCam(cam)}
            />
          </div>
        ))}
      </main>

      <style>{`
        .cctv-wall-root, .cctv-wall-root * {
          box-sizing: border-box;
        }
        .cctv-wall-grid > div > div {
          border-radius: 0 !important;
          height: 100% !important;
          min-height: 100% !important;
        }
        @media (max-width: 1100px) {
          .cctv-wall-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-template-rows: repeat(4, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 700px) {
          .cctv-wall-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            grid-template-rows: repeat(5, minmax(0, 1fr)) !important;
            overflow: auto !important;
          }
        }
        @media (max-width: 420px) {
          .cctv-wall-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: repeat(10, minmax(140px, auto)) !important;
            overflow: auto !important;
            position: relative !important;
            inset: auto !important;
            height: 100% !important;
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
