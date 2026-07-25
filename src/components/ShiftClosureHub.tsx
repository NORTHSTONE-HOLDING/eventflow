import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Flag,
  Loader2,
  Plus,
  Printer,
  Trash2,
  Utensils,
  Wine,
  Unlock,
  Archive,
} from 'lucide-react'
import {
  migrateProject,
  selectActiveProject,
  useAppStore,
} from '../store/useAppStore'
import { useShiftFinanceStore } from '../store/useShiftFinanceStore'
import { useStaffShiftStore } from '../store/useStaffShiftStore'
import { usePosSessionStore } from '../store/usePosSessionStore'
import {
  computeCashBalance,
  computeShiftRevenue,
  expenseKindLabel,
} from '../lib/shiftFinance'
import { formatCurrency } from '../lib/documentIds'
import { formatCzechDateTime } from '../lib/czechDate'
import { tapFeedback } from '../lib/touchFeedback'
import type { ShiftCashExpenseKind } from '../types'

export interface ShiftClosureHubProps {
  /** Embedded inside /pos-terminal after Manager PIN */
  embedded?: boolean
  onBack?: () => void
  /**
   * After successful Uzavřít směnu — parent should logout waiter,
   * start new shift UI, and return to fresh POS map.
   */
  onClosedComplete?: () => void
}

/**
 * 🏁 Uzávěrka & Směna — live revenue, cash expense ledger, thermal close.
 */
