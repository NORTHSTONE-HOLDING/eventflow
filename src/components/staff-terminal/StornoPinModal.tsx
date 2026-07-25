import { useEffect, useState } from 'react'
import { Lock, ShieldAlert } from 'lucide-react'
import {
  MOCK_STORNO_PIN,
  verifyManagerPin,
} from '../../store/useStaffLockStore'
import { tapFeedback } from '../../lib/touchFeedback'

interface Props {
  open: boolean
  itemName: string
  expectedPin?: string
  onSuccess: (pin: string) => void
  onCancel: () => void
}

/**
 * Security gate for voiding Sent / Odesláno cart lines.
 * Verifies PIN without unlocking the staff terminal session.
 */
export function StornoPinModal({
  open,
  itemName,
  expectedPin,
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
    <div className="st-modal-backdrop" role="dialog" aria-modal="true" style={{ zIndex: 90 }}>
      <div className="st-modal panel" style={{ maxWidth: 440 }}>
        <div className="st-modal-head">
          <ShieldAlert size={22} color="#D4AF37" />
          <div>
            <h2 className="gold-text" style={{ margin: 0, fontSize: '1.25rem' }}>
              Zadejte Manažerský PIN pro Storno
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Odeslaná položka „{itemName}“ je uzamčena. Storno smaže řádek z účtu i z KDS.
            </p>
          </div>
        </div>

        <label className="label">Manažerský PIN</label>
        <input
          className="input"
          type="password"
          inputMode="numeric"
          autoFocus
          autoComplete="one-time-code"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="••••"
          style={{
            minHeight: 56,
            fontSize: '1.6rem',
            letterSpacing: '0.35em',
            textAlign: 'center',
            fontWeight: 900,
            marginBottom: 8,
          }}
        />

        {error && (
          <div
            style={{
              color: '#fca5a5',
              fontWeight: 700,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <Lock size={14} /> {error}
          </div>
        )}

        <p style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 12 }}>
          Demo PIN: {MOCK_STORNO_PIN} · nebo PIN z Profil & Tarif
        </p>

        <div className="st-modal-actions">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 52 }}
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
            style={{ minHeight: 52, fontWeight: 900 }}
            onClick={submit}
          >
            Potvrdit storno
          </button>
        </div>
      </div>
    </div>
  )
}
