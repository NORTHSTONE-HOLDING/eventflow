import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../common/Modal'
import { computeFinalCash, computeTotals, useShiftStore } from '../../store/useShiftStore'
import { useKdsStore } from '../../store/useKdsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { usePosStore } from '../../store/usePosStore'
import { useAuditStore } from '../../store/useAuditStore'
import { formatCZK, nextDocNumber } from '../../lib/format'
import { buildShiftReceiptHtml, printThermalReceipt } from '../../lib/receipt'
import { tap } from '../../lib/feedback'
import type { CashOutType } from '../../lib/types'

interface ShiftClosureProps {
  open: boolean
  onClose: () => void
}

const CASH_OUT_TYPES: { id: CashOutType; label: string }[] = [
  { id: 'zbozi', label: 'Platba zboží' },
  { id: 'zalohy', label: 'Zálohy' },
  { id: 'vyplaty', label: 'Výplaty' },
]

function Metric({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-800/60 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 font-display text-xl ${gold ? 'text-gold' : 'text-white'}`}>{value}</div>
    </div>
  )
}

export function ShiftClosure({ open, onClose }: ShiftClosureProps) {
  const navigate = useNavigate()
  const sales = useShiftStore((s) => s.sales)
  const cashOuts = useShiftStore((s) => s.cashOuts)
  const totals = useMemo(() => computeTotals(sales), [sales])
  const finalCash = useMemo(() => computeFinalCash(sales, cashOuts), [sales, cashOuts])
  const addCashOut = useShiftStore((s) => s.addCashOut)
  const removeCashOut = useShiftStore((s) => s.removeCashOut)
  const buildReceipt = useShiftStore((s) => s.buildReceipt)
  const closeShift = useShiftStore((s) => s.closeShift)
  const clearHistory = useKdsStore((s) => s.clearHistory)
  const company = useAuthStore((s) => s.company)
  const logout = useAuthStore((s) => s.logout)
  const waiters = usePosStore((s) => s.waiters)
  const waiterName = usePosStore((s) => s.waiterName)
  const log = useAuditStore((s) => s.log)

  const [type, setType] = useState<CashOutType>('zbozi')
  const [amount, setAmount] = useState('')
  const [workerId, setWorkerId] = useState(waiters[0].id)

  const handleAdd = () => {
    const value = Number(amount)
    if (!value || value <= 0) return
    tap(660)
    const label =
      type === 'vyplaty'
        ? `Výplata — ${waiterName(workerId)}`
        : type === 'zalohy'
          ? `Záloha — ${waiterName(workerId)}`
          : 'Platba zboží'
    addCashOut(type, label, value, workerId)
    setAmount('')
  }

  const handleClose = () => {
    tap(990)
    const receipt = buildReceipt(nextDocNumber())
    printThermalReceipt(buildShiftReceiptHtml(receipt, company))
    log({
      waiterId: 'manager',
      waiterName: 'Manažer',
      action: 'close-shift',
      detail: `Uzávěrka směny ${receipt.docNumber} — celkem ${receipt.totals.total} Kč`,
      amount: receipt.totals.total,
    })
    clearHistory()
    closeShift()
    logout()
    onClose()
    navigate('/')
  }

  return (
    <Modal open={open} title="🏁 Uzávěrka & Směna" onClose={onClose} maxWidth="max-w-2xl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Tržba Kuchyň" value={formatCZK(totals.kitchen)} />
        <Metric label="Tržba Bar" value={formatCZK(totals.bar)} />
        <Metric label="Tržba Hotovost" value={formatCZK(totals.cash)} />
        <Metric label="Tržba Terminál" value={formatCZK(totals.card)} />
        <Metric label="Tržba Celkem" value={formatCZK(totals.total)} gold />
        <Metric label="K odvodu (hotovost)" value={formatCZK(finalCash)} gold />
      </div>

      <div className="mt-5">
        <h4 className="mb-2 font-semibold text-white">Hotovostní výdej (ledger)</h4>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Typ</label>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as CashOutType)}
            >
              {CASH_OUT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {type !== 'zbozi' && (
            <div>
              <label className="label">Pracovník</label>
              <select
                className="input"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
              >
                {waiters.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="w-28">
            <label className="label">Částka</label>
            <input
              className="input"
              inputMode="numeric"
              placeholder="Kč"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button type="button" onClick={handleAdd} className="btn btn-ghost">
            ➕ Přidat
          </button>
        </div>

        <div className="mt-3 space-y-1">
          {cashOuts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
            >
              <span className="text-slate-300">{c.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-red-300">- {formatCZK(c.amount)}</span>
                <button
                  type="button"
                  onClick={() => removeCashOut(c.id)}
                  className="text-slate-500 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button type="button" onClick={handleClose} className="btn btn-gold mt-6 w-full">
        🖨️ Uzavřít směnu (tisk 80mm & odhlášení)
      </button>
    </Modal>
  )
}
