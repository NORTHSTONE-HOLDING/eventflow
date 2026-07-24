import { useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import type { CateringItem } from '../../types'
import {
  PushToTalkSession,
  processVoiceOrderTranscript,
  VOICE_NOISE_FILTER_PROMPT,
} from '../../lib/voicePosEngine'

interface Props {
  catalog: CateringItem[]
  disabled?: boolean
  onOrders: (
    matched: Array<{ item: CateringItem; qty: number; tableHint: string | null }>,
    transcript: string
  ) => void
  onReject?: (reason: string) => void
}

/**
 * Push-to-Talk voice order button.
 * Records ONLY while finger/pointer is held down; truncates on release.
 */
export function VoiceOrderButton({ catalog, disabled, onOrders, onReject }: Props) {
  const sessionRef = useRef<PushToTalkSession | null>(null)
  const [holding, setHolding] = useState(false)
  const [processing, setProcessing] = useState(false)

  const ensureSession = () => {
    if (!sessionRef.current) sessionRef.current = new PushToTalkSession()
    return sessionRef.current
  }

  const begin = async (e: React.PointerEvent | React.TouchEvent) => {
    if (disabled || processing) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(
      'pointerId' in e ? e.pointerId : 1
    )
    setHolding(true)
    try {
      await ensureSession().startHold()
    } catch {
      setHolding(false)
      onReject?.('Mikrofon není dostupný')
    }
  }

  const end = async () => {
    if (!holding) return
    setHolding(false)
    setProcessing(true)
    try {
      const { transcript } = await ensureSession().stopHold()
      if (!transcript) {
        onReject?.(
          'Žádný srozumitelný příkaz — držte tlačítko a vyslovte: stůl + množství + položka'
        )
        return
      }
      const { parse, matched } = await processVoiceOrderTranscript(transcript, catalog)
      if (!parse.accepted || !matched.length) {
        onReject?.(parse.reason || 'Příkaz ignorován (hluk / nejasná objednávka)')
        return
      }
      onOrders(matched, parse.cleanedTranscript || transcript)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        disabled={disabled || processing}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => {
          if (holding) void end()
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          minHeight: 64,
          minWidth: 64,
          padding: '0.85rem 1.25rem',
          borderRadius: 14,
          border: holding ? '2px solid #fff' : '2px solid #D4AF37',
          background: holding ? '#D4AF37' : processing ? '#334155' : '#1e293b',
          color: holding ? '#0b0f14' : '#D4AF37',
          fontWeight: 900,
          fontSize: '1rem',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: holding
            ? '0 0 28px rgba(212,175,55,0.55)'
            : '0 4px 14px rgba(0,0,0,0.25)',
          opacity: disabled ? 0.45 : 1,
        }}
        aria-pressed={holding}
        title={VOICE_NOISE_FILTER_PROMPT}
      >
        {holding ? <Mic size={22} /> : processing ? <MicOff size={22} /> : <Mic size={22} />}
        {holding
          ? 'Nahrávám… pusťte prst'
          : processing
            ? 'Filtruji hluk…'
            : 'Zadat zakázku hlasem (držet)'}
      </button>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, lineHeight: 1.4 }}>
        Push-to-Talk: mikrofon běží jen při podržení. AI ignoruje hluk a hlasy ostatních.
      </div>
    </div>
  )
}
