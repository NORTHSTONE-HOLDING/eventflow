import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCctvStore } from '../../store/useCctvStore'
import { CCTV_ARCHIVE } from '../../lib/constants'
import { formatClock } from '../../lib/format'
import { alarm, tap } from '../../lib/feedback'
import { Modal } from '../common/Modal'
import { RedAlertBanner } from '../common/RedAlertBanner'
import type { Camera } from '../../lib/types'

function CameraTile({ camera, onOpen }: { camera: Camera; onOpen: (c: Camera) => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        tap(600)
        onOpen(camera)
      }}
      className={`group relative aspect-video overflow-hidden bg-slate-900 text-left ${
        camera.alert ? 'ring-4 ring-red-500 animate-pulseRed' : ''
      }`}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)',
        }}
      />
      <div
        className={`absolute inset-0 ${
          camera.alert
            ? 'bg-gradient-to-br from-red-900/70 to-black'
            : 'bg-gradient-to-br from-slate-800/50 to-black'
        }`}
      />
      <div className="absolute left-2 top-2 flex items-center gap-1.5 text-xs font-semibold text-white">
        <span className={`h-2 w-2 rounded-full ${camera.alert ? 'bg-red-500' : 'bg-emerald-400'} animate-pulse`} />
        {camera.name}
      </div>
      <div className="absolute right-2 top-2 font-mono text-[10px] text-slate-400">{camera.ip}</div>
      <div className="absolute bottom-2 left-2 text-xs text-slate-300">📍 {camera.zone}</div>
      {camera.alert && (
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-red-300">
          ⚠ POPLACH
        </div>
      )}
      <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">
        klikněte pro zvětšení
      </div>
    </button>
  )
}

export function CctvWall() {
  const cameras = useCctvStore((s) => s.cameras)
  const events = useCctvStore((s) => s.events)
  const simulateEscape = useCctvStore((s) => s.simulateEscape)
  const updateCamera = useCctvStore((s) => s.updateCamera)
  const [enlarged, setEnlarged] = useState<Camera | null>(null)

  const openCam = cameras.find((c) => c.id === enlarged?.id) ?? null

  const triggerEscape = () => {
    alarm()
    simulateEscape()
  }

  return (
    <div className="min-h-screen">
      <RedAlertBanner />
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <h1 className="font-display text-2xl text-white">📹 AI CCTV Monitor</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={triggerEscape} className="btn btn-danger">
            🧪 Nasimulovat útěk bez placení
          </button>
          <Link to="/" className="btn btn-ghost">
            🏠 Přehled
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl md:grid-cols-3 xl:grid-cols-4">
            {cameras.map((c) => (
              <CameraTile key={c.id} camera={c} onOpen={setEnlarged} />
            ))}
          </div>

          <div className="mt-6">
            <h2 className="mb-2 font-display text-xl text-white">Bezpečnostní log</h2>
            <div className="card max-h-48 overflow-y-auto p-3 text-sm">
              {events.length === 0 ? (
                <p className="text-slate-500">Žádné události. Systém hlídá 10 zón.</p>
              ) : (
                events.map((e) => (
                  <div
                    key={e.id}
                    className={`border-b border-slate-800 py-1.5 ${e.level === 'red' ? 'text-red-300' : 'text-slate-300'}`}
                  >
                    <span className="font-mono text-xs text-slate-500">{formatClock(e.ts)}</span>{' '}
                    <span className="font-semibold">{e.cameraName}:</span> {e.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-display text-xl text-white">Archiv (60 dní)</h2>
          <div className="card max-h-[70vh] overflow-y-auto p-2">
            {CCTV_ARCHIVE.map((d) => (
              <div
                key={d.date}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-800/60"
              >
                <span className="font-mono text-slate-300">{d.date}</span>
                <span className="text-xs text-slate-500">
                  {d.clips} klipů · {d.sizeGb} GB
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={!!openCam} title={openCam?.name} onClose={() => setEnlarged(null)} maxWidth="max-w-2xl">
        {openCam && (
          <div className="space-y-4">
            <div
              className={`relative aspect-video overflow-hidden rounded-xl bg-black ${
                openCam.alert ? 'ring-4 ring-red-500' : ''
              }`}
            >
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)',
                }}
              />
              <div className="absolute bottom-3 left-3 text-sm text-slate-300">📍 {openCam.zone}</div>
              <div className="absolute right-3 top-3 flex items-center gap-1.5 text-xs text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC
              </div>
              {openCam.alert && (
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-red-400">
                  ⚠ ČERVENÝ POPLACH
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Název zóny</label>
                <input
                  className="input"
                  value={openCam.zone}
                  onChange={(e) => updateCamera(openCam.id, { zone: e.target.value })}
                />
              </div>
              <div>
                <label className="label">IP adresa</label>
                <input
                  className="input font-mono"
                  value={openCam.ip}
                  onChange={(e) => updateCamera(openCam.id, { ip: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
