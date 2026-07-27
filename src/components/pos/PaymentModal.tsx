import { useEffect, useState } from 'react'
import { Modal } from '../common/Modal'
import { formatCZK } from '../../lib/format'
import { tap } from '../../lib/feedback'

interface PaymentModalProps {
  open: boolean
  total: number
  title?: string
  onClose: () => void
  onConfirm: (method: 'cash' | 'card' | 'split', cashPart: number, cardPart: number) => void
}

export function PaymentModal({ open, total, title = 'Platba účtu', onClose, onConfirm }: PaymentModalProps) {
  const [mode, setMode] = useState<'cash' | 'card' | 'split'>('cash')
  const [cash, setCash] = useState(0)

  useEffect(() => {
    if (open) {
      setMode('cash')
      setCash(total)
    }
  }, [open, total])

  const cashPart = mode === 'cash' ? total : mode === 'card' ? 0 : Math.min(cash, total)
  const cardPart = total - cashPart

  const confirm = () => {
    tap(990)
    onConfirm(mode, cashPart, cardPart)
  }

  return (
    <Modal open={open} title={title} onClose={onClose} maxWidth="max-w-sm">
      <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 p-4 text-center">
        <div className="text-xs uppercase tracking-wider text-slate-400">K úhradě</div>
        <div className="font-display text-4xl text-gold">{formatCZK(total)}</div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['cash', 'card', 'split'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              tap(660)
              setMode(m)
            }}
            className={`btn ${mode === m ? 'btn-gold' : 'btn-ghost'}`}
          >
            {m === 'cash' ? '💵 Hotovost' : m === 'card' ? '💳 Terminál' : '🔀 Split'}
          </button>
        ))}
      </div>

      {mode === 'split' && (
        <div className="mb-4">
          <label className="label">Hotovostní část ({formatCZK(cashPart)})</label>
          <input
            type="range"
            min={0}
            max={total}
            step={10}
            value={cash}
            onChange={(e) => setCash(Number(e.target.value))}
            className="w-full accent-gold"
          />
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>Hotovost: {formatCZK(cashPart)}</span>
            <span>Karta: {formatCZK(cardPart)}</span>
          </div>
        </div>
      )}

      <button type="button" onClick={confirm} className="btn btn-gold w-full">
        ✅ Dokončit platbu
      </button>
    </Modal>
  )
}
