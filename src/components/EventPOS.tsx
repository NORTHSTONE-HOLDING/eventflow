import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Bluetooth,
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
  ChefHat,
  Map,
  Sparkles,
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
import { formatCurrency, uid } from '../lib/documentIds'
import { POS_CATEGORIES, filterPosMenu } from '../lib/posCategories'
import {
  dispatchPrintJobs,
  pairBluetoothPrinter,
  roleLabel,
} from '../lib/printerHardware'
import { ensurePosTables } from '../lib/tableTabs'
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
} from '../types'
import { PosTableMap } from './pos/PosTableMap'
import { AdvancedCheckout, type CheckoutResult } from './pos/AdvancedCheckout'
import { CustomItemModal } from './pos/CustomItemModal'

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
  const setActiveTable = useAppStore((s) => s.setActiveTable)
  const setTableLines = useAppStore((s) => s.setTableLines)
  const addLineToActiveTable = useAppStore((s) => s.addLineToActiveTable)
  const addTable = useAppStore((s) => s.addTable)

  const unlockedTier = hasFeature(subscription || 'LITE', 'BUSINESS')

  const safePrinters = useMemo(
    () => (Array.isArray(printers) ? printers : []),
    [printers],
  )

  const [mainCat, setMainCat] = useState<'food' | 'beverage'>('food')
  const [subCat, setSubCat] = useState<POSSubcategory | 'all'>('all')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [showMap, setShowMap] = useState(true)
  const [posLocked, setPosLocked] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<POSTransaction | null>(null)
  const [doplatkovaPreview, setDoplatkovaPreview] = useState<string | null>(null)
  const [showPrinters, setShowPrinters] = useState(false)
  const [pairingRole, setPairingRole] = useState<PrinterRole | null>(null)

  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const posOpen = isPosUnlocked(project)

  const tables = useMemo(
    () => (project ? ensurePosTables(project.posTables) : []),
    [project],
  )
  const activeTableId = project?.activeTableId || tables[0]?.id || null
  const activeTable = useMemo(
    () => tables.find((t) => t.id === activeTableId) ?? tables[0] ?? null,
    [tables, activeTableId],
  )
  const cart = useMemo(() => activeTable?.lines ?? [], [activeTable])
  const tableLabel = activeTable?.label ?? 'Bar / Kasa'

  useEffect(() => {
    if (project?.id) ensureProjectPosReady(project.id)
  }, [project?.id, ensureProjectPosReady])

  useEffect(() => {
    setSubCat('all')
  }, [mainCat])

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
      phase: checkoutOpen ? 'tap_card' : cart.length ? 'cart' : 'idle',
      message: checkoutOpen
        ? 'Probíhá platba…'
        : cart.length
          ? `Účet · ${tableLabel}`
          : `Vítejte · ${tableLabel}`,
      updatedAt: new Date().toISOString(),
    })
  }, [cart, project, checkoutOpen, tableLabel])

  const metrics = useMemo(
    () => (project ? computePosLiveMetrics(project) : null),
    [project],
  )

  const menuItems = useMemo(
    () => filterPosMenu(project?.catering, mainCat, subCat),
    [project, mainCat, subCat],
  )

  const lowStock = useMemo(
    () => getLowStockItems(project?.warehouse ?? []),
    [project],
  )

  const projectAlerts = (warehouseAlerts ?? []).filter(
    (a) => a.projectId === project?.id && !a.acknowledged,
  )

  const totals = cartTotals(cart ?? [])
  const currentSubs = POS_CATEGORIES.find((c) => c.id === mainCat)?.subs ?? []

  const addToCart = (item: CateringItem) => {
    if (!project || !posOpen || posLocked) {
      setToast('POS je zamčená — dokončete podpis a zálohu')
      return
    }
    const planned = Math.max(1, item.plannedPortions || item.portion || 1)
    const costPer = (Number(item.foodCost) || 0) / planned
    addLineToActiveTable(project.id, {
      cateringId: item.id,
      name: item.name,
      category: item.category,
      subcategory: item.subcategory || 'ostatni',
      unitPrice: Number(item.sellPrice) || 0,
      qty: 1,
      vatRate: Number(item.vatRate) || 12,
      foodCostPerUnit: costPer,
      lineId: uid('line'),
    })
  }

  const changeQty = (line: POSCartLine, delta: number) => {
    if (!project || !activeTable || posLocked) return
    const next = (activeTable.lines ?? [])
      .map((l) => {
        const match = line.lineId
          ? l.lineId === line.lineId
          : !l.isCustom && l.cateringId === line.cateringId && !line.isCustom
        return match ? { ...l, qty: l.qty + delta } : l
      })
      .filter((l) => l.qty > 0)
    setTableLines(project.id, activeTable.id, next)
  }

  const clearCart = () => {
    if (!project || !activeTable || posLocked) return
    setTableLines(project.id, activeTable.id, [])
  }

  const handleAddCustom = (line: POSCartLine) => {
    if (!project || !posOpen || posLocked) {
      setToast('POS je zamčená — dokončete podpis a zálohu')
      return
    }
    addLineToActiveTable(project.id, line)
    setToast(`Volná položka na ${tableLabel}: ${line.name}`)
  }

  const finalizeSale = useCallback(
    (result: CheckoutResult) => {
      if (!project || !activeTable) return null
      const payLines = result.lines ?? []
      if (!payLines.length) {
        setToast('Vyberte položky k úhradě')
        return null
      }

      const sale = completePosSale(project.id, payLines, result.method, {
        tableLabel: activeTable.label,
        tableId: activeTable.id,
        clearFromTable: true,
        cashAmount: result.cashAmount,
        cardAmount: result.cardAmount,
        changeGiven: result.changeGiven,
      })

      if (!sale.ok) {
        setToast(sale.error || 'Prodej selhal')
        return null
      }

      const receiptNumber = sale.receiptNumber || 'UC'
      const payTotals = cartTotals(payLines)
      const printCustomer =
        result.method === 'card' ||
        result.method === 'invoice' ||
        result.method === 'cash' ||
        result.method === 'combined'

      dispatchPrintJobs({
        printers: safePrinters,
        projectName: project.name,
        receiptNumber,
        tableLabel: activeTable.label,
        lines: payLines,
        companyName: profile.companyName || 'EventFlow',
        totalGross: result.method === 'all_inclusive' ? 0 : payTotals.totalGross,
        totalVat: result.method === 'all_inclusive' ? 0 : payTotals.totalVat,
        paymentLabel: paymentMethodLabel(result.method),
        printCustomerReceipt: printCustomer,
      })

      const tx = buildLocalReceiptSnapshot(payLines, result.method, receiptNumber, {
        cashAmount: result.cashAmount,
        cardAmount: result.cardAmount,
        changeGiven: result.changeGiven,
        tableId: activeTable.id,
        tableLabel: activeTable.label,
      })
      setLastReceipt(tx)
      setCheckoutOpen(false)
      setPosLocked(false)

      publishCustomerDisplay({
        projectName: project.name,
        lines: [],
        total: result.method === 'all_inclusive' ? 0 : payTotals.totalGross,
        phase: 'approved',
        message:
          result.method === 'cash' && result.changeGiven
            ? `Hotovost OK · vrátit ${result.changeGiven.toLocaleString('cs-CZ')} Kč`
            : 'Platba schválena — děkujeme',
        updatedAt: new Date().toISOString(),
      })

      return sale
    },
    [
      project,
      activeTable,
      completePosSale,
      safePrinters,
      profile.companyName,
      setToast,
    ],
  )

  const handleCheckoutComplete = async (result: CheckoutResult) => {
    setPosLocked(true)
    try {
      if (result.method === 'card' || result.method === 'combined') {
        publishCustomerDisplay({
          projectName: project?.name || 'EventFlow',
          lines: (result.lines ?? []).map((l) => ({
            name: l.name,
            qty: l.qty,
            price: l.unitPrice * l.qty,
          })),
          total: cartTotals(result.lines ?? []).totalGross,
          phase: 'approved',
          message: 'Platba kartou schválena',
          updatedAt: new Date().toISOString(),
        })
      }
      finalizeSale(result)
    } finally {
      setPosLocked(false)
    }
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
            Mapa stolů · otevřené účty · rozdělení plateb · volný prodej · terminál
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={showMap ? 'btn btn-gold' : 'btn btn-ghost'}
            onClick={() => setShowMap((v) => !v)}
          >
            <Map size={15} /> {showMap ? 'Skrýt mapu stolů' : 'Mapa Stolů'}
          </button>
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
        <div>
          <label className="label">Aktivní akce z registru</label>
          <select
            className="select"
            value={project?.id || ''}
            onChange={(e) => {
              setActiveProject(e.target.value || null)
              setLastReceipt(null)
              setCheckoutOpen(false)
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

        {project && (
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span
              className={`badge ${posOpen ? 'badge-success' : project.posClosed ? 'badge-warning' : 'badge-danger'}`}
            >
              {posOpen ? 'POS ODEMČENA' : project.posClosed ? 'KASA UZAVŘENA' : 'POS ZAMČENA'}
            </span>
            <span className="badge badge-gold">{project.documents?.faktura}</span>
            <span className="badge badge-gold">Aktivní: {tableLabel}</span>
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

      {project && showMap && activeTableId && (
        <PosTableMap
          tables={tables}
          activeTableId={activeTableId}
          onSelect={(id) => {
            setActiveTable(project.id, id)
            setCheckoutOpen(false)
          }}
          onAddTable={() => addTable(project.id, `Stůl ${tables.length + 1}`)}
        />
      )}

      {showPrinters && (
        <PrinterConfigPanel
          printers={safePrinters}
          pairingRole={pairingRole}
          onPair={handlePairPrinter}
          onClose={() => setShowPrinters(false)}
        />
      )}

      {!project && (
        <div
          className="panel"
          style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}
        >
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
              <motion.div
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              >
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
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
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
              <button
                type="button"
                className="btn btn-gold"
                style={{ flexShrink: 0, minHeight: 44 }}
                disabled={!posOpen || posLocked}
                onClick={() => setCustomOpen(true)}
              >
                <Sparkles size={15} /> ➕ Volná položka / Rychlý prodej
              </button>
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
                  (w.linkedCateringIds ?? []).includes(item.id),
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
                  <ShoppingCart size={16} color="var(--gold)" /> Účet · {tableLabel}
                </h3>
                {cart.length > 0 && !posLocked && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: 6 }}
                    onClick={clearCart}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 8 }}>
                Položky zůstávají na stole do finální platby — můžete se vrátit na dashboard.
              </p>

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
                  POS uzamčena — probíhá platba
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {(cart ?? []).map((line, idx) => (
                  <div
                    key={line.lineId || `${line.cateringId}_${idx}`}
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
                        {line.isCustom ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: '0.65rem',
                              color: 'var(--gold)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            Volná
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--gold)' }}>
                        {formatCurrency(line.unitPrice)} · DPH {line.vatRate}%
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: 4, minWidth: 36, minHeight: 36 }}
                        disabled={posLocked}
                        onClick={() => changeQty(line, -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 600 }}>
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: 4, minWidth: 36, minHeight: 36 }}
                        disabled={posLocked}
                        onClick={() => changeQty(line, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {!cart.length && (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', padding: '1rem 0' }}>
                    Klepněte na položku menu nebo přidejte volný prodej.
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
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '0.9rem',
                  fontSize: '1rem',
                  minHeight: 48,
                }}
                disabled={!cart.length || !posOpen || posLocked}
                onClick={() => setCheckoutOpen(true)}
              >
                <Banknote size={16} /> Platba / Rozdělení účtu
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
            <div
              className="panel"
              style={{
                marginTop: 14,
                whiteSpace: 'pre-wrap',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <h3 style={{ color: 'var(--text)' }}>Doplatková faktura</h3>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setDoplatkovaPreview(null)}
                >
                  <X size={14} />
                </button>
              </div>
              {doplatkovaPreview}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {checkoutOpen && activeTable && (
          <AdvancedCheckout
            open={checkoutOpen}
            tableLines={cart}
            tableLabel={activeTable.label}
            onClose={() => {
              if (!posLocked) setCheckoutOpen(false)
            }}
            onComplete={handleCheckoutComplete}
          />
        )}
      </AnimatePresence>

      <CustomItemModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onAdd={handleAddCustom}
      />

      <style>{`
        @media (max-width: 900px) {
          .pos-layout { grid-template-columns: 1fr !important; }
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
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
        Volné položky jdou pouze na Tiskárnu Účtenky.
      </p>
    </div>
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
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 8,
        }}
      >
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
          {tx.tableLabel ? <div>{tx.tableLabel}</div> : null}
        </div>
        <div>{tx.receiptNumber}</div>
        <div>{new Date(tx.timestamp).toLocaleString('cs-CZ')}</div>
        <div>{paymentMethodLabel(tx.paymentMethod)}</div>
        <hr />
        {(tx.lines ?? []).map((l, i) => (
          <div
            key={`${l.lineId || l.cateringId}-${i}`}
            style={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>
              {l.name} ×{l.qty}
            </span>
            <span>{(l.unitPrice * l.qty).toLocaleString('cs-CZ')}</span>
          </div>
        ))}
        <hr />
        {tx.paymentMethod === 'cash' && tx.changeGiven != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Vráceno</span>
            <span>{tx.changeGiven.toLocaleString('cs-CZ')} Kč</span>
          </div>
        )}
        {tx.paymentMethod === 'combined' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Hotovost</span>
              <span>{(tx.cashAmount ?? 0).toLocaleString('cs-CZ')} Kč</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Karta</span>
              <span>{(tx.cardAmount ?? 0).toLocaleString('cs-CZ')} Kč</span>
            </div>
          </>
        )}
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
  receiptNumber: string,
  extras?: {
    cashAmount?: number
    cardAmount?: number
    changeGiven?: number
    tableId?: string
    tableLabel?: string
  },
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
    cashAmount: extras?.cashAmount,
    cardAmount: extras?.cardAmount,
    changeGiven: extras?.changeGiven,
    tableId: extras?.tableId,
    tableLabel: extras?.tableLabel,
  }
}
