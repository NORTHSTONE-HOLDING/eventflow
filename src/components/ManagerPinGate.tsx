import { useState } from 'react'
import { Lock, ShieldAlert } from 'lucide-react'
import { DEFAULT_MANAGER_PIN, useStaffLockStore } from '../store/useStaffLockStore'

interface Props {
  open: boolean
  expectedPin?: string
  title?: string
  subtitle?: string
  onSuccess: () => void
  onCancel?: () => void
}

export function ManagerPinGate({
  open,
  expectedPin,
  title = 'Manager PIN — odemknutí administrace',
  subtitle = 'Personální terminál je uzamčen. Zadejte PIN manažera pro vstup do Admin Dashboardu.',
  onSuccess,
  onCancel,
}: Props) {
  const unlockWithPin = useStaffLockStore((s) => s.unlockWithPin)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = () => {
    const ok = unlockWithPin(pin, expectedPin)
    if (!ok) {
      setError('Nesprávný Manager PIN')
      setPin('')
      return
    }
    setError(null)
    setPin('')
    onSuccess()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        background: 'rgba(2, 6, 12, 0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        touchAction: 'manipulation',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          background: '#0f172a',
          border: '2px solid #D4AF37',
          borderRadius: 18,
          padding: '1.5rem',
          boxShadow: '0 20px 60px rgba(212,175,55,0.25)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <ShieldAlert size={28} color="#D4AF37" />
          <h2 style={{ color: '#D4AF37', fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>
            {title}
          </h2>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 16, lineHeight: 1.5 }}>
          {subtitle}
        </p>

        <label className="label" style={{ color: '#e2e8f0' }}>
          Manager PIN
        </label>
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
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#fff',
            touchAction: 'manipulation',
          }}
        />

        {error && (
          <div
            style={{
              marginTop: 10,
              color: '#fca5a5',
              fontWeight: 700,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <Lock size={14} /> {error}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: onCancel ? '1fr 1fr' : '1fr',
            gap: 10,
          }}
        >
          {onCancel && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 52, touchAction: 'manipulation' }}
              onClick={() => {
                setPin('')
                setError(null)
                onCancel()
              }}
            >
              Zůstat na terminálu
            </button>
          )}
          <button
            type="button"
            className="btn btn-gold"
            style={{
              minHeight: 52,
              touchAction: 'manipulation',
              fontWeight: 900,
              background: '#D4AF37',
              color: '#0b0f14',
            }}
            onClick={submit}
          >
            Odemknout Admin
          </button>
        </div>

        <p style={{ marginTop: 12, fontSize: '0.72rem', color: '#64748b', textAlign: 'center' }}>
          Výchozí PIN: {DEFAULT_MANAGER_PIN} · lze změnit v Profil & Tarif
        </p>
      </div>
    </div>
  )
}
