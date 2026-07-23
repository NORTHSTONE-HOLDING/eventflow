import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import type { POSCartLine } from '../../types'
import { uid } from '../../lib/documentIds'

interface Props {
  open: boolean
  onClose: () => void
  onAdd: (line: POSCartLine) => void
}

export function CustomItemModal({ open, onClose, onAdd }: Props) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [vatRate, setVatRate] = useState(21)
  const [error, setError] = useState('')

  if (!open) return null

  const handleAdd = () => {
    const trimmed = name.trim()
    const priceNum = Number(String(price).replace(',', '.'))
    if (!trimmed) {
      setError('Zadejte název položky')
      return
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Zadejte platnou cenu v Kč')
      return
    }
    onAdd({
      cateringId: `custom_${uid('c')}`,
      lineId: uid('line'),
      name: trimmed,
      category: 'other',
      subcategory: 'ostatni',
      unitPrice: Math.round(priceNum),
      qty: 1,
      vatRate,
      foodCostPerUnit: 0,
      isCustom: true,
    })
    setName('')
    setPrice('')
    setVatRate(21)
    setError('')
    onClose()
  }

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        style={{ maxWidth: 440 }}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '1.35rem' }}>➕ Volná položka / Rychlý prodej</h2>
          <button type="button" className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="label">Název položky</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="např. Corkage, Speciál dne…"
          autoFocus
        />

        <label className="label" style={{ marginTop: 12 }}>
          Cena v Kč
        </label>
        <input
          className="input"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
        />

        <label className="label" style={{ marginTop: 12 }}>
          Sazba DPH
        </label>
        <select
          className="select"
          value={vatRate}
          onChange={(e) => setVatRate(Number(e.target.value))}
        >
          <option value={21}>21 %</option>
          <option value={12}>12 %</option>
          <option value={0}>0 %</option>
        </select>

        {error && (
          <div style={{ color: '#fca5a5', fontSize: '0.85rem', marginTop: 10 }}>{error}</div>
        )}

        <button
          type="button"
          className="btn btn-gold"
          style={{ width: '100%', marginTop: 16, minHeight: 48 }}
          onClick={handleAdd}
        >
          <Plus size={16} /> Přidat
        </button>
        <p style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Volná položka se tiskne na zákaznickou účtenku a neodepisuje sklad.
        </p>
      </motion.div>
    </motion.div>
  )
}
