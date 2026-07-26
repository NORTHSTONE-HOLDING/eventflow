import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CreditCard,
  Banknote,
  Split,
  X,
  FileText,
  ClipboardCheck,
  ArrowRight,
} from 'lucide-react'
import type { POSCartLine, POSPaymentMethod, TerminalSession } from '../../types'
import { cartTotals, paymentMethodLabel } from '../../lib/posEngine'
import { formatCurrency } from '../../lib/documentIds'
import { calcCashChange } from '../../lib/tableTabs'
import { runTerminalHandshake } from '../../lib/terminalHandshake'
import {
  runMobileWalletHandshake,
  type WalletPaySession,
} from '../../lib/mobilePayHandshake'
import { tapFeedback } from '../../lib/touchFeedback'

export interface CheckoutResult {
  method: POSPaymentMethod
  lines: POSCartLine[]
  cashAmount?: number
  cardAmount?: number
  changeGiven?: number
  tendered?: number
}

interface Props {
  open: boolean
  tableLines: POSCartLine[]
  tableLabel: string
  onClose: () => void
  onComplete: (result: CheckoutResult) => Promise<void> | void
}

type PayMode = 'full' | 'split'
type PayType =
  | 'cash'
  | 'card'
  | 'combined'
  | 'invoice'
  | 'all_inclusive'
  | 'apple_pay'
  | 'google_pay'

interface SplitPick {
  key: string
  line: POSCartLine
  selectedQty: number
}

function lineKey(l: POSCartLine, idx: number) {
  return l.lineId || `${l.cateringId}_${idx}`
}

