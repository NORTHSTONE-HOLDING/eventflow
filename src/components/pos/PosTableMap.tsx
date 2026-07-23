import { motion } from 'framer-motion'
import { Map, Plus } from 'lucide-react'
import type { PosTableTab } from '../../types'
import { tableOpenTotal } from '../../lib/tableTabs'
import { formatCurrency } from '../../lib/documentIds'

interface Props {
  tables: PosTableTab[]
  activeTableId: string | null
  onSelect: (tableId: string) => void
  onAddTable: () => void
}

export function PosTableMap({ tables, activeTableId, onSelect, onAddTable }: Props) {
  const list = Array.isArray(tables) ? tables : []

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <h3
          style={{
            fontSize: '1.05rem',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <Map size={16} color="var(--gold)" /> Mapa Stolů
        </h3>
        <button type="button" className="btn btn-ghost" onClick={onAddTable} style={{ minHeight: 40 }}>
          <Plus size={14} /> Přidat stůl
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 10,
        }}
      >
        {list.map((table) => {
          const total = tableOpenTotal(table)
          const active = table.id === activeTableId
          const hasItems = (table.lines ?? []).length > 0
          return (
            <motion.button
              key={table.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(table.id)}
              className="glass-glow"
              style={{
                minHeight: 88,
                padding: '0.85rem 0.7rem',
                borderRadius: 12,
                border: `1px solid ${active ? 'var(--gold)' : hasItems ? 'var(--border-strong)' : 'var(--border)'}`,
                background: active ? 'var(--gold-subtle)' : 'var(--bg-elevated)',
                boxShadow: active ? 'var(--shadow-gold)' : 'none',
                cursor: 'pointer',
                color: 'inherit',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.15rem',
                  marginBottom: 4,
                  color: active ? 'var(--gold)' : 'var(--text)',
                }}
              >
                {table.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {(table.lines ?? []).reduce((s, l) => s + (l.qty || 0), 0)} položek
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontWeight: 600,
                  color: hasItems ? 'var(--gold)' : 'var(--text-dim)',
                  fontSize: '0.95rem',
                }}
              >
                {formatCurrency(total)}
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
