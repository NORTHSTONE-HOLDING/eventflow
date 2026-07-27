import { useCctvStore } from '../../store/useCctvStore'
import { formatClock } from '../../lib/format'

// High-priority red alert broadcast that appears across all terminals.
export function RedAlertBanner() {
  const alert = useCctvStore((s) => s.redAlert)
  const dismiss = useCctvStore((s) => s.dismissAlert)
  if (!alert) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[60] animate-pulseRed border-b-2 border-red-500 bg-red-600/95 px-4 py-3 text-white shadow-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <div className="font-bold uppercase tracking-wide">
              Červený poplach — {alert.cameraName}
            </div>
            <div className="text-sm text-red-100">
              {alert.message} · {formatClock(alert.ts)}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-white/60 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
        >
          Potvrdit & zavřít
        </button>
      </div>
    </div>
  )
}
