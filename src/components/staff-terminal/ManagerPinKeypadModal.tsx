import { useEffect, useState } from 'react'
import { Delete, Lock, ShieldAlert } from 'lucide-react'
import {
  MOCK_STORNO_PIN,
  verifyManagerPin,
} from '../../store/useStaffLockStore'
import { tapFeedback } from '../../lib/touchFeedback'

interface Props {
  open: boolean
  title?: string
  subtitle?: string
  expectedPin?: string
  confirmLabel?: string
  onSuccess: (pin: string) => void
  onCancel: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

/**
 * Full-screen touch numeric keypad for Manager PIN (uzávěrka / storno).
 */
export function ManagerPinKeypadModal({
  open,
  title = 'Zadejte Manažerský PIN pro přístup k uzávěrce',
  subtitle = 'Uzávěrka & Směna je chráněna. Přístup pouze pro vedoucího směny.',
  expectedPin,
  confirmLabel = 'Odemknout uzávěrku',
  onSuccess,
  onCancel,
}: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPin('')
    setError(null)
  }, [open])

  if (!open) return null

  const press = (key: string) => {
    tapFeedback()
    setError(null)
    if (key === 'del') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (!key) return
    setPin((p) => (p.length >= 8 ? p : p + key))
  }

  const submit = () => {
    tapFeedback()
    if (!verifyManagerPin(pin, expectedPin)) {
      tapFeedback('alert')
      setError('Nesprávný Manažerský PIN')
      setPin('')
      return
    }
    tapFeedback('success')
    const authorized = pin.trim()
    setPin('')
    setError(null)
    onSuccess(authorized)
  }

  return (
    <div
      className="st-pin-keypad-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="st-pin-keypad-card panel">
        <div className="st-modal-head" style={{ marginBottom: 12 }}>
          <ShieldAlert size={26} color="#D4AF37" />
          <div>
            <h2 className="gold-text" style={{ margin: 0, fontSize: '1.35rem' }}>
              {title}
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              {subtitle}
            </p>
          </div>
        </div>

        <div className="st-pin-dots" aria-live="polite">
          {Array.from({ length: Math.max(4, pin.length || 4) }).map((_, i) => (
            <span
              key={i}
              className={`st-pin-dot ${i < pin.length ? 'is-filled' : ''}`}
            />
          ))}
        </div>

        {error && (
          <div className="st-pin-error">
            <Lock size={14} /> {error}
          </div>
        )}

        <div className="st-pin-pad">
          {KEYS.map((key, idx) => {
            if (!key) {
              return <div key={`empty-${idx}`} className="st-pin-pad-spacer" />
            }
            if (key === 'del') {
              return (
                <button
                  key="del"
                  type="button"
                  className="st-pin-key st-pin-key-action"
                  onClick={() => press('del')}
                  aria-label="Smazat"
                >
                  <Delete size={22} />
                </button>
              )
            }
            return (
              <button
                key={key}
                type="button"
                className="st-pin-key"
                onClick={() => press(key)}
              >
                {key}
              </button>
            )
          })}
        </div>

        <p style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', margin: '10px 0' }}>
          Demo PIN: {MOCK_STORNO_PIN} · nebo PIN z Profil & Tarif
        </p>

        <div className="st-modal-actions">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 56 }}
            onClick={() => {
              tapFeedback()
              setPin('')
              setError(null)
              onCancel()
            }}
          >
            Zrušit
          </button>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 56, fontWeight: 900 }}
            disabled={pin.length < 4}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
