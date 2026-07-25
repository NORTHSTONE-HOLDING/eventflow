import { useMemo, useState } from 'react'
import { Flag, Loader2, Printer } from 'lucide-react'
import type { EventProject, ShiftClosureRecord } from '../../types'
import { formatCurrency, uid } from '../../lib/documentIds'
import { openThermalPrintWindow } from '../../lib/printerHardware'
import { usePosSpaceStore } from '../../store/usePosSpaceStore'
import { useStaffShiftStore } from '../../store/useStaffShiftStore'
import { tapFeedback } from '../../lib/touchFeedback'
import { toDateKey } from '../../lib/czechHolidays'
import { formatCzechDateTime } from '../../lib/czechDate'

interface Props {
  open: boolean
  project: EventProject | null
  waiterId: string
  waiterName: string
  onClose: () => void
  onClosed: () => void
}

export function ShiftClosureModal({
  open,
  project,
  waiterId,
  waiterName,
  onClose,
  onClosed,
}: Props) {
  const addClosure = usePosSpaceStore((s) => s.addClosure)
  const advances = useStaffShiftStore((s) => s.advances)
  const [goodsCash, setGoodsCash] = useState('0')
  const [busy, setBusy] = useState(false)

  const today = toDateKey(new Date())

  const revenue = useMemo(() => {
    const txs = project?.posTransactions ?? []
    let card = 0
    let cash = 0
    for (const t of txs) {
      const day = toDateKey(t.timestamp || '')
      if (day !== today) continue
      const amount = Number(t.totalGross) || 0
      if (t.paymentMethod === 'cash') cash += amount
      else if (t.paymentMethod === 'combined') {
        cash += Number(t.cashAmount) || 0
        card += Number(t.cardAmount) || amount - (Number(t.cashAmount) || 0)
      } else if (t.paymentMethod === 'card' || t.paymentMethod === 'invoice') {
        card += amount
      } else {
        card += amount
      }
    }
    return {
      card: Math.round(card),
      cash: Math.round(cash),
      total: Math.round(card + cash),
    }
  }, [project, today])

  const wagesToday = useMemo(() => {
    const monthKey = today.slice(0, 7)
    return Math.round(
      advances
        .filter((a) => a.month_key === monthKey && a.created_at.startsWith(today))
        .reduce((s, a) => s + (Number(a.amount) || 0), 0),
    )
  }, [advances, today])

  const goods = Math.max(0, Math.round(Number(String(goodsCash).replace(',', '.')) || 0))
  const netCash = Math.round(revenue.cash - goods - wagesToday)

  const thermalText = useMemo(() => {
    const lines = [
      '================================',
      '   EVENTFLOW · DENNÍ UZÁVĚRKA',
      '================================',
      formatCzechDateTime(new Date()),
      `Obsluha: ${waiterName}`,
      `Projekt: ${project?.name || '—'}`,
      '--------------------------------',
      `TRŽBA KARTA:     ${formatCurrency(revenue.card)}`,
      `TRŽBA HOTOVOST:  ${formatCurrency(revenue.cash)}`,
      `TRŽBA CELKEM:    ${formatCurrency(revenue.total)}`,
      '--------------------------------',
      `NÁKUP MATERIÁLU: ${formatCurrency(goods)}`,
      `MZDY / ZÁLOHY:   ${formatCurrency(wagesToday)}`,
      `ČISTÁ POKLADNA:  ${formatCurrency(netCash)}`,
      '================================',
      'Předání směny potvrzeno.',
      '',
    ]
    return lines.join('\n')
  }, [waiterName, project, revenue, goods, wagesToday, netCash])

  if (!open) return null

  const finish = async (print: boolean) => {
    setBusy(true)
    tapFeedback('success')
    try {
      const row: ShiftClosureRecord = {
        id: uid('closure'),
        createdAt: new Date().toISOString(),
        waiterId,
        waiterName,
        projectId: project?.id ?? null,
        projectName: project?.name || '—',
        revenueCard: revenue.card,
        revenueCash: revenue.cash,
        revenueTotal: revenue.total,
        deductionGoods: goods,
        deductionWages: wagesToday,
        netCashDrawer: netCash,
        notes: 'Uzávěrka směny z personálního terminálu',
        thermalText,
      }
      addClosure(row)
      if (print) openThermalPrintWindow(thermalText, 'Denní uzávěrka')
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
              Denní uzávěrka · vyvážení hotovosti · 80mm tisk
            </p>
          </div>
        </div>

        <div className="st-closure-grid">
          <div>
            <div className="label">Tržba karta</div>
            <div className="st-closure-val">{formatCurrency(revenue.card)}</div>
          </div>
          <div>
            <div className="label">Tržba hotovost</div>
            <div className="st-closure-val">{formatCurrency(revenue.cash)}</div>
          </div>
          <div>
            <div className="label">Tržba celkem</div>
            <div className="st-closure-val gold-text">{formatCurrency(revenue.total)}</div>
          </div>
          <div>
            <div className="label">Mzdy / zálohy (dnes)</div>
            <div className="st-closure-val">{formatCurrency(wagesToday)}</div>
          </div>
        </div>

        <label className="label">Nákup materiálu / zboží za hotové (Kč)</label>
        <input
          className="input"
          type="number"
          min={0}
          value={goodsCash}
          onChange={(e) => setGoodsCash(e.target.value)}
          style={{ minHeight: 48, marginBottom: 12 }}
        />

        <div className="st-closure-net">
          Čistá pokladna k předání:{' '}
          <strong className="gold-text">{formatCurrency(netCash)}</strong>
        </div>

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
            className="btn btn-ghost"
            style={{ minHeight: 52 }}
            disabled={busy}
            onClick={() => void finish(true)}
          >
            {busy ? <Loader2 className="spin" size={16} /> : <Printer size={16} />}
            Tisk denní uzávěrky
          </button>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 52 }}
            disabled={busy}
            onClick={() => void finish(false)}
          >
            {busy ? <Loader2 className="spin" size={16} /> : <Flag size={16} />}
            Potvrdit předání směny
          </button>
        </div>
      </div>
    </div>
  )
}
