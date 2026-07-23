import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Bluetooth,
  CreditCard,
  FileText,
  Lock,
  Minus,
  Monitor,
  Plus,
  Printer,
  Settings2,
  ShoppingCart,
  Trash2,
  Utensils,
  Wine,
  X,
  CheckCircle2,
  Banknote,
  ClipboardCheck,
  ChefHat,
} from 'lucide-react'
import {
  useAppStore,
  selectActiveProject,
  migrateProject,
  isPosUnlocked,
} from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import {
  cartTotals,
  computePosLiveMetrics,
  paymentMethodLabel,
} from '../lib/posEngine'
import { stockPercent, getLowStockItems } from '../lib/inventoryEngine'
import { formatCurrency } from '../lib/documentIds'
import { POS_CATEGORIES, filterPosMenu } from '../lib/posCategories'
import {
  dispatchPrintJobs,
  pairBluetoothPrinter,
  roleLabel,
} from '../lib/printerHardware'
import { runTerminalHandshake } from '../lib/terminalHandshake'
import {
  emptyCustomerDisplay,
  openPosDisplayWindow,
  publishCustomerDisplay,
} from '../lib/kdsSync'
import type {
  CateringItem,
  EventProject,
  POSCartLine,
  POSPaymentMethod,
  POSSubcategory,
  POSTransaction,
  PosPrinter,
  PrinterRole,
  TerminalSession,
} from '../types'

