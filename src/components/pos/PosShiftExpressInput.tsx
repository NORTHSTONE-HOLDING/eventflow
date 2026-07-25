import { useMemo, useState } from 'react'
import { Clock, Loader2, Users } from 'lucide-react'
import { useAppStore, selectActiveProject } from '../../store/useAppStore'
import { useStaffShiftStore } from '../../store/useStaffShiftStore'
import { parseShiftInput, resolveShiftInput } from '../../lib/shiftParser'
import { formatCurrency } from '../../lib/documentIds'
import { toDateKey } from '../../lib/czechHolidays'

/**
 * POS / Kasa manager sub-panel — rychlé zadávání směn.
 * Format: „Martina 07:00 - 19:00“
 */
export function PosShiftExpressInput() {
  const projects = useAppStore((s) => s.projects)
  const project = useAppStore(selectActiveProject)
  const setToast = useAppStore((s) => s.setToast)
  const syncRosterHint = useStaffShiftStore((s) => s.syncRosterHint)
  const addShiftFromText = useStaffShiftStore((s) => s.addShiftFromText)
  const shifts = useStaffShiftStore((s) => s.shifts)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const todayKey = toDateKey(new Date())

  const roster = useMemo(() => {
    const global = syncRosterHint(projects)
    if (project?.staff?.length) {
      const ids = new Set(global.map((g) => g.id))
      for (const s of project.staff) {
        if (!ids.has(s.id)) global.push(s)
      }
    }
    return global
  }, [projects, project, syncRosterHint])

  const preview = useMemo(() => {
    const parsed = parseShiftInput(text)
    if (!parsed) return null
    const resolved = resolveShiftInput(text, roster)
    return { parsed, resolved }
  }, [text, roster])

  const todayShifts = useMemo(
    () => shifts.filter((s) => s.date === todayKey).slice(0, 8),
    [shifts, todayKey],
  )

  const submit = async () => {
    setBusy(true)
    try {
      const res = await addShiftFromText({
        text,
        roster,
        date: new Date(),
        projectId: project?.id ?? null,
        source: 'pos',
      })
      if (!res.ok || !res.shift) {
        setToast(res.error || 'Uložení směny selhalo')
        return
      }
      setToast(
        `Směna uložena · ${res.shift.staff_name} · ${res.shift.hours} h · ${formatCurrency(res.shift.labor_cost)}`,
      )
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pos-shift-express panel">
      <div className="pos-shift-express-head">
        <Users size={18} color="var(--gold)" />
        <div>
          <div className="pos-shift-express-title">Zadat směnu personálu</div>
          <div className="pos-shift-express-sub">
            Rychlé zadání na kase · např. <code>Martina 07:00 - 19:00</code>
          </div>
        </div>
      </div>

      <div className="pos-shift-express-row">
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Jméno HH:MM - HH:MM"
          style={{ minHeight: 52, fontSize: '1.05rem' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-gold"
          style={{ minHeight: 52, minWidth: 140 }}
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 size={16} className="spin" /> : <Clock size={16} />}
          Uložit směnu
        </button>
      </div>

      {preview && (
        <div
          className={`pos-shift-preview ${preview.resolved.ok ? 'ok' : 'err'}`}
        >
          {preview.resolved.ok ? (
            <>
              <strong>{preview.resolved.data.staff.name}</strong>
              <span className="badge badge-gold">{preview.resolved.data.staff.role}</span>
              <span>
                {preview.parsed.shiftStart} – {preview.parsed.shiftEnd}
              </span>
              <span>{preview.parsed.hours} h</span>
              <span className="gold-text" style={{ fontWeight: 800 }}>
                {formatCurrency(preview.resolved.data.laborCost)}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                × {formatCurrency(preview.resolved.data.hourlyWage)}/h
              </span>
            </>
          ) : (
            <span>{preview.resolved.error}</span>
          )}
        </div>
      )}

      {roster.length === 0 && (
        <div className="pos-shift-hint">
          Nejprve vytvořte akci s personálem v AI Planneru — sazby se vezmou z evidence.
        </div>
      )}

      {todayShifts.length > 0 && (
        <div className="pos-shift-today">
          <div className="label">Dnešní směny (kalendář sync)</div>
          {todayShifts.map((s) => (
            <div key={s.id} className="pos-shift-today-row">
              <span>{s.staff_name}</span>
              <span>
                {s.shift_start}–{s.shift_end}
              </span>
              <span>{s.hours} h</span>
              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                {formatCurrency(s.labor_cost)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
