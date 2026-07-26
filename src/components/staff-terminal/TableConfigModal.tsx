import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  clampSeatCapacity,
  DEFAULT_SEAT_CAPACITY,
  MAX_SEAT_CAPACITY,
  MIN_SEAT_CAPACITY,
} from '../../lib/tableTabs'
import { tapFeedback } from '../../lib/touchFeedback'

export interface TableConfigResult {
  label: string
  seatCapacity: number
}

interface Props {
  open: boolean
  mode: 'add' | 'edit'
  initialLabel?: string
  initialSeatCapacity?: number
  spaceName?: string
  onClose: () => void
  onSave: (result: TableConfigResult) => void
}

/**
 * Table Configuration panel — name + dynamic seat capacity (1–16).
 */
export function TableConfigModal({
  open,
  mode,
  initialLabel = '',
  initialSeatCapacity = DEFAULT_SEAT_CAPACITY,
  spaceName,
  onClose,
  onSave,
}: Props) {
  const [label, setLabel] = useState(initialLabel)
  const [seats, setSeats] = useState(clampSeatCapacity(initialSeatCapacity))

  useEffect(() => {
    if (!open) return
    setLabel(initialLabel)
    setSeats(clampSeatCapacity(initialSeatCapacity))
  }, [open, initialLabel, initialSeatCapacity])

  if (!open) return null

  const bump = (delta: number) => {
    tapFeedback()
    setSeats((prev) => clampSeatCapacity(prev + delta))
  }

  const submit = () => {
    const name = label.trim()
    if (!name) {
      tapFeedback('alert')
      return
    }
    tapFeedback('success')
    onSave({ label: name, seatCapacity: clampSeatCapacity(seats) })
  }

  return (
    <div
      className="st-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'add' ? 'Přidat stůl' : 'Upravit stůl'}
      onClick={onClose}
    >
      <div
        className="panel st-modal st-table-config-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="st-modal-head">
          <div>
            <h2 className="gold-text" style={{ margin: 0, fontSize: '1.25rem' }}>
              {mode === 'add' ? 'Konfigurace nového stolu' : 'Upravit stůl'}
            </h2>
            {spaceName && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Prostor: {spaceName}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 8, minHeight: 44 }}
            onClick={() => {
              tapFeedback()
              onClose()
            }}
            aria-label="Zavřít"
          >
            <X size={18} />
          </button>
        </div>

        <label className="label" htmlFor="st-table-label">
          Název / popis stolu
        </label>
        <input
          id="st-table-label"
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="např. Stůl 4"
          autoFocus
          style={{ marginBottom: 16, minHeight: 48 }}
        />

        <div className="st-seat-capacity-panel">
          <div className="label" style={{ marginBottom: 8 }}>
            Počet židlí / míst
          </div>
          <div className="st-seat-capacity-row">
            <button
              type="button"
              className="btn btn-ghost st-seat-cap-btn"
              onClick={() => bump(-1)}
              disabled={seats <= MIN_SEAT_CAPACITY}
              aria-label="Snížit kapacitu"
            >
              −
            </button>
            <div className="st-seat-cap-value" aria-live="polite">
              <strong className="gold-text">{seats}</strong>
              <span>{seats === 1 ? 'místo' : seats < 5 ? 'místa' : 'míst'}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost st-seat-cap-btn"
              onClick={() => bump(1)}
              disabled={seats >= MAX_SEAT_CAPACITY}
              aria-label="Zvýšit kapacitu"
            >
              +
            </button>
          </div>
          <input
            type="range"
            className="st-seat-capacity-slider"
            min={MIN_SEAT_CAPACITY}
            max={MAX_SEAT_CAPACITY}
            step={1}
            value={seats}
            aria-label="Počet židlí / míst"
            onChange={(e) => {
              tapFeedback()
              setSeats(clampSeatCapacity(Number(e.target.value)))
            }}
          />
          <div className="st-seat-cap-hint">
            Dynamická kapacita {MIN_SEAT_CAPACITY}–{MAX_SEAT_CAPACITY} židlí na stůl
          </div>
        </div>

        <button
          type="button"
          className="btn btn-gold"
          style={{ width: '100%', minHeight: 56, marginTop: 18, fontWeight: 900 }}
          onClick={submit}
        >
          {mode === 'add' ? 'Vytvořit stůl' : 'Uložit konfiguraci'}
        </button>
      </div>
    </div>
  )
}
