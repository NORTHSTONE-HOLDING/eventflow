import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import type { CateringItem } from '../../types'
import {
  PushToTalkSession,
  processVoiceOrderTranscript,
  VOICE_NOISE_FILTER_PROMPT,
} from '../../lib/voicePosEngine'
import { tapFeedback } from '../../lib/touchFeedback'

interface Props {
  catalog: CateringItem[]
  disabled?: boolean
  onOrders: (
    matched: Array<{ item: CateringItem; qty: number; tableHint: string | null }>,
    transcript: string,
  ) => void
  onReject?: (reason: string) => void
}

/**
 * Push-to-Talk voice order button.
 * Records ONLY while finger/pointer is held down; aborts stream on release.
 * Live transcript appears in the confirmation text box beside the mic.
 */
export function VoiceOrderButton({ catalog, disabled, onOrders, onReject }: Props) {
  const sessionRef = useRef<PushToTalkSession | null>(null)
  const [holding, setHolding] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [confirmedText, setConfirmedText] = useState('')

  const ensureSession = () => {
    if (!sessionRef.current) sessionRef.current = new PushToTalkSession()
    sessionRef.current.setLiveTranscriptHandler((text) => setLiveText(text))
    return sessionRef.current
  }

  useEffect(() => {
    return () => {
      sessionRef.current?.setLiveTranscriptHandler(null)
      sessionRef.current?.cancel()
    }
  }, [])

  const begin = async (e: React.PointerEvent | React.TouchEvent) => {
    if (disabled || processing) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(
      'pointerId' in e ? e.pointerId : 1,
    )
    tapFeedback()
    setHolding(true)
    setLiveText('')
    setConfirmedText('')
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
      const finalText = (transcript || liveText || '').trim()
      setConfirmedText(finalText)
      setLiveText(finalText)
      if (!finalText) {
        onReject?.(
          'Žádný srozumitelný příkaz — držte tlačítko a vyslovte: stůl + množství + položka',
        )
        return
      }
      const { parse, matched } = await processVoiceOrderTranscript(finalText, catalog)
      if (!parse.accepted || !matched.length) {
        onReject?.(parse.reason || 'Příkaz ignorován (hluk / nejasná objednávka)')
        return
      }
      setConfirmedText(parse.cleanedTranscript || finalText)
      onOrders(matched, parse.cleanedTranscript || finalText)
    } finally {
      setProcessing(false)
    }
  }

  const displayText = holding ? liveText : confirmedText || liveText

  return (
    <div className="voice-ptt-row">
      <button
        type="button"
        disabled={disabled || processing}
        onPointerDown={begin}
        onPointerUp={() => void end()}
        onPointerCancel={() => void end()}
        onPointerLeave={() => {
          if (holding) void end()
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`voice-ptt-btn${holding ? ' is-holding' : ''}${processing ? ' is-processing' : ''}`}
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
      <label className="voice-ptt-transcript-wrap">
        <span className="voice-ptt-transcript-label">Přepis hlasu</span>
        <textarea
          className="voice-ptt-transcript"
          readOnly
          value={displayText}
          placeholder={
            holding
              ? 'Poslouchám… vyslovte: stůl 4 dvě pilsner'
              : 'Přepis se zobrazí po podržení mikrofonu'
          }
          rows={2}
          aria-live="polite"
        />
      </label>
      <div className="voice-ptt-hint">
        Push-to-Talk: stream běží jen při podržení. Po uvolnění prstu se okamžitě ukončí a
        fráze se rozdělí na položky menu.
      </div>
    </div>
  )
}
