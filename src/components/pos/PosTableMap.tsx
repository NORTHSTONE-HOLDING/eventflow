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
    <div className="panel pos-table-map" style={{ marginBottom: 14, touchAction: 'manipulation' }}>
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
            color: '#fff',
            fontWeight: 800,
          }}
        >
          <Map size={16} color="#D4AF37" /> Mapa Stolů
        </h3>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onAddTable}
          style={{ minHeight: 48, minWidth: 48, touchAction: 'manipulation' }}
        >
          <Plus size={14} /> Přidat stůl
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
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
              style={{
                minHeight: 96,
                minWidth: 44,
                padding: '0.9rem 0.75rem',
                borderRadius: 14,
                border: `2px solid ${active ? '#D4AF37' : hasItems ? '#475569' : '#334155'}`,
                background: active ? 'rgba(212,175,55,0.18)' : '#1e293b',
                boxShadow: active ? '0 0 20px rgba(212,175,55,0.28)' : 'none',
                cursor: 'pointer',
                color: 'inherit',
                textAlign: 'left',
                touchAction: 'manipulation',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.2rem',
                  marginBottom: 4,
                  color: active ? '#D4AF37' : '#fff',
                  fontWeight: 800,
                }}
              >
                {table.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                {(table.lines ?? []).reduce((s, l) => s + (l.qty || 0), 0)} položek
                {table.assignedWaiterName ? ` · ${table.assignedWaiterName}` : ''}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontWeight: 900,
                  color: hasItems ? '#D4AF37' : '#64748b',
                  fontSize: '1.05rem',
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
