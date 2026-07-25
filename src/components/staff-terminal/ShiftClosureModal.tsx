import { useMemo, useState } from 'react'
import { Flag, Loader2, Printer, Unlock } from 'lucide-react'
import type { EventProject } from '../../types'
import { formatCurrency } from '../../lib/documentIds'
import {
  computeCashBalance,
  computeShiftRevenue,
} from '../../lib/shiftFinance'
import { useAppStore } from '../../store/useAppStore'
import { useShiftFinanceStore } from '../../store/useShiftFinanceStore'
import { tapFeedback } from '../../lib/touchFeedback'
import { formatCzechDateTime } from '../../lib/czechDate'

interface Props {
  open: boolean
  project: EventProject | null
  waiterId: string
  waiterName: string
  onClose: () => void
  onClosed: () => void
}

/**
 * Compact Staff Terminal closure modal — same engine as 🏁 Uzávěrka & Směna.
 */
export function ShiftClosureModal({
  open,
  project,
  waiterId,
  waiterName,
  onClose,
  onClosed,
}: Props) {
  const profile = useAppStore((s) => s.profile)
  const kdsTickets = useAppStore((s) => s.kdsTickets)
  const clearAllKdsTickets = useAppStore((s) => s.clearAllKdsTickets)
  const shiftStartedAt = useShiftFinanceStore((s) => s.shiftStartedAt)
  const activeShiftId = useShiftFinanceStore((s) => s.activeShiftId)
  const ordersLocked = useShiftFinanceStore((s) => s.ordersLocked)
  const expensesAll = useShiftFinanceStore((s) => s.expenses)
  const closeShiftAndPrint = useShiftFinanceStore((s) => s.closeShiftAndPrint)
  const startNewShift = useShiftFinanceStore((s) => s.startNewShift)
  const [busy, setBusy] = useState(false)

  const expenses = useMemo(
    () => (expensesAll ?? []).filter((e) => e.shiftId === activeShiftId),
    [expensesAll, activeShiftId],
  )

  const revenue = useMemo(
    () => computeShiftRevenue(project, shiftStartedAt),
    [project, shiftStartedAt],
  )
  const balance = useMemo(
    () => computeCashBalance(revenue.cash, expenses),
    [revenue.cash, expenses],
  )

  if (!open) return null

  const finish = (print: boolean) => {
    setBusy(true)
    tapFeedback('kds')
    try {
      const res = closeShiftAndPrint({
        project,
        kdsTickets: kdsTickets ?? [],
        clearKdsTickets: clearAllKdsTickets,
        managerName: waiterName || profile.contactPerson || 'Vedoucí směny',
        waiterId,
        waiterName,
        venueName: profile.companyName || project?.name || 'EventFlow',
        print,
      })
      if (!res.ok) {
        tapFeedback('alert')
        return
      }
      tapFeedback('success')
      onClosed()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="st-modal-backdrop" role="dialog" aria-modal="true">
      <div className="st-modal panel">
        <div className="st-modal-head">
          <Flag size={20} color="var(--gold)" />
          <div>
            <h2 className="gold-text" style={{ margin: 0, fontSize: '1.4rem' }}>
              Uzavřít / Předat směnu
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Od {formatCzechDateTime(shiftStartedAt)} · KDS historie → archiv · 80mm tisk
            </p>
          </div>
        </div>

        {ordersLocked ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: '#fca5a5', fontWeight: 700 }}>
              Směna je uzavřena a terminál uzamčen pro nové objednávky.
            </p>
            <button
              type="button"
              className="btn btn-gold"
              style={{ minHeight: 52, width: '100%' }}
              onClick={() => {
                tapFeedback('success')
                startNewShift()
                onClose()
              }}
            >
              <Unlock size={16} /> Zahájit novou směnu
            </button>
          </div>
        ) : (
          <>
            <div className="st-closure-grid">
              <div>
                <div className="label">Tržba KUCHYŇ</div>
                <div className="st-closure-val">{formatCurrency(revenue.kitchen)}</div>
              </div>
              <div>
                <div className="label">Tržba BAR</div>
                <div className="st-closure-val">{formatCurrency(revenue.bar)}</div>
              </div>
              <div>
                <div className="label">Tržba HOTOVOST</div>
                <div className="st-closure-val">{formatCurrency(revenue.cash)}</div>
              </div>
              <div>
                <div className="label">Tržba TERMINÁL</div>
                <div className="st-closure-val">{formatCurrency(revenue.card)}</div>
              </div>
              <div>
                <div className="label">TRŽBA CELKEM</div>
                <div className="st-closure-val gold-text">{formatCurrency(revenue.total)}</div>
              </div>
              <div>
                <div className="label">Odepisy (zboží+zálohy+výplaty)</div>
                <div className="st-closure-val">
                  {formatCurrency(balance.goods + balance.advances + balance.payouts)}
                </div>
              </div>
            </div>

            <div className="st-closure-net">
              Konečný stav pokladny (Hotovost k předání):{' '}
              <strong className="gold-text">{formatCurrency(balance.finalCash)}</strong>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 12 }}>
              Podrobné odepisy a archiv najdete v menu „🏁 Uzávěrka & Směna“.
            </p>

            <div className="st-modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 52 }}
                disabled={busy}
                onClick={() => {
                  tapFeedback()
                  onClose()
                }}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="btn btn-gold"
                style={{ minHeight: 52, gridColumn: 'span 2' }}
                disabled={busy}
                onClick={() => finish(true)}
              >
                {busy ? <Loader2 className="spin" size={16} /> : <Printer size={16} />}
                🖨️ Uzavřít směnu a Vytisknout uzávěrku
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