export function ShiftClosureHub({
  embedded = false,
  onBack,
  onClosedComplete,
}: ShiftClosureHubProps = {}) {
  const activeRaw = useAppStore(selectActiveProject)
  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const profile = useAppStore((s) => s.profile)
  const kdsTickets = useAppStore((s) => s.kdsTickets)
  const clearAllKdsTickets = useAppStore((s) => s.clearAllKdsTickets)
  const setToast = useAppStore((s) => s.setToast)

  const shiftStartedAt = useShiftFinanceStore((s) => s.shiftStartedAt)
  const activeShiftId = useShiftFinanceStore((s) => s.activeShiftId)
  const ordersLocked = useShiftFinanceStore((s) => s.ordersLocked)
  const expensesAll = useShiftFinanceStore((s) => s.expenses)
  const documentArchive = useShiftFinanceStore((s) => s.documentArchive)
  const addExpense = useShiftFinanceStore((s) => s.addExpense)
  const removeExpense = useShiftFinanceStore((s) => s.removeExpense)
  const closeShiftAndPrint = useShiftFinanceStore((s) => s.closeShiftAndPrint)
  const startNewShift = useShiftFinanceStore((s) => s.startNewShift)

  const syncRosterHint = useStaffShiftStore((s) => s.syncRosterHint)
  const projects = useAppStore((s) => s.projects)
  const waiters = usePosSessionStore((s) => s.waiters)
  const getActiveWaiter = usePosSessionStore((s) => s.getActiveWaiter)
  const waiter = getActiveWaiter()

  const [expKind, setExpKind] = useState<ShiftCashExpenseKind>('goods_cash')
  const [expAmount, setExpAmount] = useState('')
  const [expStaff, setExpStaff] = useState('')
  const [expNote, setExpNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [managerName, setManagerName] = useState(
    () => waiter?.name || profile.contactPerson || 'Vedoucí směny',
  )

  const expenses = useMemo(
    () => (expensesAll ?? []).filter((e) => e.shiftId === activeShiftId),
    [expensesAll, activeShiftId],
  )

  const roster = useMemo(() => {
    const fromProjects = syncRosterHint(projects ?? [])
    const names = new Map<string, { id: string; name: string }>()
    for (const s of fromProjects) names.set(s.id, { id: s.id, name: s.name })
    for (const w of waiters) {
      if (![...names.values()].some((n) => n.name === w.name)) {
        names.set(w.id, { id: w.id, name: w.name })
      }
    }
    // Demo names when roster empty
    if (!names.size) {
      ;['Martina', 'Petr', 'Anna', 'Jan'].forEach((n, i) =>
        names.set(`demo_${i}`, { id: `demo_${i}`, name: n }),
      )
    }
    return Array.from(names.values()).sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  }, [projects, waiters, syncRosterHint])

  const revenue = useMemo(
    () => computeShiftRevenue(project, shiftStartedAt),
    [project, shiftStartedAt],
  )
  const balance = useMemo(
    () => computeCashBalance(revenue.cash, expenses),
    [revenue.cash, expenses],
  )

  const needsStaff = expKind === 'staff_advance' || expKind === 'staff_payout'

  const onAddExpense = () => {
    tapFeedback()
    const staff = roster.find((r) => r.id === expStaff || r.name === expStaff)
    const row = addExpense({
      kind: expKind,
      amount: Number(String(expAmount).replace(',', '.')) || 0,
      staffId: staff?.id ?? null,
      staffName: staff?.name ?? (needsStaff ? expStaff : null),
      note: expNote,
    })
    if (!row) {
      setToast(
        needsStaff
          ? 'Zadejte částku a vyberte zaměstnance'
          : 'Zadejte platnou částku výdeje',
      )
      return
    }
    tapFeedback('success')
    setExpAmount('')
    setExpNote('')
    setToast(`${expenseKindLabel(expKind)} · ${formatCurrency(row.amount)}`)
  }

  const onCloseShift = () => {
    if (ordersLocked) {
      setToast('Směna je již uzavřena')
      return
    }
    if (
      !window.confirm(
        embedded
          ? 'Uzavřít směnu z terminálu? Vytiskne se 80mm uzávěrka, KDS historie se archivuje a obsluha bude odhlášena pro novou směnu.'
          : 'Uzavřít směnu? KDS historie se přesune do archivu, terminál se uzamkne pro nové objednávky a vytiskne se uzávěrka.',
      )
    ) {
      return
    }
    setBusy(true)
    tapFeedback('kds')
    try {
      const res = closeShiftAndPrint({
        project,
        kdsTickets: kdsTickets ?? [],
        clearKdsTickets: clearAllKdsTickets,
        managerName: managerName.trim() || 'Vedoucí směny',
        waiterId: waiter?.id,
        waiterName: waiter?.name,
        venueName: profile.companyName || project?.name || 'EventFlow',
        print: true,
      })
      if (!res.ok) {
        setToast(res.error || 'Uzávěrka selhala')
        return
      }
      // Bar-tablet protocol: unlock next morning shift immediately after archive+print
      if (embedded) {
        startNewShift()
      }
      tapFeedback('success')
      setToast(
        embedded
          ? 'Směna uzavřena · tisk odeslán · KDS archivována · obsluha odhlášena'
          : 'Směna uzavřena · KDS historie archivována · uzávěrka odeslána na tisk',
      )
      onClosedComplete?.()
    } finally {
      setBusy(false)
    }
  }

  const onStartNew = () => {
    tapFeedback('success')
    startNewShift()
    setToast('Nová směna zahájena — terminál odemčen')
  }

  return (
    <div className={`closure-hub ${embedded ? 'closure-hub-embedded' : ''}`}>
      <header className="closure-hub-head">
        <div>
          {embedded && onBack && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 44, marginBottom: 8 }}
              onClick={() => {
                tapFeedback()
                onBack()
              }}
            >
              <ArrowLeft size={16} /> Zpět na terminál
            </button>
          )}
          <h1 className="gold-text" style={{ margin: 0, fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>
            🏁 Uzávěrka & Směna
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '6px 0 0' }}>
            Tržby · odepisy · konečný stav pokladny · tisk 80mm · archiv KDS
          </p>
        </div>
        <div className="closure-hub-meta">
          <div>
            Směna od{' '}
            <strong className="gold-text">{formatCzechDateTime(shiftStartedAt)}</strong>
          </div>
          <div>
            Stav:{' '}
            <strong style={{ color: ordersLocked ? '#fca5a5' : '#86efac' }}>
              {ordersLocked ? 'UZAVŘENO / UZAMČENO' : 'AKTIVNÍ'}
            </strong>
          </div>
        </div>
      </header>

      {ordersLocked && (
        <div className="closure-locked-banner">
          Terminál je uzamčen pro nové objednávky. KDS historie byla přesunuta do archivu dokumentů.
          <button type="button" className="btn btn-gold" style={{ minHeight: 48 }} onClick={onStartNew}>
            <Unlock size={16} /> Zahájit novou směnu
          </button>
        </div>
      )}

      <section className="closure-metrics">
        {(
          [
            ['Tržba KUCHYŇ', revenue.kitchen, Utensils],
            ['Tržba BAR', revenue.bar, Wine],
            ['Tržba HOTOVOST', revenue.cash, Banknote],
            ['Tržba TERMINÁL', revenue.card, CreditCard],
          ] as const
        ).map(([label, value, Icon]) => (
          <div key={label} className="closure-metric-card">
            <div className="closure-metric-label">
              <Icon size={15} color="#D4AF37" /> {label}
            </div>
            <div className="closure-metric-val">{formatCurrency(value)}</div>
          </div>
        ))}
        <div className="closure-metric-card closure-metric-total">
          <div className="closure-metric-label">TRŽBA CELKEM</div>
          <div className="closure-metric-val gold-text">{formatCurrency(revenue.total)}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Hotovost + Terminál</div>
        </div>
      </section>

      <div className="closure-grid-2">
        <section className="panel closure-panel">
          <h2 className="gold-text" style={{ fontSize: '1.15rem', marginTop: 0 }}>
            Odepisování z tržby
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Rychlý zápis hotovostních výdejů během směny (zboží, zálohy, výplaty).
          </p>

          <div className="closure-exp-kinds">
            {(
              [
                ['goods_cash', 'Platba zboží v hotovosti'],
                ['staff_advance', 'Zálohy zaměstnanci'],
                ['staff_payout', 'Výplata zaměstnanci'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={expKind === id ? 'btn btn-gold' : 'btn btn-ghost'}
                style={{ minHeight: 48 }}
                disabled={ordersLocked}
                onClick={() => {
                  tapFeedback()
                  setExpKind(id)
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {needsStaff && (
            <>
              <label className="label">Zaměstnanec</label>
              <select
                className="input"
                value={expStaff}
                disabled={ordersLocked}
                onChange={(e) => setExpStaff(e.target.value)}
                style={{ minHeight: 48, marginBottom: 10 }}
              >
                <option value="">— Vyberte jméno —</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="label">Částka (Kč)</label>
          <input
            className="input"
            inputMode="decimal"
            value={expAmount}
            disabled={ordersLocked}
            onChange={(e) => setExpAmount(e.target.value)}
            placeholder="např. 350"
            style={{ minHeight: 48, marginBottom: 10 }}
          />

          <label className="label">Poznámka (volitelné)</label>
          <input
            className="input"
            value={expNote}
            disabled={ordersLocked}
            onChange={(e) => setExpNote(e.target.value)}
            placeholder={
              expKind === 'goods_cash' ? 'např. led, limetky' : 'např. záloha na směnu'
            }
            style={{ minHeight: 48, marginBottom: 10 }}
          />

          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 52, width: '100%' }}
            disabled={ordersLocked}
            onClick={onAddExpense}
          >
            <Plus size={16} /> Přidat výdej
          </button>

          <div className="closure-exp-list">
            {expenses.map((e) => (
              <div key={e.id} className="closure-exp-row">
                <div>
                  <div style={{ fontWeight: 800 }}>{expenseKindLabel(e.kind)}</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    {e.staffName ? `${e.staffName} · ` : ''}
                    {formatCzechDateTime(e.createdAt)}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <div className="gold-text" style={{ fontWeight: 900 }}>
                  −{formatCurrency(e.amount)}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 44, minWidth: 44, padding: 8 }}
                  disabled={ordersLocked}
                  onClick={() => {
                    tapFeedback('alert')
                    removeExpense(e.id)
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {!expenses.length && (
              <div style={{ color: '#64748b', padding: '0.75rem 0' }}>
                Zatím žádné odepisy v této směně.
              </div>
            )}
          </div>
        </section>

        <section className="panel closure-panel">
          <h2 className="gold-text" style={{ fontSize: '1.15rem', marginTop: 0 }}>
            Konečný stav pokladny
          </h2>

          <label className="label">Jméno vedoucího směny</label>
          <input
            className="input"
            value={managerName}
            disabled={ordersLocked}
            onChange={(e) => setManagerName(e.target.value)}
            style={{ minHeight: 48, marginBottom: 14 }}
          />

          <div className="closure-balance-rows">
            <div>
              <span>Tržba HOTOVOST</span>
              <strong>{formatCurrency(balance.cashRevenue)}</strong>
            </div>
            <div>
              <span>− Platba zboží</span>
              <strong>{formatCurrency(balance.goods)}</strong>
            </div>
            <div>
              <span>− Zálohy</span>
              <strong>{formatCurrency(balance.advances)}</strong>
            </div>
            <div>
              <span>− Výplaty</span>
              <strong>{formatCurrency(balance.payouts)}</strong>
            </div>
            <div className="closure-balance-final closure-balance-hero">
              <span>Konečný stav pokladny (Hotovost k předání)</span>
              <strong className="gold-text closure-balance-hero-val">
                {formatCurrency(balance.finalCash)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="st-send-order-btn"
            style={{ marginTop: 16 }}
            disabled={busy || ordersLocked}
            onClick={onCloseShift}
          >
            {busy ? <Loader2 className="spin" size={18} /> : <Printer size={18} />}
            {' '}🖨️ Uzavřít směnu a Vytisknout uzávěrku
          </button>

          <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 10 }}>
            {embedded
              ? 'Tisk 80mm · archivace KDS historie · odhlášení obsluhy · čistý terminál pro novou směnu.'
              : 'Uzávěrka zamkne POS, přesune vydané KDS tickety do archivu dokumentů a spustí tisk 80mm (window.print).'}
          </p>
        </section>
      </div>

      <section className="panel closure-panel" style={{ marginTop: 16 }}>
        <h2 className="gold-text" style={{ fontSize: '1.15rem', marginTop: 0 }}>
          <Archive size={18} style={{ marginRight: 8 }} />
          Archiv dokumentů (uzávěrky)
        </h2>
        <div className="closure-archive-list">
          {documentArchive.slice(0, 12).map((doc) => (
            <div key={doc.id} className="closure-archive-row">
              <div>
                <div style={{ fontWeight: 800 }}>{doc.title}</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  {formatCzechDateTime(doc.createdAt)} · KDS ticketů:{' '}
                  {doc.kdsTickets.length} · Pokladna:{' '}
                  {formatCurrency(doc.closure.netCashDrawer)}
                </div>
              </div>
              <Flag size={16} color="#D4AF37" />
            </div>
          ))}
          {!documentArchive.length && (
            <div style={{ color: '#64748b' }}>Archiv je prázdný — první uzávěrka se uloží sem.</div>
          )}
        </div>
      </section>
    </div>
  )
}