export function EventPOS() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const profile = useAppStore((s) => s.profile)
  const projects = useAppStore((s) => s.projects)
  const activeRaw = useAppStore(selectActiveProject)
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const setView = useAppStore((s) => s.setView)
  const ensureProjectPosReady = useAppStore((s) => s.ensureProjectPosReady)
  const completePosSale = useAppStore((s) => s.completePosSale)
  const closePosAndGenerateDoplatkova = useAppStore((s) => s.closePosAndGenerateDoplatkova)
  const warehouseAlerts = useAppStore((s) => s.warehouseAlerts)
  const printers = useAppStore((s) => s.printers)
  const upsertPrinter = useAppStore((s) => s.upsertPrinter)
  const setToast = useAppStore((s) => s.setToast)

  const unlockedTier = hasFeature(subscription || 'LITE', 'BUSINESS')

  const [mainCat, setMainCat] = useState<'food' | 'beverage'>('food')
  const [subCat, setSubCat] = useState<POSSubcategory | 'all'>('all')
  const [cart, setCart] = useState<POSCartLine[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [posLocked, setPosLocked] = useState(false)
  const [terminalSession, setTerminalSession] = useState<TerminalSession | null>(null)
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const [lastReceipt, setLastReceipt] = useState<POSTransaction | null>(null)
  const [doplatkovaPreview, setDoplatkovaPreview] = useState<string | null>(null)
  const [showPrinters, setShowPrinters] = useState(false)
  const [tableLabel, setTableLabel] = useState('Stůl 1')
  const [pairingRole, setPairingRole] = useState<PrinterRole | null>(null)

  // Safe migrate once via useMemo — NOT inside Zustand selector
  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const posOpen = isPosUnlocked(project)

  useEffect(() => {
    if (project?.id) ensureProjectPosReady(project.id)
  }, [project?.id, ensureProjectPosReady])

  useEffect(() => {
    setSubCat('all')
  }, [mainCat])

  // Sync customer-facing display whenever cart changes
  useEffect(() => {
    if (!project) {
      publishCustomerDisplay(emptyCustomerDisplay())
      return
    }
    const totals = cartTotals(cart)
    publishCustomerDisplay({
      projectName: project.name,
      lines: (cart ?? []).map((l) => ({
        name: l.name,
        qty: l.qty,
        price: l.unitPrice * l.qty,
      })),
      total: totals.totalGross,
      phase: terminalSession?.status === 'waiting_card' || terminalSession?.status === 'sending'
        ? 'tap_card'
        : terminalSession?.status === 'approved'
          ? 'approved'
          : terminalSession?.status === 'rejected'
            ? 'rejected'
            : cart.length
              ? 'cart'
              : 'idle',
      message:
        terminalSession?.message ||
        (cart.length ? 'Vaše objednávka' : 'Vítejte · EventFlow'),
      updatedAt: new Date().toISOString(),
    })
  }, [cart, project, terminalSession])

  const metrics = useMemo(
    () => (project ? computePosLiveMetrics(project) : null),
    [project]
  )

  const menuItems = useMemo(
    () => filterPosMenu(project?.catering, mainCat, subCat),
    [project, mainCat, subCat]
  )

  const lowStock = useMemo(
    () => getLowStockItems(project?.warehouse ?? []),
    [project]
  )

  const projectAlerts = (warehouseAlerts ?? []).filter(
    (a) => a.projectId === project?.id && !a.acknowledged
  )

  const safePrinters = Array.isArray(printers) ? printers : []
  const totals = cartTotals(cart ?? [])
  const currentSubs =
    POS_CATEGORIES.find((c) => c.id === mainCat)?.subs ?? []

  const addToCart = (item: CateringItem) => {
    if (!posOpen || posLocked) {
      setToast('POS je zamčená — dokončete podpis a zálohu')
      return
    }
    const planned = Math.max(1, item.plannedPortions || item.portion || 1)
    const costPer = (Number(item.foodCost) || 0) / planned

    setCart((prev) => {
      const list = Array.isArray(prev) ? prev : []
      const existing = list.find((l) => l.cateringId === item.id)
      if (existing) {
        return list.map((l) =>
          l.cateringId === item.id ? { ...l, qty: l.qty + 1 } : l
        )
      }
      return [
        ...list,
        {
          cateringId: item.id,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory || 'ostatni',
          unitPrice: Number(item.sellPrice) || 0,
          qty: 1,
          vatRate: Number(item.vatRate) || 12,
          foodCostPerUnit: costPer,
        },
      ]
    })
  }

  const changeQty = (id: string, delta: number) => {
    if (posLocked) return
    setCart((prev) =>
      (prev ?? [])
        .map((l) => (l.cateringId === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    )
  }

  const clearCart = () => setCart([])

  const finalizeSale = useCallback(
    (method: POSPaymentMethod, receiptOverride?: string) => {
      if (!project) return null
      const result = completePosSale(project.id, cart, method, {
        tableLabel: tableLabel || 'Bar / Kasa',
      })
      if (!result.ok) {
        setToast(result.error || 'Prodej selhal')
        return null
      }

      const receiptNumber = receiptOverride || result.receiptNumber || 'UC'
      const printCustomer = method === 'card' || method === 'invoice'
      dispatchPrintJobs({
        printers: safePrinters,
        projectName: project.name,
        receiptNumber,
        tableLabel: tableLabel || 'Bar / Kasa',
        lines: cart,
        companyName: profile.companyName || 'EventFlow',
        totalGross: method === 'all_inclusive' ? 0 : totals.totalGross,
        totalVat: method === 'all_inclusive' ? 0 : totals.totalVat,
        paymentLabel: paymentMethodLabel(method),
        printCustomerReceipt: printCustomer,
      })

      const tx = buildLocalReceiptSnapshot(cart, method, receiptNumber)
      setLastReceipt(tx)
      clearCart()
      setCheckoutOpen(false)
      setTerminalSession(null)
      setTerminalError(null)
      setPosLocked(false)
      return result
    },
    [
      project,
      cart,
      completePosSale,
      tableLabel,
      safePrinters,
      profile.companyName,
      totals.totalGross,
      totals.totalVat,
      setToast,
    ]
  )

  const runCardPayment = async () => {
    if (!project || !cart.length) return
    setPosLocked(true)
    setTerminalError(null)
    setCheckoutOpen(true)

    const result = await runTerminalHandshake({
      amountCzK: totals.totalGross,
      provider: 'stripe_terminal',
      onStatus: (session) => setTerminalSession({ ...session }),
    })

    if (result.approved) {
      finalizeSale('card', undefined)
      publishCustomerDisplay({
        projectName: project.name,
        lines: [],
        total: totals.totalGross,
        phase: 'approved',
        message: 'Platba schválena — děkujeme',
        updatedAt: new Date().toISOString(),
      })
    } else {
      setTerminalError(
        result.declineReason ||
          'Platba zamítnuta. Košík zůstává aktivní — zkuste jinou kartu.'
      )
      setPosLocked(false)
      setTerminalSession(result.session)
      publishCustomerDisplay({
        projectName: project.name,
        lines: cart.map((l) => ({
          name: l.name,
          qty: l.qty,
          price: l.unitPrice * l.qty,
        })),
        total: totals.totalGross,
        phase: 'rejected',
        message: 'Platba zamítnuta',
        updatedAt: new Date().toISOString(),
      })
    }
  }

  const runSimplePayment = (method: 'invoice' | 'all_inclusive') => {
    if (posLocked) return
    finalizeSale(method)
  }

  const handlePairPrinter = async (role: PrinterRole) => {
    setPairingRole(role)
    try {
      const printer = await pairBluetoothPrinter(role)
      upsertPrinter(printer)
      setToast(`Spárováno: ${printer.name}`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Párování selhalo')
    } finally {
      setPairingRole(null)
    }
  }

  const handleClosePos = () => {
    if (!project) return
    const text = closePosAndGenerateDoplatkova(project.id)
    if (text) setDoplatkovaPreview(text)
  }

  if (!unlockedTier) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">Event POS / Kasa</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 300 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Prodejní kasa vyžaduje tarif BUSINESS+</div>
          <button type="button" className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat
          </button>
        </div>
      </div>
    )
  }

  const registry = (projects ?? [])
    .map((p) => migrateProject(p))
    .filter((p): p is EventProject => Boolean(p))

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }} className="pos-root">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 className="section-title gold-text">Event POS / Kasa</h1>
          <p className="section-sub">
            Multi-tiskárny · terminál handshake · KDS · zákaznický display
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setShowPrinters((v) => !v)}>
            <Settings2 size={15} /> Tiskárny
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => openPosDisplayWindow('/pos/customer', 1)}
          >
            <Monitor size={15} /> Zákaznický display
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => openPosDisplayWindow('/pos/kds', 2)}
          >
            <ChefHat size={15} /> KDS Kuchyň
          </button>
          {project && posOpen && !project.posClosed && (
            <button type="button" className="btn btn-ghost" onClick={handleClosePos}>
              <FileText size={15} /> Uzavřít kasu
            </button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            alignItems: 'end',
          }}
          className="pos-select-row"
        >
          <div>
            <label className="label">Aktivní akce z registru</label>
            <select
              className="select"
              value={project?.id || ''}
              onChange={(e) => {
                setActiveProject(e.target.value || null)
                clearCart()
                setLastReceipt(null)
              }}
            >
              <option value="">— Vyberte akci —</option>
              {registry.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.documents?.nabidka || ''}
                  {isPosUnlocked(p) ? ' · ODEMČENO' : p.posClosed ? ' · UZAVŘENO' : ' · ZAMČENO'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Stůl / zóna</label>
            <input
              className="input"
              value={tableLabel}
              onChange={(e) => setTableLabel(e.target.value)}
              style={{ width: 140 }}
            />
          </div>
        </div>

        {project && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className={`badge ${posOpen ? 'badge-success' : project.posClosed ? 'badge-warning' : 'badge-danger'}`}
            >
              {posOpen ? 'POS ODEMČENA' : project.posClosed ? 'KASA UZAVŘENA' : 'POS ZAMČENA'}
            </span>
            <span className="badge badge-gold">{project.documents?.faktura}</span>
            {!posOpen && !project.posClosed && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setView('portal')}
              >
                Otevřít klientský portál
              </button>
            )}
          </div>
        )}
      </div>

      {showPrinters && (
        <PrinterConfigPanel
          printers={safePrinters}
          pairingRole={pairingRole}
          onPair={handlePairPrinter}
          onClose={() => setShowPrinters(false)}
        />
      )}

      {!project && (
        <div className="panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Vyberte aktivní akci z registru, nebo vytvořte novou v AI Planneru.
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-gold" onClick={() => setView('planner')}>
              AI Planner
            </button>
          </div>
        </div>
      )}

      {project && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <MetricCard label="Aktuální Obrat Kasy" value={formatCurrency(metrics?.currentTurnover ?? 0)} />
            <MetricCard label="Reálná Marže v %" value={`${(metrics?.realMarginPercent ?? 0).toFixed(1)} %`} />
            <MetricCard
              label="Porce vs. Plán"
              value={`${metrics?.portionsIssued ?? 0} / ${metrics?.portionsPlanned ?? 0}`}
            />
            <MetricCard
              label="Skladové alerty"
              value={String(lowStock.length + projectAlerts.length)}
              danger={lowStock.length > 0}
            />
          </div>

          {(lowStock.length > 0 || projectAlerts.length > 0) && (
            <div
              className="panel"
              style={{
                marginBottom: 14,
                borderColor: 'rgba(239,68,68,0.45)',
                background: 'rgba(239,68,68,0.08)',
                display: 'flex',
                gap: 12,
              }}
            >
              <motion.div animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>
                <AlertTriangle size={22} color="#fca5a5" />
              </motion.div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {(projectAlerts.length
                  ? projectAlerts
                  : lowStock.map((w) => ({
                      id: w.id,
                      itemName: `${w.name} (${w.unit})`,
                      percentLeft: stockPercent(w),
                    }))
                )
                  .slice(0, 6)
                  .map((a) => `${a.itemName}: ${Number(a.percentLeft).toFixed(1)} %`)
                  .join(' · ')}
              </div>
            </div>
          )}

          {/* Category navigation */}
          <div
            className="panel"
            style={{
              marginBottom: 12,
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {POS_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={mainCat === cat.id ? 'btn btn-gold' : 'btn btn-ghost'}
                  style={{ flexShrink: 0, minHeight: 44, padding: '0.7rem 1.2rem' }}
                  onClick={() => setMainCat(cat.id as 'food' | 'beverage')}
                >
                  {cat.id === 'food' ? <Utensils size={16} /> : <Wine size={16} />}
                  {cat.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {currentSubs.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className={subCat === sub.id ? 'btn btn-gold' : 'btn btn-ghost'}
                  style={{
                    flexShrink: 0,
                    minHeight: 40,
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.85rem',
                  }}
                  onClick={() => setSubCat(sub.id)}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="pos-layout"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr minmax(280px, 340px)',
              gap: 14,
              alignItems: 'start',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                gap: 10,
                opacity: posOpen && !posLocked ? 1 : 0.45,
                pointerEvents: posOpen && !posLocked ? 'auto' : 'none',
                maxHeight: '62vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 8,
              }}
            >
              {menuItems.map((item) => {
                const sold = item.soldPortions || 0
                const planned = item.plannedPortions || item.portion || 1
                const linkedLow = lowStock.some((w) =>
                  (w.linkedCateringIds ?? []).includes(item.id)
                )
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="glass-glow"
                    onClick={() => addToCart(item)}
                    style={{
                      minHeight: 118,
                      padding: '0.9rem 0.75rem',
                      background: 'var(--bg-panel)',
                      border: `1px solid ${linkedLow ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                      borderRadius: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                      position: 'relative',
                    }}
                  >
                    {linkedLow && (
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        style={{ position: 'absolute', top: 8, right: 8 }}
                      >
                        <AlertTriangle size={14} color="#fca5a5" />
                      </motion.span>
                    )}
                    <div
                      style={{
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--gold)',
                        marginBottom: 4,
                      }}
                    >
                      {item.subcategory || item.category}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        lineHeight: 1.25,
                        marginBottom: 8,
                        minHeight: 38,
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ color: 'var(--gold)', fontWeight: 600 }}>
                      {formatCurrency(item.sellPrice || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
                      {sold}/{planned}
                    </div>
                  </button>
                )
              })}
              {!menuItems.length && (
                <div
                  className="panel"
                  style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)' }}
                >
                  Žádné položky v této podkategorii.
                </div>
              )}
            </div>

            {/* Cart / cashier screen */}
            <div
              className="panel"
              style={{
                position: 'sticky',
                top: 12,
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-gold)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ fontSize: '1.1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ShoppingCart size={16} color="var(--gold)" /> Košík · Pokladna
                </h3>
                {cart.length > 0 && !posLocked && (
                  <button type="button" className="btn btn-ghost" style={{ padding: 6 }} onClick={clearCart}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {posLocked && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: '0.65rem',
                    background: 'var(--gold-subtle)',
                    borderRadius: 8,
                    border: '1px solid var(--border-strong)',
                    fontSize: '0.85rem',
                    color: 'var(--gold)',
                  }}
                >
                  POS uzamčena — probíhá handshake s terminálem
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {(cart ?? []).map((line) => (
                  <div
                    key={line.cateringId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '0.55rem 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {line.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--gold)' }}>
                        {formatCurrency(line.unitPrice)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: 4, minWidth: 36, minHeight: 36 }}
                        disabled={posLocked}
                        onClick={() => changeQty(line.cateringId, -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 600 }}>{line.qty}</span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: 4, minWidth: 36, minHeight: 36 }}
                        disabled={posLocked}
                        onClick={() => changeQty(line.cateringId, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {!cart.length && (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', padding: '1rem 0' }}>
                    Klepněte na položku menu.
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: '1px solid var(--border-strong)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.2rem',
                  fontWeight: 600,
                }}
              >
                <span>Celkem</span>
                <span className="gold-text">{formatCurrency(totals.totalGross)}</span>
              </div>

              <button
                type="button"
                className="btn btn-gold"
                style={{ width: '100%', marginTop: 12, padding: '0.9rem', fontSize: '1rem', minHeight: 48 }}
                disabled={!cart.length || !posOpen || posLocked}
                onClick={() => {
                  setTerminalError(null)
                  setTerminalSession(null)
                  setCheckoutOpen(true)
                }}
              >
                <Banknote size={16} /> Platba / Checkout
              </button>
            </div>
          </div>

          {lastReceipt && (
            <ReceiptPanel
              tx={lastReceipt}
              project={project}
              profileName={profile.companyName || 'EventFlow'}
              onClose={() => setLastReceipt(null)}
            />
          )}

          {doplatkovaPreview && (
            <div className="panel" style={{ marginTop: 14, whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ color: 'var(--text)' }}>Doplatková faktura</h3>
                <button type="button" className="btn btn-ghost" onClick={() => setDoplatkovaPreview(null)}>
                  <X size={14} />
                </button>
              </div>
              {doplatkovaPreview}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {checkoutOpen && (
          <CheckoutModal
            totals={totals}
            terminalSession={terminalSession}
            terminalError={terminalError}
            posLocked={posLocked}
            onClose={() => {
              if (!posLocked) {
                setCheckoutOpen(false)
                setTerminalError(null)
              }
            }}
            onCard={runCardPayment}
            onInvoice={() => runSimplePayment('invoice')}
            onAllInclusive={() => runSimplePayment('all_inclusive')}
          />
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 900px) {
          .pos-layout { grid-template-columns: 1fr !important; }
          .pos-select-row { grid-template-columns: 1fr !important; }
        }
        @media print {
          body * { visibility: hidden !important; }
          .receipt-print, .receipt-print * { visibility: visible !important; }
          .receipt-print {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 80mm !important; background: white !important; color: black !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function MetricCard({
  label,
  value,
  danger,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div
      className="panel glass-glow"
      style={{ borderColor: danger ? 'rgba(239,68,68,0.45)' : undefined, padding: '0.9rem' }}
    >
      <div className="label">{label}</div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.35rem',
          color: danger ? '#fca5a5' : 'var(--gold)',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function PrinterConfigPanel({
  printers,
  pairingRole,
  onPair,
  onClose,
}: {
  printers: PosPrinter[]
  pairingRole: PrinterRole | null
  onPair: (role: PrinterRole) => void
  onClose: () => void
}) {
  const roles: PrinterRole[] = ['kitchen', 'bar', 'receipt']
  return (
    <div className="panel" style={{ marginBottom: 14, borderColor: 'var(--border-strong)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: '1.15rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Bluetooth size={18} color="var(--gold)" /> Konfigurace tiskáren
        </h3>
        <button type="button" className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {roles.map((role) => {
          const printer = printers.find((p) => p.role === role)
          return (
            <div
              key={role}
              style={{
                padding: '1rem',
                background: 'var(--bg-elevated)',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{roleLabel(role)}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                {printer
                  ? `${printer.name} · ${printer.connection} · ${printer.address}`
                  : 'Nepřiřazeno'}
              </div>
              <button
                type="button"
                className="btn btn-gold"
                style={{ width: '100%' }}
                disabled={pairingRole === role}
                onClick={() => onPair(role)}
              >
                <Bluetooth size={14} />
                {pairingRole === role ? 'Páruji…' : printer?.paired ? 'Znovu spárovat' : 'Spárovat BT'}
              </button>
            </div>
          )
        })}
      </div>
      <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
        Jídlo → Kuchyňská bonička · Pití → Barová objednávka · Účtenka → Zákaznická tiskárna (80mm).
      </p>
    </div>
  )
}

function CheckoutModal({
  totals,
  terminalSession,
  terminalError,
  posLocked,
  onClose,
  onCard,
  onInvoice,
  onAllInclusive,
}: {
  totals: ReturnType<typeof cartTotals>
  terminalSession: TerminalSession | null
  terminalError: string | null
  posLocked: boolean
  onClose: () => void
  onCard: () => void
  onInvoice: () => void
  onAllInclusive: () => void
}) {
  const waiting =
    terminalSession?.status === 'sending' ||
    terminalSession?.status === 'waiting_card' ||
    posLocked

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
        style={{ maxWidth: 480 }}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.4rem' }}>Platba / Checkout</h2>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 6 }}
            onClick={onClose}
            disabled={waiting}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            textAlign: 'center',
            padding: '1rem',
            marginBottom: 16,
            background: 'var(--gold-subtle)',
            borderRadius: 10,
            border: '1px solid var(--border-strong)',
          }}
        >
          <div className="label">Přesná částka pro terminál</div>
          <div className="gold-text" style={{ fontSize: '2rem', fontFamily: 'var(--font-display)' }}>
            {formatCurrency(totals.totalGross)}
          </div>
        </div>

        {waiting ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-block', marginBottom: 12 }}
            >
              <CreditCard size={36} color="var(--gold)" />
            </motion.div>
            <div style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: 8 }}>
              {terminalSession?.message ||
                `Odesláno do terminálu. Částka: ${totals.totalGross.toLocaleString('cs-CZ')} Kč. Čekání na přiložení karty…`}
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              Stripe Terminal / SumUp · automatický přenos částky (bez ručního zadání)
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {terminalError && (
              <div
                style={{
                  padding: '0.75rem',
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 8,
                  color: '#fca5a5',
                  fontSize: '0.9rem',
                }}
              >
                {terminalError}
              </div>
            )}
            <button
              type="button"
              className="btn btn-gold"
              style={{ padding: '1rem', justifyContent: 'flex-start', minHeight: 56 }}
              onClick={onCard}
            >
              <CreditCard size={18} />
              <div style={{ textAlign: 'left' }}>
                <div>Platba Kartou / Terminál</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: 400 }}>
                  API handshake · částka {formatCurrency(totals.totalGross)} automaticky
                </div>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '1rem', justifyContent: 'flex-start', minHeight: 56 }}
              onClick={onInvoice}
            >
              <FileText size={18} color="var(--gold)" />
              <div style={{ textAlign: 'left' }}>
                <div>Zapsat na celkovou fakturu</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  Doplatková faktura + dispatch kuchyně/bar
                </div>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '1rem', justifyContent: 'flex-start', minHeight: 56 }}
              onClick={onAllInclusive}
            >
              <ClipboardCheck size={18} color="var(--gold)" />
              <div style={{ textAlign: 'left' }}>
                <div>Odkliknout porci / All-Inclusive</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  Bez platby · bonička do kuchyně/baru
                </div>
              </div>
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function ReceiptPanel({
  tx,
  project,
  profileName,
  onClose,
}: {
  tx: POSTransaction
  project: EventProject
  profileName: string
  onClose: () => void
}) {
  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={18} color="var(--success)" />
          <h3 style={{ fontSize: '1.05rem' }}>Účtenka {tx.receiptNumber}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-gold" onClick={() => window.print()}>
            <Printer size={15} /> Tisk účtenky
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div
        className="receipt-print"
        style={{
          maxWidth: 320,
          margin: '0 auto',
          padding: '1rem',
          background: '#fff',
          color: '#111',
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 12,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <strong>{profileName}</strong>
          <div>{project.name}</div>
        </div>
        <div>{tx.receiptNumber}</div>
        <div>{new Date(tx.timestamp).toLocaleString('cs-CZ')}</div>
        <div>{paymentMethodLabel(tx.paymentMethod)}</div>
        <hr />
        {(tx.lines ?? []).map((l, i) => (
          <div key={`${l.cateringId}-${i}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {l.name} ×{l.qty}
            </span>
            <span>{(l.unitPrice * l.qty).toLocaleString('cs-CZ')}</span>
          </div>
        ))}
        <hr />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>CELKEM</span>
          <span>{tx.totalGross.toLocaleString('cs-CZ')} Kč</span>
        </div>
      </div>
    </div>
  )
}

function buildLocalReceiptSnapshot(
  lines: POSCartLine[],
  method: POSPaymentMethod,
  receiptNumber: string
): POSTransaction {
  const totals = cartTotals(lines)
  const charged = method !== 'all_inclusive'
  return {
    id: `local_${Date.now()}`,
    receiptNumber,
    timestamp: new Date().toISOString(),
    lines: (lines ?? []).map((l) => ({ ...l })),
    paymentMethod: method,
    totalGross: charged ? totals.totalGross : 0,
    totalNet: charged ? totals.totalNet : 0,
    totalVat: charged ? totals.totalVat : 0,
    totalFoodCost: totals.totalFoodCost,
    portionsIssued: totals.portionsIssued,
    appendedToInvoice: method === 'invoice',
    charged,
  }
}
