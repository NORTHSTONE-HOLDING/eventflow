import { useMemo } from 'react'
import { computePerformance, useAuditStore } from '../store/useAuditStore'
import { formatCZK, formatClock } from '../lib/format'
import type { AuditAction } from '../lib/types'

const ACTION_LABEL: Record<AuditAction, string> = {
  'add-item': 'Přidání položky',
  'send-order': 'Odeslání objednávky',
  'void-item': 'Storno',
  'quick-sale': 'Rychlý prodej',
  payment: 'Platba',
  'close-shift': 'Uzávěrka směny',
}

const ACTION_COLOR: Record<AuditAction, string> = {
  'add-item': 'text-slate-300',
  'send-order': 'text-emerald-400',
  'void-item': 'text-red-400',
  'quick-sale': 'text-blue-400',
  payment: 'text-gold',
  'close-shift': 'text-fuchsia-400',
}

export function AuditView() {
  const logs = useAuditStore((s) => s.logs)
  const perf = useMemo(() => computePerformance(logs), [logs])

  return (
    <div className="animate-fadeUp space-y-6">
      <div>
        <h1 className="font-display text-4xl text-white">Audit trail číšníků</h1>
        <p className="mt-1 text-slate-400">
          Kompletní záznam <code className="text-gold">waiter_audit_logs</code> — každá transakce a úprava
          položky s živým měřením výkonu.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {perf.map((p, i) => (
          <div
            key={p.waiterId}
            className={`card p-4 ${i === 0 ? 'border-gold shadow-gold' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{p.waiterName}</span>
              {i === 0 && <span className="badge badge-gold">TOP</span>}
            </div>
            <div className="mt-2 font-display text-2xl text-gold">{p.percent}%</div>
            <div className="text-xs text-slate-500">
              {p.actions} akcí · {formatCZK(p.revenue)}
            </div>
          </div>
        ))}
        {perf.length === 0 && (
          <p className="text-sm text-slate-500">Zatím žádné záznamy.</p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <div className="col-span-2">Čas</div>
          <div className="col-span-2">Číšník</div>
          <div className="col-span-2">Akce</div>
          <div className="col-span-4">Detail</div>
          <div className="col-span-2 text-right">Částka</div>
        </div>
        <div className="max-h-[52vh] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              Zatím žádné záznamy v audit logu.
            </p>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-12 gap-2 border-b border-slate-900 px-4 py-2.5 text-sm"
              >
                <div className="col-span-2 text-slate-400">{formatClock(l.ts)}</div>
                <div className="col-span-2 text-white">{l.waiterName}</div>
                <div className={`col-span-2 font-medium ${ACTION_COLOR[l.action]}`}>
                  {ACTION_LABEL[l.action]}
                </div>
                <div className="col-span-4 text-slate-400">{l.detail}</div>
                <div className="col-span-2 text-right text-slate-300">
                  {l.amount > 0 ? formatCZK(l.amount) : '—'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