export function AdvancedCheckout({
  open,
  tableLines,
  tableLabel,
  onClose,
  onComplete,
}: Props) {
  const [payMode, setPayMode] = useState<PayMode>('full')
  const [payType, setPayType] = useState<PayType>('card')
  const [picks, setPicks] = useState<SplitPick[]>([])
  const [tendered, setTendered] = useState('')
  const [cashPart, setCashPart] = useState('')
  const [busy, setBusy] = useState(false)
  const [terminalSession, setTerminalSession] = useState<TerminalSession | null>(null)
  const [walletSession, setWalletSession] = useState<WalletPaySession | null>(null)
  const [error, setError] = useState<string | null>(null)

  const source = useMemo(
    () => (Array.isArray(tableLines) ? tableLines : []),
    [tableLines],
  )

  useEffect(() => {
    if (!open) return
    setPayMode('full')
    setPayType('card')
    setPicks(
      source.map((line, idx) => ({
        key: lineKey(line, idx),
        line,
        selectedQty: 0,
      })),
    )
    setTendered('')
    setCashPart('')
    setBusy(false)
    setTerminalSession(null)
    setWalletSession(null)
    setError(null)
  }, [open, source])

  const payableLines: POSCartLine[] = useMemo(() => {
    if (payMode === 'full') return source.map((l) => ({ ...l }))
    return picks
      .filter((p) => p.selectedQty > 0)
      .map((p) => ({ ...p.line, qty: p.selectedQty }))
  }, [payMode, source, picks])

  const totals = cartTotals(payableLines)
  const tenderedNum = Number(String(tendered).replace(',', '.')) || 0
  const cashPartNum = Number(String(cashPart).replace(',', '.')) || 0
  const change = calcCashChange(tenderedNum, totals.totalGross)
  const cardRemainder = Math.max(0, totals.totalGross - cashPartNum)

  if (!open) return null

  const setPickQty = (key: string, qty: number) => {
    tapFeedback()
    setPicks((prev) =>
      prev.map((p) => {
        if (p.key !== key) return p
        const max = p.line.qty
        return { ...p, selectedQty: Math.max(0, Math.min(max, qty)) }
      })
    )
  }

  const selectAllSplit = () => {
    tapFeedback()
    setPicks((prev) => prev.map((p) => ({ ...p, selectedQty: p.line.qty })))
  }

  const clearSplit = () => {
    tapFeedback()
    setPicks((prev) => prev.map((p) => ({ ...p, selectedQty: 0 })))
  }

  const runTerminal = async (amount: number) => {
    setBusy(true)
    setError(null)
    const result = await runTerminalHandshake({
      amountCzK: amount,
      provider: 'stripe_terminal',
      onStatus: (s) => setTerminalSession({ ...s }),
    })
    setBusy(false)
    return result
  }

  const runExpressPay = async (method: 'apple_pay' | 'google_pay') => {
    tapFeedback('success')
    if (!payableLines.length) {
      setError('Vyberte položky k úhradě')
      return
    }
    setPayType(method)
    setBusy(true)
    setError(null)
    const wallet = await runMobileWalletHandshake({
      provider: method,
      amountCzK: totals.totalGross,
      onStatus: (s) => setWalletSession({ ...s }),
    })
    setBusy(false)
    if (!wallet.approved) {
      setError(
        wallet.declineReason ||
          (method === 'apple_pay' ? 'Apple Pay zamítnuto' : 'Google Pay zamítnuto'),
      )
      return
    }
    await onComplete({
      method,
      lines: payableLines,
      cardAmount: totals.totalGross,
    })
  }

  const handlePay = async () => {
    tapFeedback('success')
    if (!payableLines.length) {
      setError('Vyberte položky k úhradě')
      return
    }

    if (payType === 'cash') {
      if (tenderedNum < totals.totalGross) {
        setError('Zadaná hotovost je nižší než částka k úhradě')
        return
      }
      await onComplete({
        method: 'cash',
        lines: payableLines,
        cashAmount: totals.totalGross,
        changeGiven: change,
        tendered: tenderedNum,
      })
      return
    }

    if (payType === 'card') {
      const term = await runTerminal(totals.totalGross)
      if (!term.approved) {
        setError(term.declineReason || 'Platba kartou zamítnuta')
        return
      }
      await onComplete({
        method: 'card',
        lines: payableLines,
        cardAmount: totals.totalGross,
      })
      return
    }

    if (payType === 'combined') {
      if (cashPartNum <= 0 || cashPartNum >= totals.totalGross) {
        setError('Zadejte hotovostní část menší než celkovou částku')
        return
      }
      const term = await runTerminal(cardRemainder)
      if (!term.approved) {
        setError(term.declineReason || 'Zbytek na kartě byl zamítnut — košík zůstává')
        return
      }
      await onComplete({
        method: 'combined',
        lines: payableLines,
        cashAmount: cashPartNum,
        cardAmount: cardRemainder,
      })
      return
    }

    if (payType === 'apple_pay' || payType === 'google_pay') {
      await runExpressPay(payType)
      return
    }

    if (payType === 'invoice') {
      await onComplete({ method: 'invoice', lines: payableLines })
      return
    }

    await onComplete({ method: 'all_inclusive', lines: payableLines })
  }

  const waiting =
    busy ||
    terminalSession?.status === 'sending' ||
    terminalSession?.status === 'waiting_card' ||
    walletSession?.status === 'biometric' ||
    walletSession?.status === 'tokenizing'

  return (
    <motion.div
      className="modal-overlay no-print"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => !waiting && onClose()}
    >
      <motion.div
        className="modal"
        style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.35rem' }}>Platba · {tableLabel}</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Platit zvlášť · hotovost · karta · Apple Pay · Google Pay
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 6 }}
            disabled={waiting}
            onClick={() => {
              tapFeedback()
              onClose()
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={payMode === 'full' ? 'btn btn-gold' : 'btn btn-ghost'}
            onClick={() => {
              tapFeedback()
              setPayMode('full')
            }}
            disabled={waiting}
          >
            Celý účet
          </button>
          <button
            type="button"
            className={payMode === 'split' ? 'btn btn-gold' : 'btn btn-ghost'}
            onClick={() => {
              tapFeedback()
              setPayMode('split')
            }}
            disabled={waiting}
          >
            <Split size={14} /> Platit zvlášť
          </button>
        </div>

        {payMode === 'split' && (
          <div
            className="panel"
            style={{ marginBottom: 12, padding: '0.85rem', background: 'var(--bg-elevated)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="label" style={{ margin: 0 }}>
                Vyberte položky / množství
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={selectAllSplit}>
                  Vše
                </button>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={clearSplit}>
                  Nic
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
              {picks.map((p) => (
                <div
                  key={p.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8,
                    alignItems: 'center',
                    paddingBottom: 6,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.9rem' }}>{p.line.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      max {p.line.qty} · {formatCurrency(p.line.unitPrice)}
                    </div>
                  </div>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={p.line.qty}
                    value={p.selectedQty}
                    onChange={(e) => setPickQty(p.key, Number(e.target.value) || 0)}
                    style={{ width: 72, padding: '0.45rem' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            textAlign: 'center',
            padding: '0.9rem',
            marginBottom: 12,
            background: 'var(--gold-subtle)',
            borderRadius: 10,
            border: '1px solid var(--border-strong)',
          }}
        >
          <div className="label">K úhradě teď</div>
          <div className="gold-text" style={{ fontSize: '1.9rem', fontFamily: 'var(--font-display)' }}>
            {formatCurrency(totals.totalGross)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {payableLines.length} řádků · {totals.portionsIssued} ks
          </div>
        </div>

        {waiting ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-block', marginBottom: 10 }}
            >
              <CreditCard size={34} color="var(--gold)" />
            </motion.div>
            <div style={{ color: 'var(--gold)', fontWeight: 600 }}>
              {walletSession?.message ||
                terminalSession?.message ||
                `Odesláno do terminálu. Částka: ${totals.totalGross.toLocaleString('cs-CZ')} Kč. Čekání na přiložení karty…`}
            </div>
          </div>
        ) : (
          <>
            <div className="pos-express-pay-row">
              <button
                type="button"
                className="pos-apple-pay-btn"
                onClick={() => void runExpressPay('apple_pay')}
                disabled={!payableLines.length}
              >
                <span className="pos-apple-logo" aria-hidden>
                  
                </span>
                Apple Pay
              </button>
              <button
                type="button"
                className="pos-google-pay-btn"
                onClick={() => void runExpressPay('google_pay')}
                disabled={!payableLines.length}
              >
                <span className="pos-gpay-mark" aria-hidden>
                  G
                </span>
                Google Pay
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {(
                [
                  ['card', 'Karta / Terminál', CreditCard],
                  ['cash', 'Hotovost', Banknote],
                  ['combined', 'Kombinovaná', Split],
                  ['invoice', 'Na fakturu', FileText],
                  ['all_inclusive', 'All-Inclusive', ClipboardCheck],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className={payType === id ? 'btn btn-gold' : 'btn btn-ghost'}
                  style={{
                    justifyContent: 'flex-start',
                    minHeight: 48,
                    gridColumn: id === 'all_inclusive' ? '1 / -1' : undefined,
                  }}
                  onClick={() => {
                    tapFeedback()
                    setPayType(id)
                  }}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {payType === 'cash' && (
              <div className="panel" style={{ marginBottom: 12, padding: '0.85rem' }}>
                <label className="label">Zadáno (přijato od hosta)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  placeholder="např. 1000"
                />
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '1.05rem',
                  }}
                >
                  <span>Vrátit</span>
                  <span className="gold-text" style={{ fontWeight: 700 }}>
                    {formatCurrency(change)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[500, 1000, 2000, totals.totalGross].filter((n, i, a) => n > 0 && a.indexOf(n) === i).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        tapFeedback()
                        setTendered(String(n))
                      }}
                    >
                      {n.toLocaleString('cs-CZ')} Kč
                    </button>
                  ))}
                </div>
              </div>
            )}

            {payType === 'combined' && (
              <div className="panel" style={{ marginBottom: 12, padding: '0.85rem' }}>
                <label className="label">Hotovostní část (Kč)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={cashPart}
                  onChange={(e) => setCashPart(e.target.value)}
                  placeholder="např. 200"
                />
                <div style={{ marginTop: 10, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Zbytek na terminál:{' '}
                  <strong style={{ color: 'var(--gold)' }}>{formatCurrency(cardRemainder)}</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  Po potvrzení hotovosti se zbytek automaticky odešle na terminál.
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginBottom: 10,
                  padding: '0.7rem',
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8,
                  color: '#fca5a5',
                  fontSize: '0.88rem',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn btn-gold"
              style={{ width: '100%', minHeight: 52, fontSize: '1rem' }}
              disabled={!payableLines.length}
              onClick={handlePay}
            >
              <ArrowRight size={16} />
              Potvrdit ·{' '}
              {paymentMethodLabel(
                payType === 'card'
                  ? 'card'
                  : payType === 'cash'
                    ? 'cash'
                    : payType === 'combined'
                      ? 'combined'
                      : payType === 'invoice'
                        ? 'invoice'
                        : payType === 'apple_pay'
                          ? 'apple_pay'
                          : payType === 'google_pay'
                            ? 'google_pay'
                            : 'all_inclusive',
              )}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
