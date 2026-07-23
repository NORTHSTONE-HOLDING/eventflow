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
  Bell,
  Send,
  UserRound,
} from 'lucide-react'
import {
  useAppStore,
  selectActiveProject,
  migrateProject,
  isPosUnlocked,
} from '../store/useAppStore'
import { useInventoryStore } from '../store/useInventoryStore'
import { usePosSessionStore } from '../store/usePosSessionStore'
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
import { ensurePosTables, resolveActiveTableId } from '../lib/tableTabs'
import {
  emptyCustomerDisplay,
  getPosChannel,
  openPosDisplayWindow,
  publishCustomerDisplay,
  type PosBroadcastMessage,
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

export type EventPosMode = 'admin' | 'staff'

interface EventPOSProps {
  /** staff = isolated /pos-terminal (no analytics, subscriptions chrome, warehouse admin) */
  mode?: EventPosMode
}

export function EventPOS({ mode = 'admin' }: EventPOSProps) {
  const staffMode = mode === 'staff'
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
  const sendTableOrderToKds = useAppStore((s) => s.sendTableOrderToKds)
  const syncRecipesFromProjects = useInventoryStore((s) => s.syncRecipesFromProjects)
  const bootstrapInventory = useInventoryStore((s) => s.bootstrap)

  const activeWaiterId = usePosSessionStore((s) => s.activeWaiterId)
  const waiters = usePosSessionStore((s) => s.waiters)
  const setActiveWaiter = usePosSessionStore((s) => s.setActiveWaiter)
  const getActiveWaiter = usePosSessionStore((s) => s.getActiveWaiter)
  const getWorkspaceTableId = usePosSessionStore((s) => s.getWorkspaceTableId)
  const setWorkspaceTableId = usePosSessionStore((s) => s.setWorkspaceTableId)
  const readyAlerts = usePosSessionStore((s) => s.readyAlerts)
  const pushReadyAlert = usePosSessionStore((s) => s.pushReadyAlert)
  const dismissReadyAlert = usePosSessionStore((s) => s.dismissReadyAlert)

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
  const [flashReady, setFlashReady] = useState<string | null>(null)

  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const posOpen = isPosUnlocked(project)
  const activeWaiter = getActiveWaiter()

  const tables = useMemo(
    () => (project ? ensurePosTables(project.posTables) : []),
    [project],
  )

  // Device/waiter workspace table — never trust orphaned project.activeTableId alone
  const activeTableId = useMemo(() => {
    const fromWaiter = getWorkspaceTableId()
    return resolveActiveTableId(tables, fromWaiter || project?.activeTableId)
  }, [tables, project?.activeTableId, getWorkspaceTableId, activeWaiterId])

  const activeTable = useMemo(
    () => tables.find((t) => t.id === activeTableId) ?? tables[0] ?? null,
    [tables, activeTableId],
  )
  const cart = useMemo(() => activeTable?.lines ?? [], [activeTable])
  const tableLabel = activeTable?.label ?? 'Bar / Kasa'
  const pendingKdsCount = useMemo(
    () => (cart ?? []).filter((l) => !l.sentToKds).length,
    [cart],
  )

  const myReadyAlerts = useMemo(
    () =>
      (readyAlerts ?? []).filter(
        (a) => !a.seen && (!a.waiterId || a.waiterId === activeWaiterId)
      ),
    [readyAlerts, activeWaiterId],
  )

  useEffect(() => {
    if (project?.id) ensureProjectPosReady(project.id)
  }, [project?.id, ensureProjectPosReady])

  useEffect(() => {
    void bootstrapInventory().then(() => {
      if (project) void syncRecipesFromProjects([project])
    })
  }, [bootstrapInventory, syncRecipesFromProjects, project])

  // Keep waiter workspace ↔ project table in sync (fix orphaned IDs)
  useEffect(() => {
    if (!project?.id || !activeTableId) return
    if (project.activeTableId !== activeTableId) {
      setActiveTable(project.id, activeTableId)
    }
    if (getWorkspaceTableId() !== activeTableId) {
      setWorkspaceTableId(activeTableId)
    }
  }, [
    project?.id,
    project?.activeTableId,
    activeTableId,
    setActiveTable,
    getWorkspaceTableId,
    setWorkspaceTableId,
  ])

  // Live KDS → waiter notifications
  useEffect(() => {
    const ch = getPosChannel()
    if (!ch) return
    const onMsg = (ev: MessageEvent<PosBroadcastMessage>) => {
      if (ev.data?.type !== 'waiter_ready' || !ev.data.payload) return
      const payload = ev.data.payload
      if (payload.waiterId && payload.waiterId !== activeWaiterId) return
      pushReadyAlert({
        ticketId: payload.ticketId,
        orderNumber: payload.orderNumber,
        tableLabel: payload.tableLabel,
        station: payload.station,
        waiterId: payload.waiterId || activeWaiterId,
        message: payload.message,
      })
      setFlashReady(payload.message)
      setToast(payload.message)
      window.setTimeout(() => setFlashReady(null), 8000)
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('EventFlow POS', { body: payload.message })
        }
      } catch {
        // ignore
      }
    }
    ch.addEventListener('message', onMsg)
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'eventflow-waiter-ready' || !e.newValue) return
      try {
        const payload = JSON.parse(e.newValue) as {
          ticketId: string
          orderNumber: string
          tableLabel: string
          station: 'kitchen' | 'bar'
          waiterId: string
          message: string
        }
        if (payload.waiterId && payload.waiterId !== activeWaiterId) return
        pushReadyAlert({
          ticketId: payload.ticketId,
          orderNumber: payload.orderNumber,
          tableLabel: payload.tableLabel,
          station: payload.station,
          waiterId: payload.waiterId || activeWaiterId,
          message: payload.message,
        })
        setFlashReady(payload.message)
        setToast(payload.message)
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      ch.removeEventListener('message', onMsg)
      window.removeEventListener('storage', onStorage)
    }
  }, [activeWaiterId, pushReadyAlert, setToast])

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
    if (!activeTableId) {
      setToast('Nejdříve vyberte stůl na mapě stolů')
      return
    }
    const planned = Math.max(1, item.plannedPortions || item.portion || 1)
    const costPer = (Number(item.foodCost) || 0) / planned
    addLineToActiveTable(
      project.id,
      {
        cateringId: item.id,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory || 'ostatni',
        unitPrice: Number(item.sellPrice) || 0,
        qty: 1,
        vatRate: Number(item.vatRate) || 12,
        foodCostPerUnit: costPer,
        lineId: uid('line'),
        waiterId: activeWaiter.id,
        waiterName: activeWaiter.name,
        sentToKds: false,
      },
      {
        tableId: activeTableId,
        waiterId: activeWaiter.id,
        waiterName: activeWaiter.name,
      }
    )
  }

  const changeQty = (line: POSCartLine, delta: number) => {
    if (!project || !activeTable || posLocked) return
    const next = (activeTable.lines ?? [])
      .map((l) => {
        const match = line.lineId
          ? l.lineId === line.lineId
          : !l.isCustom && l.cateringId === line.cateringId && !line.isCustom
        return match ? { ...l, qty: l.qty + delta, sentToKds: false } : l
      })
      .filter((l) => l.qty > 0)
    setTableLines(project.id, activeTable.id, next)
    setWorkspaceTableId(activeTable.id)
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
    if (!activeTableId) {
      setToast('Nejdříve vyberte stůl na mapě stolů')
      return
    }
    addLineToActiveTable(
      project.id,
      {
        ...line,
        waiterId: activeWaiter.id,
        waiterName: activeWaiter.name,
        sentToKds: false,
      },
      {
        tableId: activeTableId,
        waiterId: activeWaiter.id,
        waiterName: activeWaiter.name,
      }
    )
    setToast(`Volná položka na ${tableLabel}: ${line.name}`)
  }

  const handleSendToKds = () => {
    if (!project || !activeTable) return
    const res = sendTableOrderToKds({
      projectId: project.id,
      tableId: activeTable.id,
      waiterId: activeWaiter.id,
      waiterName: activeWaiter.name,
    })
    if (!res.ok) setToast(res.error || 'Odeslání na KDS selhalo')
  }

  const selectTable = (tableId: string) => {
    if (!project) return
    setWorkspaceTableId(tableId)
    setActiveTable(project.id, tableId)
    setCheckoutOpen(false)
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
        waiterId: activeWaiter.id,
        waiterName: activeWaiter.name,
        skipKds: payLines.every((l) => l.sentToKds),
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
      activeWaiter.id,
      activeWaiter.name,
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

  if (!unlockedTier && !staffMode) {
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
    <div style={{ animation: 'fadeUp 0.4s ease', touchAction: 'manipulation' }} className="pos-root">
      {flashReady && (
        <div
          className="pos-ready-flash"
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3000,
            maxWidth: 'min(92vw, 640px)',
            width: '100%',
            padding: '1rem 1.25rem',
            borderRadius: 14,
            background: '#D4AF37',
            color: '#0b0f14',
            fontWeight: 900,
            fontSize: '1.05rem',
            boxShadow: '0 12px 40px rgba(212,175,55,0.45)',
            textAlign: 'center',
            border: '2px solid #fff',
          }}
        >
          {flashReady}
        </div>
      )}

      {!staffMode && (
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
              Dotyková kasa · multi-číšník · KDS notifikace · stoly
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={showMap ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setShowMap((v) => !v)} style={{ minHeight: 48 }}>
              <Map size={15} /> {showMap ? 'Skrýt mapu stolů' : 'Mapa Stolů'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowPrinters((v) => !v)} style={{ minHeight: 48 }}>
              <Settings2 size={15} /> Tiskárny
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => openPosDisplayWindow('/pos/customer', 1)} style={{ minHeight: 48 }}>
              <Monitor size={15} /> Zákaznický display
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => openPosDisplayWindow('/pos/kds/kitchen', 2)} style={{ minHeight: 48 }}>
              <ChefHat size={15} /> Displej KUCHYŇ
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => openPosDisplayWindow('/pos/kds/bar', 2)} style={{ minHeight: 48 }}>
              <Wine size={15} /> Displej BAR
            </button>
            {project && posOpen && !project.posClosed && (
              <button type="button" className="btn btn-ghost" onClick={handleClosePos} style={{ minHeight: 48 }}>
                <FileText size={15} /> Uzavřít kasu
              </button>
            )}
          </div>
        </div>
      )}

      {staffMode && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button type="button" className={showMap ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setShowMap((v) => !v)} style={{ minHeight: 48 }}>
            <Map size={15} /> {showMap ? 'Skrýt mapu stolů' : 'Mapa Stolů'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => openPosDisplayWindow('/pos/kds/kitchen', 2)} style={{ minHeight: 48 }}>
            <ChefHat size={15} /> Displej KUCHYŇ
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => openPosDisplayWindow('/pos/kds/bar', 2)} style={{ minHeight: 48 }}>
            <Wine size={15} /> Displej BAR
          </button>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14, borderColor: 'var(--border-strong)', background: staffMode ? '#0f172a' : undefined }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: staffMode ? '1fr' : '1.2fr 1fr',
            gap: 12,
            alignItems: 'end',
          }}
          className="pos-select-row"
        >
          {!staffMode && (
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
                style={{ minHeight: 48 }}
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
          )}
          <div>
            <label className="label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <UserRound size={13} color="#D4AF37" /> Přihlášený Číšník
            </label>
            <select
              className="select"
              value={activeWaiterId}
              onChange={(e) => setActiveWaiter(e.target.value)}
              style={{
                minHeight: 52,
                borderColor: activeWaiter.color,
                boxShadow: `0 0 0 1px ${activeWaiter.color}55`,
                fontWeight: 800,
                background: '#1e293b',
                color: '#fff',
                touchAction: 'manipulation',
              }}
            >
              {waiters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.role}
                </option>
              ))}
            </select>
          </div>
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
            {!staffMode && (
              <span
                className={`badge ${posOpen ? 'badge-success' : project.posClosed ? 'badge-warning' : 'badge-danger'}`}
              >
                {posOpen ? 'POS ODEMČENA' : project.posClosed ? 'KASA UZAVŘENA' : 'POS ZAMČENA'}
              </span>
            )}
            <span className="badge badge-gold">Aktivní: {tableLabel}</span>
            <span className="badge badge-gold">Číšník: {activeWaiter.name}</span>
            {myReadyAlerts.length > 0 && (
              <span className="badge badge-warning" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <Bell size={12} /> {myReadyAlerts.length} připraveno k odnesení
              </span>
            )}
            {!staffMode && !posOpen && !project.posClosed && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', minHeight: 44 }}
                onClick={() => setView('portal')}
              >
                Otevřít klientský portál
              </button>
            )}
          </div>
        )}
      </div>

      {myReadyAlerts.length > 0 && (
        <div
          className="panel"
          style={{
            marginBottom: 14,
            borderColor: '#D4AF37',
            background: 'rgba(212,175,55,0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 900, color: '#D4AF37', fontSize: '0.95rem' }}>
            ⚠️ Připraveno k odnesení ({myReadyAlerts.length})
          </div>
          {myReadyAlerts.slice(0, 5).map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>{a.message}</div>
              <button
                type="button"
                className="btn btn-gold"
                style={{ minHeight: 44, touchAction: 'manipulation' }}
                onClick={() => dismissReadyAlert(a.id)}
              >
                Potvrdit odnesení
              </button>
            </div>
          ))}
        </div>
      )}

      {project && showMap && activeTableId && (
        <PosTableMap
          tables={tables}
          activeTableId={activeTableId}
          onSelect={selectTable}
          onAddTable={() => {
            const id = addTable(project.id, `Stůl ${tables.length + 1}`)
            if (id) selectTable(id)
          }}
        />
      )}

      {!staffMode && showPrinters && (
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
          {staffMode
            ? 'Terminál čeká na aktivní akci — manažer musí vybrat zakázku v Admin Dashboardu.'
            : 'Vyberte aktivní akci z registru, nebo vytvořte novou v AI Planneru.'}
          {!staffMode && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-gold" onClick={() => setView('planner')}>
                AI Planner
              </button>
            </div>
          )}
        </div>
      )}

      {project && (
        <>
          {!staffMode && (
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
          )}

          {!staffMode && (lowStock.length > 0 || projectAlerts.length > 0) && (
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
              className="pos-menu-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                gap: 12,
                opacity: posOpen && !posLocked ? 1 : 0.45,
                pointerEvents: posOpen && !posLocked ? 'auto' : 'none',
                maxHeight: '62vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 8,
                touchAction: 'manipulation',
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
                    onClick={() => addToCart(item)}
                    className="pos-item-card"
                    style={{
                      minHeight: 128,
                      minWidth: 44,
                      padding: '1rem 0.85rem',
                      background: '#1e293b',
                      border: `1px solid ${linkedLow ? 'rgba(239,68,68,0.65)' : '#334155'}`,
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: '#fff',
                      position: 'relative',
                      touchAction: 'manipulation',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
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
                        letterSpacing: '0.08em',
                        color: '#94a3b8',
                        marginBottom: 6,
                        fontWeight: 700,
                      }}
                    >
                      {item.subcategory || item.category}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.05rem',
                        lineHeight: 1.25,
                        marginBottom: 10,
                        minHeight: 44,
                        color: '#ffffff',
                        fontWeight: 800,
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        color: '#D4AF37',
                        fontWeight: 900,
                        fontSize: '1.15rem',
                      }}
                    >
                      {formatCurrency(item.sellPrice || 0)}
                    </div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: '#64748b',
                        marginTop: 6,
                        fontWeight: 600,
                      }}
                    >
                      {sold}/{planned} porcí
                    </div>
                  </button>
                )
              })}
              {!menuItems.length && (
                <div
                  className="panel"
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    color: '#94a3b8',
                    background: '#1e293b',
                    border: '1px solid #334155',
                  }}
                >
                  Žádné položky v této podkategorii.
                </div>
              )}
            </div>

            <div
              className="panel pos-cart-panel"
              style={{
                position: 'sticky',
                top: 12,
                borderColor: '#334155',
                background: 'rgba(15, 23, 42, 0.95)',
                boxShadow: '0 0 28px rgba(212,175,55,0.12)',
                touchAction: 'manipulation',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <h3
                  style={{
                    fontSize: '1.15rem',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    color: '#fff',
                    fontWeight: 800,
                  }}
                >
                  <ShoppingCart size={16} color="#D4AF37" /> Účet · {tableLabel}
                </h3>
                {cart.length > 0 && !posLocked && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: 8, minHeight: 44, minWidth: 44, touchAction: 'manipulation' }}
                    onClick={clearCart}
                    aria-label="Vymazat účet"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
                Číšník: {activeWaiter.name} · položky zůstávají na stole do platby
              </p>

              {posLocked && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: '0.65rem',
                    background: 'rgba(212,175,55,0.12)',
                    borderRadius: 8,
                    border: '1px solid #D4AF37',
                    fontSize: '0.85rem',
                    color: '#D4AF37',
                    fontWeight: 700,
                  }}
                >
                  POS uzamčena — probíhá platba
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 280,
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {(cart ?? []).map((line, idx) => (
                  <div
                    key={line.lineId || `${line.cateringId}_${idx}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '0.75rem',
                      borderRadius: 12,
                      background: '#1e293b',
                      border: '1px solid #334155',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.95rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: '#fff',
                          fontWeight: 800,
                        }}
                      >
                        {line.name}
                        {line.isCustom ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: '0.65rem',
                              color: '#D4AF37',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            Volná
                          </span>
                        ) : null}
                        {line.sentToKds ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: '0.65rem',
                              color: '#34d399',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            KDS ✓
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#D4AF37', fontWeight: 700 }}>
                        {formatCurrency(line.unitPrice)} · DPH {line.vatRate}%
                        {line.waiterName ? ` · ${line.waiterName}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          padding: 4,
                          minWidth: 44,
                          minHeight: 44,
                          touchAction: 'manipulation',
                          background: '#0f172a',
                          border: '1px solid #475569',
                        }}
                        disabled={posLocked}
                        onClick={() => changeQty(line, -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span
                        style={{
                          minWidth: 24,
                          textAlign: 'center',
                          fontWeight: 900,
                          color: '#fff',
                          fontSize: '1.05rem',
                        }}
                      >
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          padding: 4,
                          minWidth: 44,
                          minHeight: 44,
                          touchAction: 'manipulation',
                          background: '#0f172a',
                          border: '1px solid #475569',
                        }}
                        disabled={posLocked}
                        onClick={() => changeQty(line, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {!cart.length && (
                  <div
                    style={{
                      color: '#94a3b8',
                      fontSize: '0.9rem',
                      padding: '1.25rem 0.75rem',
                      textAlign: 'center',
                      border: '1px dashed #475569',
                      borderRadius: 12,
                      background: '#1e293b',
                      fontWeight: 600,
                    }}
                  >
                    Klepněte na položku menu — ihned se přidá do účtu stolu.
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  color: '#fff',
                }}
              >
                <span>Celkem</span>
                <span style={{ color: '#D4AF37' }}>{formatCurrency(totals.totalGross)}</span>
              </div>

              {pendingKdsCount > 0 && (
                <button
                  type="button"
                  onClick={handleSendToKds}
                  disabled={!posOpen || posLocked}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    padding: '0.95rem 1rem',
                    minHeight: 52,
                    borderRadius: 12,
                    border: '2px solid #f59e0b',
                    background: 'rgba(245,158,11,0.18)',
                    color: '#fbbf24',
                    fontWeight: 900,
                    fontSize: '1rem',
                    touchAction: 'manipulation',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Send size={18} /> Odeslat na KDS ({pendingKdsCount})
                </button>
              )}

              <button
                type="button"
                className="pos-checkout-btn"
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '1rem',
                  fontSize: '1.25rem',
                  minHeight: 56,
                  borderRadius: 12,
                  border: 'none',
                  background: '#D4AF37',
                  color: '#0b0f14',
                  fontWeight: 900,
                  boxShadow: '0 10px 28px rgba(212,175,55,0.4)',
                  touchAction: 'manipulation',
                  cursor: !cart.length || !posOpen || posLocked ? 'not-allowed' : 'pointer',
                  opacity: !cart.length || !posOpen || posLocked ? 0.4 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                }}
                disabled={!cart.length || !posOpen || posLocked}
                onClick={() => setCheckoutOpen(true)}
              >
                <Banknote size={20} /> Zaplatit / Rozdělit účet
              </button>
            </div>
          </div>

          {!staffMode && lastReceipt && (
            <ReceiptPanel
              tx={lastReceipt}
              project={project}
              profileName={profile.companyName || 'EventFlow'}
              onClose={() => setLastReceipt(null)}
            />
          )}

          {!staffMode && doplatkovaPreview && (
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
        .pos-root,
        .pos-root button,
        .pos-item-card,
        .pos-checkout-btn {
          touch-action: manipulation;
          -webkit-tap-highlight-color: rgba(212, 175, 55, 0.25);
        }
        .pos-item-card:active {
          transform: scale(0.98);
          border-color: #D4AF37 !important;
        }
        .pos-checkout-btn:not(:disabled):active {
          transform: scale(0.99);
          box-shadow: 0 6px 18px rgba(212,175,55,0.55) !important;
        }
        @media (max-width: 900px) {
          .pos-layout { grid-template-columns: 1fr !important; }
          .pos-cart-panel { position: relative !important; top: 0 !important; }
          .pos-menu-grid { max-height: none !important; }
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
