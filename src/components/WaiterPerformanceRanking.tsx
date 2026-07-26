import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { useWaiterAuditStore } from '../store/useWaiterAuditStore'
import { useShiftFinanceStore } from '../store/useShiftFinanceStore'
import { migrateProject, selectActiveProject, useAppStore } from '../store/useAppStore'
import { computeShiftRevenue } from '../lib/shiftFinance'
import { formatCurrency } from '../lib/documentIds'

interface Props {
  /** Compact variant for payroll tab */
  compact?: boolean
  title?: string
}

/**
 * High-contrast waiter performance ranking:
 * (Total CZK by Waiter X / Total Shift Revenue) × 100
 */
export function WaiterPerformanceRanking({
  compact = false,
  title = 'Výkonnost číšníků',
}: Props) {
  const activeRaw = useAppStore(selectActiveProject)
  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const shiftStartedAt = useShiftFinanceStore((s) => s.shiftStartedAt)
  const logs = useWaiterAuditStore((s) => s.waiter_audit_logs)
  const computePerformance = useWaiterAuditStore((s) => s.computePerformance)

  const revenue = useMemo(
    () => computeShiftRevenue(project, shiftStartedAt),
    [project, shiftStartedAt],
  )

  const rows = useMemo(
    () => computePerformance(revenue.total),
    [computePerformance, revenue.total, logs],
  )

  return (
    <div className={`waiter-perf-panel${compact ? ' is-compact' : ''}`}>
      <div className="waiter-perf-head">
        <Trophy size={18} color="#D4AF37" />
        <div>
          <h3 className="gold-text" style={{ margin: 0 }}>
            {title}
          </h3>
          <p>
            Podíl tržby směny · celkem {formatCurrency(revenue.total)} · vzorec (CZK číšníka /
            tržba směny) × 100
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="waiter-perf-empty">
          Zatím žádné úkony v aktivní směně — stopa číšníka se naplní po prvních objednávkách.
        </div>
      ) : (
        <div className="waiter-perf-list">
          {rows.map((row, idx) => (
            <div key={row.waiter_name} className="waiter-perf-row">
              <div className="waiter-perf-rank">#{idx + 1}</div>
              <div className="waiter-perf-body">
                <div className="waiter-perf-meta">
                  <strong>{row.waiter_name}</strong>
                  <span>{row.actionCount} úkonů</span>
                  <span className="gold-text">{formatCurrency(row.totalRevenueCzk)}</span>
                  <span className="waiter-perf-pct">{row.performancePercent.toFixed(1)} %</span>
                </div>
                <div
                  className="waiter-perf-bar-track"
                  role="progressbar"
                  aria-valuenow={row.performancePercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Výkonnost ${row.waiter_name}`}
                >
                  <div
                    className="waiter-perf-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(2, row.performancePercent))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
