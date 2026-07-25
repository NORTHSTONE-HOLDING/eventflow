import { useMemo, useState } from 'react'
import { Banknote, CheckCircle2, Loader2, Lock, Wallet } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useStaffShiftStore } from '../../store/useStaffShiftStore'
import {
  czechMonthLabel,
  monthKeyFromDate,
} from '../../lib/shiftParser'
import { formatCurrency } from '../../lib/documentIds'
import type { StaffMember } from '../../types'

type PayrollCard = {
  staff: StaffMember
  hours: number
  gross: number
  advances: number
  payout: number
  paid: boolean
}

/**
 * Měsíční uzávěrka mezd — filter by month/year, zálohy, vyplacení.
 */
export function MonthlyPayrollArchive() {
  const projects = useAppStore((s) => s.projects)
  const setToast = useAppStore((s) => s.setToast)
  const syncRosterHint = useStaffShiftStore((s) => s.syncRosterHint)
  const shifts = useStaffShiftStore((s) => s.shifts)
  const advances = useStaffShiftStore((s) => s.advances)
  const payrollLocks = useStaffShiftStore((s) => s.payrollLocks)
  const addAdvance = useStaffShiftStore((s) => s.addAdvance)
  const markPayrollPaid = useStaffShiftStore((s) => s.markPayrollPaid)
  const advancesFor = useStaffShiftStore((s) => s.advancesFor)
  const isPayrollPaid = useStaffShiftStore((s) => s.isPayrollPaid)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [advanceDraft, setAdvanceDraft] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  const roster = useMemo(() => syncRosterHint(projects), [projects, syncRosterHint])

  const cards: PayrollCard[] = useMemo(() => {
    void shifts
    void advances
    void payrollLocks
    const monthShifts = shifts.filter((s) => s.date.startsWith(monthKey))
    const staffIds = new Set<string>()
    for (const s of monthShifts) staffIds.add(s.staff_id)
    for (const r of roster) {
      if (monthShifts.some((s) => s.staff_id === r.id)) staffIds.add(r.id)
    }

    const out: PayrollCard[] = []
    for (const id of staffIds) {
      const staff =
        roster.find((r) => r.id === id) ||
        (() => {
          const sample = monthShifts.find((s) => s.staff_id === id)
          if (!sample) return null
          return {
            id: sample.staff_id,
            name: sample.staff_name,
            role: sample.role,
            phone: '',
            hourlyWage: sample.hourly_wage,
            attendance: 'confirmed' as const,
            tasks: [],
            shiftStart: sample.shift_start,
            shiftEnd: sample.shift_end,
          }
        })()
      if (!staff) continue
      const rows = monthShifts.filter((s) => s.staff_id === id)
      const hours =
        Math.round(rows.reduce((sum, s) => sum + (Number(s.hours) || 0), 0) * 100) /
        100
      const gross = Math.round(
        rows.reduce((sum, s) => sum + (Number(s.labor_cost) || 0), 0),
      )
      const adv = advancesFor(id, monthKey)
      const paid = isPayrollPaid(id, monthKey)
      out.push({
        staff,
        hours,
        gross,
        advances: adv,
        payout: Math.max(0, gross - adv),
        paid,
      })
    }
    return out.sort((a, b) => a.staff.name.localeCompare(b.staff.name, 'cs'))
  }, [
    shifts,
    advances,
    payrollLocks,
    roster,
    monthKey,
    advancesFor,
    isPayrollPaid,
  ])

  const totals = useMemo(
    () => ({
      hours: Math.round(cards.reduce((s, c) => s + c.hours, 0) * 100) / 100,
      gross: cards.reduce((s, c) => s + c.gross, 0),
      advances: cards.reduce((s, c) => s + c.advances, 0),
      payout: cards.reduce((s, c) => s + c.payout, 0),
      paidCount: cards.filter((c) => c.paid).length,
    }),
    [cards],
  )

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear(), now.getFullYear() - 1])
    for (const s of shifts) {
      const y = Number(s.date.slice(0, 4))
      if (y) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [shifts, now])

  const onAdvance = async (card: PayrollCard) => {
    const raw = advanceDraft[card.staff.id] || ''
    const amount = Number(String(raw).replace(',', '.'))
    setBusyId(card.staff.id)
    try {
      const res = await addAdvance({
        staff: card.staff,
        amount,
        monthKey,
        note: `Záloha · ${czechMonthLabel(monthKey)}`,
      })
      if (!res.ok) {
        setToast(res.error || 'Záloha selhala')
        return
      }
      setToast(`Záloha ${formatCurrency(amount)} · ${card.staff.name}`)
      setAdvanceDraft((d) => ({ ...d, [card.staff.id]: '' }))
    } finally {
      setBusyId(null)
    }
  }

  const onPay = async (card: PayrollCard) => {
    if (card.paid) return
    setBusyId(card.staff.id)
    try {
      const res = await markPayrollPaid({
        staff: card.staff,
        monthKey,
        hours: card.hours,
        grossWage: card.gross,
        advances: card.advances,
      })
      if (!res.ok) {
        setToast(res.error || 'Vyplacení selhalo')
        return
      }
      setToast(`Mzda vyplacena · ${card.staff.name} · ${formatCurrency(card.payout)}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="payroll-archive">
      <div className="payroll-archive-head">
        <div>
          <h2 className="payroll-archive-title gold-text">Měsíční uzávěrka mezd</h2>
          <p className="payroll-archive-sub">
            Součet odpracovaných hodin, zálohy a doplatky k výplatě · {czechMonthLabel(monthKey)}
          </p>
        </div>
        <div className="payroll-filters">
          <label>
            <span className="label">Měsíc</span>
            <select
              className="select"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{ minHeight: 48 }}
            >
              {[
                'Leden',
                'Únor',
                'Březen',
                'Duben',
                'Květen',
                'Červen',
                'Červenec',
                'Srpen',
                'Září',
                'Říjen',
                'Listopad',
                'Prosinec',
              ].map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Rok</span>
            <select
              className="select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ minHeight: 48 }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="payroll-totals panel">
        <div>
          <div className="label">Odpracováno</div>
          <div className="payroll-total-val">{totals.hours} h</div>
        </div>
        <div>
          <div className="label">Hrubé mzdy</div>
          <div className="payroll-total-val gold-text">{formatCurrency(totals.gross)}</div>
        </div>
        <div>
          <div className="label">Zálohy</div>
          <div className="payroll-total-val">{formatCurrency(totals.advances)}</div>
        </div>
        <div>
          <div className="label">K výplatě</div>
          <div className="payroll-total-val">{formatCurrency(totals.payout)}</div>
        </div>
        <div>
          <div className="label">Vyplaceno</div>
          <div className="payroll-total-val">
            {totals.paidCount}/{cards.length}
          </div>
        </div>
      </div>

      <div className="payroll-cards">
        {cards.length === 0 && (
          <div className="panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            Za {czechMonthLabel(monthKey)} zatím nejsou žádné směny. Zadejte směnu na kase
            („Martina 07:00 - 19:00“) nebo v Personálu.
          </div>
        )}

        {cards.map((card) => {
          const busy = busyId === card.staff.id
          return (
            <div
              key={card.staff.id}
              className={`payroll-card panel ${card.paid ? 'is-paid' : ''}`}
            >
              <div className="payroll-card-top">
                <div>
                  <div className="payroll-card-name">{card.staff.name}</div>
                  <div className="payroll-card-role">
                    <span className="badge badge-gold">{card.staff.role}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {formatCurrency(card.staff.hourlyWage)} / h
                    </span>
                  </div>
                </div>
                {card.paid ? (
                  <span className="payroll-paid-badge">
                    <CheckCircle2 size={16} /> Vyplaceno
                  </span>
                ) : (
                  <span className="badge badge-warning">Čeká na výplatu</span>
                )}
              </div>

              <div className="payroll-metrics">
                <div>
                  <div className="label">Odpracované hodiny za měsíc</div>
                  <div className="payroll-metric-val">{card.hours} h</div>
                </div>
                <div>
                  <div className="label">Celková mzda k vyplacení</div>
                  <div className="payroll-metric-val gold-text">
                    {formatCurrency(card.gross)}
                  </div>
                </div>
                <div>
                  <div className="label">Poskytnuté Zálohy</div>
                  <div className="payroll-metric-val">{formatCurrency(card.advances)}</div>
                </div>
                <div>
                  <div className="label">Doplatek k výplatě</div>
                  <div className="payroll-metric-val">{formatCurrency(card.payout)}</div>
                </div>
              </div>

              <div className="payroll-actions">
                <div className="payroll-advance-box">
                  <div className="label">Kolonka Záloha</div>
                  <div className="payroll-advance-row">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="100"
                      placeholder="Kč"
                      disabled={card.paid || busy}
                      value={advanceDraft[card.staff.id] ?? ''}
                      onChange={(e) =>
                        setAdvanceDraft((d) => ({
                          ...d,
                          [card.staff.id]: e.target.value,
                        }))
                      }
                      style={{ minHeight: 48 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost payroll-btn-advance"
                      disabled={card.paid || busy}
                      onClick={() => void onAdvance(card)}
                    >
                      {busy ? <Loader2 size={15} className="spin" /> : <Wallet size={15} />}
                      ➕ Zadat zálohu
                    </button>
                  </div>
                </div>

                <div className="payroll-pay-box">
                  <div className="label">Kolonka Vyplaceno</div>
                  <button
                    type="button"
                    className={`btn payroll-btn-pay ${card.paid ? 'is-locked' : 'btn-emerald'}`}
                    disabled={card.paid || busy || card.hours <= 0}
                    onClick={() => void onPay(card)}
                  >
                    {card.paid ? (
                      <>
                        <Lock size={16} /> Mzda uzamčena
                      </>
                    ) : (
                      <>
                        {busy ? (
                          <Loader2 size={16} className="spin" />
                        ) : (
                          <Banknote size={16} />
                        )}
                        ✔ Vyplatit mzdu
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { monthKeyFromDate }
