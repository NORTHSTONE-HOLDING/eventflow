import { useEffect, useMemo } from 'react'
import { Printer, X } from 'lucide-react'
import type { InventuraSession, InventoryItem } from '../../types'
import { inventuraVarianceValue } from '../../lib/inventoryModels'
import { formatCurrency } from '../../lib/documentIds'
import { useAppStore } from '../../store/useAppStore'
import { formatCzechDateTime } from '../../lib/czechDate'

interface Props {
  session: InventuraSession
  items: InventoryItem[]
  onClose: () => void
}

export function InventoryPrintReport({ session, items, onClose }: Props) {
  const profile = useAppStore((s) => s.profile)
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const rows = useMemo(() => {
    return session.counts
      .filter((c) => c.actual_quantity != null)
      .map((c) => {
        const item = itemMap.get(c.item_id)
        const variance = inventuraVarianceValue({
          expected_quantity: c.expected_quantity,
          actual_quantity: c.actual_quantity as number,
          unit_price: c.unit_price,
        })
        return { item, row: c, variance }
      })
      .filter((r) => r.item)
  }, [session.counts, itemMap])

  const totals = useMemo(() => {
    let manko = 0
    let prebytek = 0
    for (const r of rows) {
      if (r.variance.kind === 'manko') manko += Math.abs(r.variance.deltaValue)
      if (r.variance.kind === 'prebytek') prebytek += r.variance.deltaValue
    }
    return { manko, prebytek, net: prebytek - manko }
  }, [rows])

  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 350)
    return () => window.clearTimeout(t)
  }, [])

  const closedLabel = session.closed_at
    ? formatCzechDateTime(session.closed_at)
    : formatCzechDateTime(new Date())

  return (
    <div className="modal-overlay inventura-print-overlay" onClick={onClose}>
      <div
        className="inventura-print-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
          <button type="button" className="btn btn-gold" onClick={() => window.print()}>
            <Printer size={15} /> Tisknout znovu
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <header className="inv-print-header">
          <div>
            <div className="inv-print-brand">EventFlow</div>
            <h1>Inventurní sestava</h1>
            <p>
              {profile.companyName || 'Eventová agentura'} · IČO {profile.ico || '—'}
            </p>
          </div>
          <div className="inv-print-meta">
            <div>
              <strong>Název skladu:</strong> {session.warehouse_name}
            </div>
            <div>
              <strong>Datum provedení:</strong> {closedLabel}
            </div>
            <div>
              <strong>Protokol:</strong> {session.id}
            </div>
          </div>
        </header>

        <table className="inv-print-table">
          <thead>
            <tr>
              <th>Položka</th>
              <th>Sekce</th>
              <th>Jedn.</th>
              <th>Systém</th>
              <th>Reálné</th>
              <th>Rozdíl</th>
              <th>Kč</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, row, variance }) => (
              <tr key={row.item_id}>
                <td>{item!.name}</td>
                <td>{item!.warehouse_section}</td>
                <td>{item!.unit}</td>
                <td>{row.expected_quantity}</td>
                <td>{row.actual_quantity}</td>
                <td>
                  {variance.deltaQty === 0
                    ? '—'
                    : `${variance.deltaQty > 0 ? '+' : ''}${variance.deltaQty}`}
                </td>
                <td>
                  {variance.deltaValue === 0
                    ? '—'
                    : `${variance.deltaValue > 0 ? '+' : ''}${variance.deltaValue.toLocaleString('cs-CZ')}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="inv-print-totals">
          <div>
            <span>Celkové manko</span>
            <strong>{formatCurrency(totals.manko)}</strong>
          </div>
          <div>
            <span>Celkový přebytek</span>
            <strong>{formatCurrency(totals.prebytek)}</strong>
          </div>
          <div>
            <span>Saldo inventury</span>
            <strong>{formatCurrency(totals.net)}</strong>
          </div>
        </section>

        <section className="inv-print-sign">
          <div>
            <p>Předseda inventurní komise</p>
            <div className="sign-line" />
            <span>podpis / jméno</span>
          </div>
          <div>
            <p>Člen komise</p>
            <div className="sign-line" />
            <span>podpis / jméno</span>
          </div>
          <div>
            <p>Skladník / odpovědná osoba</p>
            <div className="sign-line" />
            <span>podpis / jméno</span>
          </div>
        </section>

        <footer className="inv-print-footer">
          EventFlow · Sklad & Inventura · luxusní provozní protokol · tisk šetřící inkoust
        </footer>
      </div>
    </div>
  )
}
