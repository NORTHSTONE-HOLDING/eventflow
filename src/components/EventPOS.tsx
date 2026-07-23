import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  CreditCard,
  FileText,
  Lock,
  Minus,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
  Utensils,
  Wine,
  X,
  CheckCircle2,
  Banknote,
  ClipboardCheck,
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
import type {
  CateringItem,
  EventProject,
  POSCartLine,
  POSPaymentMethod,
  POSTransaction,
} from '../types'

export function EventPOS() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const profile = useAppStore((s) => s.profile)
  const projects = useAppStore((s) => s.projects)
  const active = useAppStore(selectActiveProject)
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const setView = useAppStore((s) => s.setView)
  const ensureProjectPosReady = useAppStore((s) => s.ensureProjectPosReady)
  const completePosSale = useAppStore((s) => s.completePosSale)
  const closePosAndGenerateDoplatkova = useAppStore(
    (s) => s.closePosAndGenerateDoplatkova
  )
  const warehouseAlerts = useAppStore((s) => s.warehouseAlerts)
  const setToast = useAppStore((s) => s.setToast)

  const unlockedTier = hasFeature(subscription, 'BUSINESS')
  const [filter, setFilter] = useState<'all' | 'food' | 'beverage'>('all')
  const [cart, setCart] = useState<POSCartLine[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [terminalBusy, setTerminalBusy] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<POSTransaction | null>(null)
  const [doplatkovaPreview, setDoplatkovaPreview] = useState<string | null>(null)

  const project = active ? migrateProject(active) : null
  const posOpen = isPosUnlocked(project)

  useEffect(() => {
    if (project?.id) ensureProjectPosReady(project.id)
  }, [project?.id, ensureProjectPosReady])

  const metrics = useMemo(
    () => (project ? computePosLiveMetrics(project) : null),
    [project]
  )

  const menuItems = useMemo(() => {
    const items = project?.catering ?? []
    if (filter === 'all') return items
    return items.filter((i) => i.category === filter)
  }, [project, filter])

  const lowStock = useMemo(
    () => getLowStockItems(project?.warehouse ?? []),
    [project]
  )

  const projectAlerts = (warehouseAlerts ?? []).filter(
    (a) => a.projectId === project?.id && !a.acknowledged
  )

  const totals = cartTotals(cart)

  const addToCart = (item: CateringItem) => {
    if (!posOpen) {
      setToast('POS je zamčená — dokončete podpis a zálohu')
      return
    }
    const costPer =
      (Number(item.foodCost) || 0) /
      Math.max(1, item.plannedPortions || item.portion || 1)

    setCart((prev) => {
      const existing = prev.find((l) => l.cateringId === item.id)
      if (existing) {
        return prev.map((l) =>
          l.cateringId === item.id ? { ...l, qty: l.qty + 1 } : l
        )
      }
      return [
        ...prev,
        {
          cateringId: item.id,
          name: item.name,
          category: item.category,
          unitPrice: item.sellPrice || 0,
          qty: 1,
          vatRate: item.vatRate || 12,
          foodCostPerUnit: costPer,
        },
      ]
    })
  }

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.cateringId === id ? { ...l, qty: l.qty + delta } : l
        )
        .filter((l) => l.qty > 0)
    )
  }

  const clearCart = () => setCart([])

  const runPayment = async (method: POSPaymentMethod) => {
    if (!project || !cart.length) return

    if (method === 'card') {
      setTerminalBusy(true)
      await new Promise((r) => setTimeout(r, 1600))
      setTerminalBusy(false)
    }

    const result = completePosSale(project.id, cart, method)
    if (!result.ok) {
      setToast(result.error || 'Prodej selhal')
      return
    }

    const tx = buildLocalReceiptSnapshot(cart, method, result.receiptNumber!)
    setLastReceipt(tx)
    clearCart()
    setCheckoutOpen(false)
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

  const registry = (projects ?? []).map(migrateProject)

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }} className="pos-root">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h1 className="section-title gold-text">Event POS / Kasa</h1>
          <p className="section-sub">
            Prodejní kasa na akci · napojená na receptury, sklad a doplatkovou fakturu
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {project && posOpen && !project.posClosed && (
            <button type="button" className="btn btn-ghost" onClick={handleClosePos}>
              <FileText size={15} /> Uzavřít kasu → Doplatková faktura
            </button>
          )}
        </div>
      </div>

      {/* Event registry selector */}
      <div className="panel" style={{ marginBottom: 16 }}>
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

        {project && (
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span className={`badge ${posOpen ? 'badge-success' : project.posClosed ? 'badge-warning' : 'badge-danger'}`}>
              {posOpen
                ? 'POS ODEMČENA'
                : project.posClosed
                  ? 'KASA UZAVŘENA'
                  : 'POS ZAMČENA'}
            </span>
            <span className="badge badge-gold">{project.documents?.faktura}</span>
            {!project.clientSigned && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Čeká na podpis klienta
              </span>
            )}
            {project.clientSigned && !project.depositPaid && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Čeká na úhradu zálohy (QR Platba)
              </span>
            )}
            {!posOpen && !project.posClosed && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                onClick={() => setView('portal')}
              >
                Otevřít klientský portál
              </button>
            )}
          </div>
        )}
      </div>

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
          {/* Live metrics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <MetricCard
              label="Aktuální Obrat Kasy"
              value={formatCurrency(metrics?.currentTurnover ?? 0)}
            />
            <MetricCard
              label="Reálná Marže v %"
              value={`${(metrics?.realMarginPercent ?? 0).toFixed(1)} %`}
            />
            <MetricCard
              label="Porce vs. Plán"
              value={`${metrics?.portionsIssued ?? 0} / ${metrics?.portionsPlanned ?? 0}`}
              sub={`${(metrics?.portionsRatioPercent ?? 0).toFixed(0)} % plánu`}
            />
            <MetricCard
              label="Skladové alerty"
              value={String(lowStock.length + projectAlerts.length)}
              danger={lowStock.length > 0}
              sub={lowStock.length ? 'pod 15 % zásoby' : 'OK'}
            />
          </div>

          {(lowStock.length > 0 || projectAlerts.length > 0) && (
            <div
              className="panel"
              style={{
                marginBottom: 16,
                borderColor: 'rgba(239,68,68,0.45)',
                background: 'rgba(239,68,68,0.08)',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <motion.div
                animate={{ opacity: [1, 0.35, 1], scale: [1, 1.08, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <AlertTriangle size={22} color="#fca5a5" />
              </motion.div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Skladové varování — zásoba pod 15 %
                </div>
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
            </div>
          )}

          <div
            className="pos-layout"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 340px',
              gap: 16,
              alignItems: 'start',
            }}
          >
            {/* Menu grid */}
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {(
                  [
                    ['all', 'Vše'],
                    ['food', 'Jídlo'],
                    ['beverage', 'Nápoje'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={filter === id ? 'btn btn-gold' : 'btn btn-ghost'}
                    onClick={() => setFilter(id)}
                  >
                    {id === 'food' ? <Utensils size={14} /> : id === 'beverage' ? <Wine size={14} /> : null}
                    {label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 10,
                  opacity: posOpen ? 1 : 0.45,
                  pointerEvents: posOpen ? 'auto' : 'none',
                }}
              >
                {menuItems.map((item) => {
                  const sold = item.soldPortions || 0
                  const planned = item.plannedPortions || item.portion || 1
                  const linkedLow = lowStock.some((w) =>
                    w.linkedCateringIds.includes(item.id)
                  )
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="glass-glow"
                      onClick={() => addToCart(item)}
                      style={{
                        minHeight: 120,
                        padding: '1rem 0.85rem',
                        background: 'var(--bg-panel)',
                        border: `1px solid ${linkedLow ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                        borderRadius: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: 'inherit',
                        position: 'relative',
                        transition: 'all 0.25s',
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
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--gold)',
                          marginBottom: 6,
                        }}
                      >
                        {item.category === 'beverage' ? 'Nápoj' : item.category === 'food' ? 'Jídlo' : 'Ostatní'}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '1.05rem',
                          lineHeight: 1.25,
                          marginBottom: 8,
                          minHeight: 40,
                        }}
                      >
                        {item.name}
                      </div>
                      <div style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '1.1rem' }}>
                        {formatCurrency(item.sellPrice || 0)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
                        {sold}/{planned} porcí
                      </div>
                    </button>
                  )
                })}
                {!menuItems.length && (
                  <div
                    className="panel"
                    style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    Žádné položky menu — vygenerujte catering v AI Planneru nebo AI Vision Scan.
                  </div>
                )}
              </div>

              {!posOpen && !project.posClosed && (
                <div
                  className="panel"
                  style={{ marginTop: 16, textAlign: 'center', borderColor: 'var(--border-strong)' }}
                >
                  <Lock size={20} color="var(--gold)" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Lifecycle krok 5 — POS Kasa čeká na odemčení
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    1. Prompt → 2. AI nabídka → 3. Podpis → 4. Záloha QR →{' '}
                    <span style={{ color: 'var(--gold)' }}>5. POS</span> → 6. Doplatková faktura
                  </div>
                </div>
              )}
            </div>

            {/* Cart */}
            <div
              className="panel"
              style={{
                position: 'sticky',
                top: 16,
                borderColor: 'var(--border-strong)',
                boxShadow: 'var(--shadow-gold)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <h3 style={{ fontSize: '1.15rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ShoppingCart size={18} color="var(--gold)" /> Košík
                </h3>
                {cart.length > 0 && (
                  <button type="button" className="btn btn-ghost" style={{ padding: 6 }} onClick={clearCart}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {!cart.length && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', padding: '1rem 0' }}>
                  Klepněte na položku menu pro přidání.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {cart.map((line) => (
                  <div
                    key={line.cateringId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '0.65rem 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {line.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>
                        {formatCurrency(line.unitPrice)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: 4 }}
                        onClick={() => changeQty(line.cateringId, -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: 4 }}
                        onClick={() => changeQty(line.cateringId, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
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
                style={{ width: '100%', marginTop: 14, padding: '0.9rem', fontSize: '1rem' }}
                disabled={!cart.length || !posOpen}
                onClick={() => setCheckoutOpen(true)}
              >
                <Banknote size={16} /> Platba / Checkout
              </button>
            </div>
          </div>

          {/* Warehouse mini panel */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Živý sklad (odepisování)</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 8,
              }}
            >
              {(project.warehouse ?? []).slice(0, 12).map((w) => {
                const pct = stockPercent(w)
                const low = pct < 15
                return (
                  <div
                    key={w.id}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--bg-elevated)',
                      borderRadius: 8,
                      border: `1px solid ${low ? 'rgba(239,68,68,0.45)' : 'var(--border)'}`,
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                      {w.name}{' '}
                      {low && (
                        <AlertTriangle
                          size={12}
                          color="#fca5a5"
                          style={{ verticalAlign: 'middle' }}
                        />
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {w.currentQty.toFixed(2)} / {w.initialQty.toFixed(2)} {w.unit}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        height: 4,
                        background: 'var(--bg-deep)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: low ? '#ef4444' : 'var(--gold)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
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
            <div className="panel" style={{ marginTop: 16, whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ color: 'var(--text)' }}>Doplatková faktura</h3>
                <button type="button" className="btn btn-ghost" onClick={() => setDoplatkovaPreview(null)}>
                  <X size={14} />
                </button>
              </div>
              {doplatkovaPreview}
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => {
                    navigator.clipboard.writeText(doplatkovaPreview)
                    setToast('Doplatková faktura zkopírována')
                  }}
                >
                  Kopírovat
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {checkoutOpen && (
          <CheckoutModal
            totals={totals}
            terminalBusy={terminalBusy}
            onClose={() => !terminalBusy && setCheckoutOpen(false)}
            onPay={runPayment}
          />
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 900px) {
          .pos-layout { grid-template-columns: 1fr !important; }
        }
        @media print {
          body * { visibility: hidden !important; }
          .receipt-print, .receipt-print * { visibility: visible !important; }
          .receipt-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            background: white !important;
            color: black !important;
            padding: 4mm !important;
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
  sub,
  danger,
}: {
  label: string
  value: string
  sub?: string
  danger?: boolean
}) {
  return (
    <div
      className="panel glass-glow"
      style={{
        borderColor: danger ? 'rgba(239,68,68,0.45)' : undefined,
        padding: '1rem',
      }}
    >
      <div className="label">{label}</div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          color: danger ? '#fca5a5' : 'var(--gold)',
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  )
}

function CheckoutModal({
  totals,
  terminalBusy,
  onClose,
  onPay,
}: {
  totals: ReturnType<typeof cartTotals>
  terminalBusy: boolean
  onClose: () => void
  onPay: (m: POSPaymentMethod) => void
}) {
  return (
    <motion.div
      className="modal-overlay no-print"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
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
          <button type="button" className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose} disabled={terminalBusy}>
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
          <div className="label">K úhradě</div>
          <div className="gold-text" style={{ fontSize: '2rem', fontFamily: 'var(--font-display)' }}>
            {formatCurrency(totals.totalGross)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            DPH {formatCurrency(totals.totalVat)} · {totals.portionsIssued} porcí
          </div>
        </div>

        {terminalBusy ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-block', marginBottom: 12 }}
            >
              <CreditCard size={32} color="var(--gold)" />
            </motion.div>
            <div>Handshake s terminálem SumUp / Stripe Reader…</div>
            <div style={{ fontSize: '0.8rem', marginTop: 6 }}>Čekám na potvrzení karty</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="btn btn-gold"
              style={{ padding: '1rem', justifyContent: 'flex-start' }}
              onClick={() => onPay('card')}
            >
              <CreditCard size={18} />
              <div style={{ textAlign: 'left' }}>
                <div>Platba Kartou / Terminál</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 400 }}>
                  Simulace SumUp / Stripe Reader
                </div>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '1rem', justifyContent: 'flex-start' }}
              onClick={() => onPay('invoice')}
            >
              <FileText size={18} color="var(--gold)" />
              <div style={{ textAlign: 'left' }}>
                <div>Zapsat na celkovou fakturu</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  Připíše se k doplatkové faktuře projektu
                </div>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '1rem', justifyContent: 'flex-start' }}
              onClick={() => onPay('all_inclusive')}
            >
              <ClipboardCheck size={18} color="var(--gold)" />
              <div style={{ textAlign: 'left' }}>
                <div>Odkliknout porci / All-Inclusive</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  Bez platby — jen log výdeje kuchyně / baru
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
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div
        className="no-print"
        style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={18} color="var(--success)" />
          <h3 style={{ fontSize: '1.1rem' }}>Účtenka {tx.receiptNumber}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-gold" onClick={handlePrint}>
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
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          borderRadius: 4,
          border: '1px dashed var(--border)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{profileName}</div>
          <div>EventFlow POS · 80mm</div>
          <div style={{ marginTop: 4 }}>{project.name}</div>
        </div>
        <div style={{ borderTop: '1px dashed #999', borderBottom: '1px dashed #999', padding: '6px 0', marginBottom: 8 }}>
          <div>Účtenka: {tx.receiptNumber}</div>
          <div>{new Date(tx.timestamp).toLocaleString('cs-CZ')}</div>
          <div>{paymentMethodLabel(tx.paymentMethod)}</div>
        </div>
        {(tx.lines ?? []).map((l, i) => (
          <div key={`${l.cateringId}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ flex: 1 }}>
              {l.name} ×{l.qty}
            </span>
            <span>{(l.unitPrice * l.qty).toLocaleString('cs-CZ')}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px dashed #999', marginTop: 8, paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>DPH</span>
            <span>{tx.totalVat.toLocaleString('cs-CZ')} Kč</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, marginTop: 4 }}>
            <span>CELKEM</span>
            <span>{tx.totalGross.toLocaleString('cs-CZ')} Kč</span>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 10 }}>
          Děkujeme · EventFlow Kasa
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
    lines: lines.map((l) => ({ ...l })),
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
