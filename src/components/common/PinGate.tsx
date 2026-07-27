import { useState } from 'react'
import { Modal } from './Modal'
import { MANAGER_PIN } from '../../lib/constants'
import { tap } from '../../lib/feedback'

interface PinGateProps {
  open: boolean
  title?: string
  reason?: string
  onClose: () => void
  onSuccess: () => void
}

export function PinGate({ open, title = 'Manažerský PIN', reason, onClose, onSuccess }: PinGateProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const press = (digit: string) => {
    tap(660)
    setError(false)
    setPin((p) => (p.length < 4 ? p + digit : p))
  }

  const submit = (value: string) => {
    if (value === MANAGER_PIN) {
      tap(990)
      setPin('')
      setError(false)
      onSuccess()
    } else {
      setError(true)
      setPin('')
    }
  }

  const handleClose = () => {
    setPin('')
    setError(false)
    onClose()
  }

  return (
    <Modal open={open} title={title} onClose={handleClose} maxWidth="max-w-xs">
      {reason && <p className="mb-4 text-sm text-slate-400">{reason}</p>}
      <div className="mb-4 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border ${
              pin.length > i ? 'border-gold bg-gold' : 'border-slate-600'
            }`}
          />
        ))}
      </div>
      {error && (
        <p className="mb-3 text-center text-sm font-semibold text-red-400">
          Nesprávný PIN, zkuste to znovu.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            className="btn btn-ghost h-14 text-xl"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            tap(440)
            setPin((p) => p.slice(0, -1))
          }}
          className="btn btn-ghost h-14 text-xl"
        >
          ⌫
        </button>
        <button type="button" onClick={() => press('0')} className="btn btn-ghost h-14 text-xl">
          0
        </button>
        <button
          type="button"
          onClick={() => submit(pin)}
          className="btn btn-gold h-14 text-xl"
        >
          ✓
        </button>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">Nápověda demo: PIN je 1234</p>
    </Modal>
  )
}
