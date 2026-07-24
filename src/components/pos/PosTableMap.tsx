import { motion } from 'framer-motion'
import { Map, Plus } from 'lucide-react'
import type { PosOperationMode, PosTableTab } from '../../types'
import { tableOpenTotal } from '../../lib/tableTabs'
import { formatCurrency } from '../../lib/documentIds'

interface Props {
  tables: PosTableTab[]
  activeTableId: string | null
  onSelect: (tableId: string) => void
  onAddTable: () => void
  operationMode?: PosOperationMode
}

function resolveKind(
  table: PosTableTab,
  mode: PosOperationMode
): 'restaurant' | 'event' {
  if (mode === 'regular') return 'restaurant'
  if (mode === 'event') return 'event'
  return table.billingKind === 'event' ? 'event' : 'restaurant'
}

export function PosTableMap({
  tables,
  activeTableId,
  onSelect,
  onAddTable,
  operationMode = 'hybrid',
}: Props) {
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {operationMode === 'hybrid' && (
            <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', fontWeight: 700 }}>
              <span style={{ color: '#D4AF37' }}>● Event (all-inclusive)</span>
              <span style={{ color: '#94a3b8' }}>● Restaurace (účet)</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onAddTable}
            style={{ minHeight: 48, minWidth: 48, touchAction: 'manipulation' }}
          >
            <Plus size={14} /> Přidat stůl
          </button>
        </div>
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
          const kind = resolveKind(table, operationMode)
          const isEvent = kind === 'event'
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
                border: `2px solid ${
                  active
                    ? '#D4AF37'
                    : isEvent
                      ? 'rgba(212,175,55,0.65)'
                      : hasItems
                        ? '#475569'
                        : '#334155'
                }`,
                background: active
                  ? 'rgba(212,175,55,0.22)'
                  : isEvent
                    ? 'rgba(212,175,55,0.12)'
                    : '#1e293b',
                boxShadow: active
                  ? '0 0 20px rgba(212,175,55,0.35)'
                  : isEvent
                    ? '0 0 16px rgba(212,175,55,0.22)'
                    : 'none',
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
                  color: active || isEvent ? '#D4AF37' : '#fff',
                  fontWeight: 800,
                }}
              >
                {table.label}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>
                {isEvent ? 'Event · all-inclusive' : 'Restaurace · účet'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>
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
