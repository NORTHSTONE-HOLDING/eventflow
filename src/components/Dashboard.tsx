import { useMemo } from 'react'
import { computeTotals, useShiftStore } from '../store/useShiftStore'
import { computePerformance, useAuditStore } from '../store/useAuditStore'
import { useKdsStore } from '../store/useKdsStore'
import { usePosStore } from '../store/usePosStore'
import { formatCZK, formatClock } from '../lib/format'

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 font-display text-3xl text-gold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export function Dashboard() {
  const sales = useShiftStore((s) => s.sales)
  const totals = useMemo(() => computeTotals(sales), [sales])
  const logs = useAuditStore((s) => s.logs)
  const perf = useMemo(() => computePerformance(logs), [logs])
  const tickets = useKdsStore((s) => s.tickets)
  const tables = usePosStore((s) => s.tables)
  const openTables = tables.filter((t) => t.items.length > 0).length

  return (
    <div className="animate-fadeUp space-y-6">
      <div>
        <h1 className="font-display text-4xl text-white">Provozní přehled</h1>
        <p className="mt-1 text-slate-400">Živé metriky vaší směny v reálném čase.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Tržba celkem" value={formatCZK(totals.total)} sub={`${sales.length} účtenek`} />
        <Kpi label="Tržba kuchyň" value={formatCZK(totals.kitchen)} />
        <Kpi label="Tržba bar" value={formatCZK(totals.bar)} />
        <Kpi label="Otevřené stoly" value={String(openTables)} sub={`${tickets.length} aktivních tiketů`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-display text-2xl text-white">Poslední transakce</h2>
          {sales.length === 0 ? (
            <p className="text-sm text-slate-500">Zatím žádné tržby. Otevřete POS Terminál.</p>
          ) : (
            <div className="space-y-2">
              {sales.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-semibold text-white">{s.docNumber}</span>
                    <span className="ml-2 text-slate-400">{s.tableName ?? 'Rychlý prodej'}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gold">{formatCZK(s.total)}</div>
                    <div className="text-xs text-slate-500">{formatClock(s.ts)} · {s.method}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-display text-2xl text-white">Výkon personálu</h2>
          {perf.length === 0 ? (
            <p className="text-sm text-slate-500">Zatím žádná aktivita.</p>
          ) : (
            <div className="space-y-3">
              {perf.map((p) => (
                <div key={p.waiterId}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-white">{p.waiterName}</span>
                    <span className="text-slate-400">
                      {p.percent}% · {formatCZK(p.revenue)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600"
                      style={{ width: `${p.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
