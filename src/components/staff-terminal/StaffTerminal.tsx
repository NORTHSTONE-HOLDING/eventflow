import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  ChefHat,
  Flag,
  Map as MapIcon,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  Utensils,
  Wine,
  Zap,
  UserRound,
} from 'lucide-react'
import {
  migrateProject,
  selectActiveProject,
  useAppStore,
} from '../../store/useAppStore'
import { useInventoryStore } from '../../store/useInventoryStore'
import { usePosSessionStore } from '../../store/usePosSessionStore'
import { usePosSpaceStore } from '../../store/usePosSpaceStore'
import { useCctvStore } from '../../store/useCctvStore'
import { useDailySpecialStore } from '../../store/useDailySpecialStore'
import { useProductImageStore, productNameKey } from '../../store/useProductImageStore'
import { PosProductTile } from '../pos/PosProductTile'
import { AdvancedCheckout, type CheckoutResult } from '../pos/AdvancedCheckout'
import { ShiftClosureModal } from './ShiftClosureModal'
import { PosShiftExpressInput } from '../pos/PosShiftExpressInput'
import { POS_CATEGORIES, filterPosMenu } from '../../lib/posCategories'
import { buildVenueMasterCatalog, mergeCatalogs } from '../../lib/venueCatalog'
import { mergeHybridPosCatalog } from '../../lib/inventoryPosBridge'
import {
  ensurePosTables,
  resolveActiveTableId,
  tableOpenTotal,
  tablesInSpace,
} from '../../lib/tableTabs'
import { cartTotals, paymentMethodLabel } from '../../lib/posEngine'
import { formatCurrency, uid } from '../../lib/documentIds'
import { dispatchPrintJobs } from '../../lib/printerHardware'
import {
  getPosChannel,
  openPosDisplayWindow,
  type PosBroadcastMessage,
} from '../../lib/kdsSync'
import { tapFeedback } from '../../lib/touchFeedback'
import type { CateringItem, POSCartLine, POSSubcategory, PosTableTab } from '../../types'

/**
 * Ground-up Staff Terminal — 3-zone touch POS for /pos-terminal.
 * Left: spaces + tables · Center: catalog · Right: locked cart
 */
export function StaffTerminal() {
  const activeRaw = useAppStore(selectActiveProject)
  const setToast = useAppStore((s) => s.setToast)
  const profile = useAppStore((s) => s.profile)
  const printers = useAppStore((s) => s.printers)
  const addLineToActiveTable = useAppStore((s) => s.addLineToActiveTable)
  const setTableLines = useAppStore((s) => s.setTableLines)
  const setActiveTable = useAppStore((s) => s.setActiveTable)
  const addTable = useAppStore((s) => s.addTable)
  const removeTable = useAppStore((s) => s.removeTable)
  const sendTableOrderToKds = useAppStore((s) => s.sendTableOrderToKds)
  const completePosSale = useAppStore((s) => s.completePosSale)
  const ensureProjectPosReady = useAppStore((s) => s.ensureProjectPosReady)

  const inventoryItems = useInventoryStore((s) => s.items)
  const bootstrapInventory = useInventoryStore((s) => s.bootstrap)
  const getActiveSpecials = useDailySpecialStore((s) => s.getActiveSpecials)
  const purgeExpired = useDailySpecialStore((s) => s.purgeExpired)
  const imageByKey = useProductImageStore((s) => s.byKey)
  const ensureAiImage = useProductImageStore((s) => s.ensureAiImage)

  const waiters = usePosSessionStore((s) => s.waiters)
  const activeWaiterId = usePosSessionStore((s) => s.activeWaiterId)
  const setActiveWaiter = usePosSessionStore((s) => s.setActiveWaiter)
  const getActiveWaiter = usePosSessionStore((s) => s.getActiveWaiter)
  const getWorkspaceTableId = usePosSessionStore((s) => s.getWorkspaceTableId)
  const setWorkspaceTableId = usePosSessionStore((s) => s.setWorkspaceTableId)
  const readyAlerts = usePosSessionStore((s) => s.readyAlerts)
  const pushReadyAlert = usePosSessionStore((s) => s.pushReadyAlert)
  const dismissReadyAlert = usePosSessionStore((s) => s.dismissReadyAlert)
  const securityAlerts = usePosSessionStore((s) => s.securityAlerts)
  const pushSecurityAlert = usePosSessionStore((s) => s.pushSecurityAlert)
  const dismissSecurityAlert = usePosSessionStore((s) => s.dismissSecurityAlert)

  const spaces = usePosSpaceStore((s) => s.spaces)
  const activeSpaceId = usePosSpaceStore((s) => s.activeSpaceId)
  const setActiveSpace = usePosSpaceStore((s) => s.setActiveSpace)
  const addSpace = usePosSpaceStore((s) => s.addSpace)
  const getSpaceName = usePosSpaceStore((s) => s.getSpaceName)
  const cctvGlobalAlert = useCctvStore((s) => s.globalAlert)
  const resolveCctvAlert = useCctvStore((s) => s.resolveGlobalAlert)

  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const waiter = getActiveWaiter()

  const [mainCat, setMainCat] = useState<'food' | 'beverage'>('food')
  const [subCat, setSubCat] = useState<POSSubcategory | 'all'>('all')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [quickSale, setQuickSale] = useState(false)
  const [quickLines, setQuickLines] = useState<POSCartLine[]>([])
  const [closureOpen, setClosureOpen] = useState(false)
  const [showShifts, setShowShifts] = useState(false)
  const [flashReady, setFlashReady] = useState<string | null>(null)
  const [emergency, setEmergency] = useState<string | null>(null)

  useEffect(() => {
    void bootstrapInventory()
    purgeExpired()
    if (project) ensureProjectPosReady(project.id)
  }, [bootstrapInventory, purgeExpired, project, ensureProjectPosReady])

  const tables = useMemo(
    () => (project ? ensurePosTables(project.posTables) : []),
    [project],
  )

  const activeTableId = useMemo(() => {
    const fromWaiter = getWorkspaceTableId()
    return resolveActiveTableId(tables, fromWaiter || project?.activeTableId)
  }, [tables, project, getWorkspaceTableId, activeWaiterId])

  const activeTable = useMemo(
    () => tables.find((t) => t.id === activeTableId) || null,
    [tables, activeTableId],
  )

  const spaceTables = useMemo(
    () => tablesInSpace(tables, activeSpaceId),
    [tables, activeSpaceId],
  )

  const catalog = useMemo(() => {
    const venue = buildVenueMasterCatalog()
    const catering = project?.catering ?? []
    return mergeHybridPosCatalog({
      base: mergeCatalogs(venue, catering),
      inventory: inventoryItems ?? [],
      dailySpecials: getActiveSpecials(),
    })
  }, [project, inventoryItems, getActiveSpecials])

  const visibleItems = useMemo(
    () => filterPosMenu(catalog, mainCat, subCat),
    [catalog, mainCat, subCat],
  )

  const cartLines = quickSale ? quickLines : activeTable?.lines ?? []
  const cartTotalsValue = cartTotals(cartLines)
  const spaceLabel = getSpaceName(activeTable?.spaceId || activeSpaceId)
  const cartHeader = quickSale
    ? '🛒 ÚČET: RYCHLÝ PRODEJ'
    : `🛒 ÚČET: STŮL ${activeTable?.label || '—'} - ${spaceLabel}`

  const myReady = useMemo(
    () =>
      (readyAlerts ?? []).filter(
        (a) => !a.seen && (!a.waiterId || a.waiterId === activeWaiterId),
      ),
    [readyAlerts, activeWaiterId],
  )

  const mySecurity = useMemo(
    () => (securityAlerts ?? []).filter((a) => !a.seen).slice(0, 3),
    [securityAlerts],
  )

  // KDS ready + security channel
  useEffect(() => {
    const ch = getPosChannel()
    if (!ch) return
    const onMsg = (ev: MessageEvent<PosBroadcastMessage>) => {
      if (ev.data?.type === 'waiter_ready' && ev.data.payload) {
        const p = ev.data.payload
        if (p.waiterId && p.waiterId !== activeWaiterId) return
        pushReadyAlert({
          ticketId: p.ticketId,
          orderNumber: p.orderNumber,
          tableLabel: p.tableLabel,
          station: p.station,
          waiterId: p.waiterId,
          message: p.message,
        })
        setFlashReady(p.message)
        tapFeedback('success')
        window.setTimeout(() => setFlashReady(null), 6000)
      }
      if (ev.data?.type === 'security_alert' && ev.data.payload) {
        const a = ev.data.payload
        const msg =
          a.kind === 'fight'
            ? `⚠️ VAROVÁNÍ: Detekován KONFLIKT / RVAČKA v zóně ${a.cameraLabel || '—'}!`
            : `🚨 ALERT: Podezření na ÚTĚK BEZ PLACENÍ ze Stolu ${a.tableLabel || a.tableId || 'X'}!`
        pushSecurityAlert({
          message: msg,
          tableLabel: a.tableLabel || '',
        })
        setEmergency(msg)
        tapFeedback('alert')
        window.setTimeout(() => setEmergency(null), 12000)
      }
    }
    ch.addEventListener('message', onMsg)
    return () => ch.removeEventListener('message', onMsg)
  }, [activeWaiterId, pushReadyAlert, pushSecurityAlert])

  // Same-window CCTV Vision AI alerts → floating emergency ribbon
  useEffect(() => {
    if (!cctvGlobalAlert) return
    const a = cctvGlobalAlert
    const msg =
      a.kind === 'fight'
        ? `⚠️ VAROVÁNÍ: Detekován KONFLIKT / RVAČKA v zóně ${a.cameraLabel || '—'}!`
        : a.kind === 'queue'
          ? a.message
          : `🚨 ALERT: Podezření na ÚTĚK BEZ PLACENÍ ze Stolu ${a.tableLabel || 'X'}!`
    setEmergency(msg)
    tapFeedback('alert')
    const t = window.setTimeout(() => setEmergency(null), 12000)
    return () => window.clearTimeout(t)
  }, [cctvGlobalAlert])

  const selectTable = useCallback(
    (tableId: string) => {
      tapFeedback()
      setQuickSale(false)
      setWorkspaceTableId(tableId)
      if (project) setActiveTable(project.id, tableId)
    },
    [project, setActiveTable, setWorkspaceTableId],
  )

  const addItem = (item: CateringItem) => {
    tapFeedback('success')
    const line: POSCartLine = {
      cateringId: item.id,
      name: item.name,
      category: item.category === 'beverage' ? 'beverage' : item.category === 'other' ? 'other' : 'food',
      subcategory: item.subcategory || 'ostatni',
      unitPrice: Number(item.sellPrice) || 0,
      qty: 1,
      vatRate: Number(item.vatRate) || 12,
      foodCostPerUnit: Number(item.foodCost) || 0,
      lineId: uid('line'),
      waiterId: waiter?.id,
      waiterName: waiter?.name,
      sentToKds: false,
      inventory_item_id: item.inventory_item_id ?? null,
      is_daily_special: item.is_daily_special,
    }
    if (quickSale) {
      setQuickLines((prev) => {
        const idx = prev.findIndex(
          (l) => l.cateringId === line.cateringId && l.unitPrice === line.unitPrice,
        )
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
          return next
        }
        return [...prev, line]
      })
      return
    }
    if (!project || !activeTableId) {
      setToast('Vyberte stůl nebo Rychlý prodej')
      return
    }
    addLineToActiveTable(project.id, line, {
      tableId: activeTableId,
      waiterId: waiter?.id,
      waiterName: waiter?.name,
    })
    void ensureAiImage({
      id: item.id,
      name: item.name,
      category: item.category === 'beverage' ? 'beverage' : 'raw',
      image_url: item.image_url ?? null,
    })
  }

  const changeQty = (line: POSCartLine, delta: number) => {
    tapFeedback()
    if (quickSale) {
      setQuickLines((prev) =>
        prev
          .map((l) =>
            (l.lineId && l.lineId === line.lineId) ||
            (!l.lineId && l.cateringId === line.cateringId)
              ? { ...l, qty: l.qty + delta }
              : l,
          )
          .filter((l) => l.qty > 0),
      )
      return
    }
    if (!project || !activeTable) return
    const next = (activeTable.lines ?? [])
      .map((l) =>
        (l.lineId && line.lineId && l.lineId === line.lineId) ||
        (!line.lineId && l.cateringId === line.cateringId)
          ? { ...l, qty: l.qty + delta, sentToKds: false }
          : l,
      )
      .filter((l) => l.qty > 0)
    setTableLines(project.id, activeTable.id, next)
  }

  const sendKds = () => {
    tapFeedback('kds')
    if (!project || !activeTable || !waiter) {
      setToast('Vyberte stůl a obsluhu')
      return
    }
    const res = sendTableOrderToKds({
      projectId: project.id,
      tableId: activeTable.id,
      waiterId: waiter.id,
      waiterName: waiter.name,
    })
    if (!res.ok) setToast(res.error || 'KDS odeslání selhalo')
  }

  const printSale = (
    result: CheckoutResult,
    tableLabel: string,
    receiptNumber: string,
  ) => {
    const totals = cartTotals(result.lines)
    dispatchPrintJobs({
      printers: Array.isArray(printers) ? printers : [],
      projectName: project?.name || 'EventFlow',
      receiptNumber,
      tableLabel,
      lines: result.lines,
      companyName: profile.companyName || 'EventFlow',
      totalGross: result.method === 'all_inclusive' ? 0 : totals.totalGross,
      totalVat: result.method === 'all_inclusive' ? 0 : totals.totalVat,
      paymentLabel: paymentMethodLabel(result.method),
      printCustomerReceipt: result.method !== 'all_inclusive',
    })
  }

  const onCheckout = async (result: CheckoutResult) => {
    tapFeedback('success')
    if (quickSale) {
      if (!project) {
        setToast('Pro Rychlý prodej aktivujte projekt v Admin Dashboardu')
        return
      }
      const sale = completePosSale(project.id, result.lines, result.method, {
        clearFromTable: false,
        cashAmount: result.cashAmount,
        cardAmount: result.cardAmount,
        changeGiven: result.changeGiven,
        skipKds: false,
        waiterId: waiter?.id,
        waiterName: waiter?.name,
      })
      if (!sale.ok) {
        setToast(sale.error || 'Prodej selhal')
        return
      }
      printSale(result, 'Rychlý prodej', sale.receiptNumber || uid('rcp'))
      setQuickLines([])
      setCheckoutOpen(false)
      setQuickSale(false)
      setToast('Rychlý prodej dokončen')
      return
    }
    if (!project || !activeTable) return
    const sale = completePosSale(project.id, result.lines, result.method, {
      clearFromTable: true,
      tableId: activeTable.id,
      tableLabel: activeTable.label,
      cashAmount: result.cashAmount,
      cardAmount: result.cardAmount,
      changeGiven: result.changeGiven,
      skipKds: true,
      waiterId: waiter?.id,
      waiterName: waiter?.name,
    })
    if (!sale.ok) {
      setToast(sale.error || 'Platba selhala')
      return
    }
    printSale(result, activeTable.label, sale.receiptNumber || uid('rcp'))
    setCheckoutOpen(false)
    setToast(`Platba ${activeTable.label} · zbývající položky zůstávají na stole`)
  }

  const onAddSpace = () => {
    tapFeedback()
    const name = window.prompt('Název nového prostoru', 'Nový prostor')
    if (!name) return
    addSpace(name)
    setToast(`Prostor „${name.trim()}“ přidán`)
  }

  const onAddTable = () => {
    tapFeedback()
    if (!project) {
      setToast('Nejdřív aktivujte projekt v Admin Dashboardu')
      return
    }
    const name = window.prompt('Název / popis stolu', `Stůl ${tables.length + 1}`)
    if (!name) return
    const id = addTable(project.id, name, { spaceId: activeSpaceId })
    if (id) {
      setWorkspaceTableId(id)
      setToast(`Stůl „${name.trim()}“ přidán do ${getSpaceName(activeSpaceId)}`)
    }
  }

  const onDeleteTable = (table: PosTableTab) => {
    tapFeedback('alert')
    if (!project) return
    if (!window.confirm(`Smazat stůl „${table.label}“?`)) return
    const res = removeTable(project.id, table.id)
    if (!res.ok) setToast(res.error || 'Smazání selhalo')
    else setToast(`Stůl „${table.label}“ smazán`)
  }

  const subs = POS_CATEGORIES.find((c) => c.id === mainCat)?.subs || []

  if (!project) {
    return (
      <div className="st-empty panel">
        <h2 className="gold-text">Personální terminál čeká na akci</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Manažer musí vybrat aktivní zakázku v Admin Dashboardu. Poté se načte mapa stolů a katalog.
        </p>
      </div>
    )
  }

  return (
    <div className="staff-terminal">
      {(emergency || mySecurity[0]) && (
        <div className="st-emergency-banner" role="alert">
          {emergency || mySecurity[0]?.message}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            onClick={() => {
              tapFeedback()
              setEmergency(null)
              mySecurity.forEach((a) => dismissSecurityAlert(a.id))
              resolveCctvAlert()
            }}
          >
            Zavřít
          </button>
        </div>
      )}

      {flashReady && (
        <div className="st-ready-flash" role="status">
          <Bell size={18} /> {flashReady}
        </div>
      )}

      <header className="st-topbar">
        <div className="st-waiter-row">
          <UserRound size={16} color="var(--gold)" />
          {waiters.map((w) => (
            <button
              key={w.id}
              type="button"
              className={activeWaiterId === w.id ? 'btn btn-gold' : 'btn btn-ghost'}
              style={{ minHeight: 44 }}
              onClick={() => {
                tapFeedback()
                setActiveWaiter(w.id)
              }}
            >
              {w.name}
            </button>
          ))}
        </div>
        <div className="st-top-actions">
          <button
            type="button"
            className={quickSale ? 'btn btn-gold' : 'btn btn-ghost'}
            style={{ minHeight: 48 }}
            onClick={() => {
              tapFeedback()
              setQuickSale((v) => !v)
            }}
          >
            <Zap size={15} /> ⚡ Rychlý prodej (Bez stolu)
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 48 }}
            onClick={() => {
              tapFeedback()
              void openPosDisplayWindow('/kds-kitchen', 1)
            }}
          >
            <ChefHat size={15} /> KDS Kuchyň
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 48 }}
            onClick={() => {
              tapFeedback()
              void openPosDisplayWindow('/kds-bar', 2)
            }}
          >
            <Wine size={15} /> KDS Bar
          </button>
          <button
            type="button"
            className={showShifts ? 'btn btn-gold' : 'btn btn-ghost'}
            style={{ minHeight: 48 }}
            onClick={() => {
              tapFeedback()
              setShowShifts((v) => !v)
            }}
          >
            Směny
          </button>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 48 }}
            onClick={() => {
              tapFeedback()
              setClosureOpen(true)
            }}
          >
            <Flag size={15} /> 🏁 Uzavřít / Předat směnu
          </button>
        </div>
      </header>

      {showShifts && (
        <div style={{ marginBottom: 12 }}>
          <PosShiftExpressInput />
        </div>
      )}

      {myReady.length > 0 && (
        <div className="st-ready-list">
          {myReady.map((a) => (
            <button
              key={a.id}
              type="button"
              className="st-ready-chip"
              onClick={() => {
                tapFeedback('success')
                dismissReadyAlert(a.id)
              }}
            >
              <Bell size={14} /> {a.message}
            </button>
          ))}
        </div>
      )}

      <div className="st-grid">
        {/* LEFT — spaces + tables */}
        <aside className="st-left panel">
          <div className="st-section-title">
            <MapIcon size={16} color="var(--gold)" /> Prostory a stoly
          </div>
          <div className="st-space-bar">
            {spaces.map((s) => (
              <button
                key={s.id}
                type="button"
                className={activeSpaceId === s.id ? 'btn btn-gold' : 'btn btn-ghost'}
                style={{ minHeight: 44 }}
                onClick={() => {
                  tapFeedback()
                  setActiveSpace(s.id)
                }}
              >
                {s.name}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 44 }}
              onClick={onAddSpace}
            >
              ➕ Přidat prostor
            </button>
          </div>

          <div className="st-table-grid">
            {spaceTables.map((t) => {
              const total = tableOpenTotal(t)
              const active = !quickSale && t.id === activeTableId
              return (
                <div
                  key={t.id}
                  className={`st-table-card ${active ? 'is-active' : ''} ${total > 0 ? 'has-balance' : ''}`}
                >
                  <button
                    type="button"
                    className="st-table-main"
                    onClick={() => selectTable(t.id)}
                  >
                    <div className="st-table-label">{t.label}</div>
                    <div className="st-table-zone">{getSpaceName(t.spaceId)}</div>
                    <div className="st-table-balance">
                      {total > 0 ? formatCurrency(total) : 'Volný'}
                    </div>
                    <div className="st-table-meta">
                      {(t.lines ?? []).length} pol. · {t.assignedWaiterName || '—'}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="st-table-trash"
                    title="Smazat stůl"
                    onClick={() => onDeleteTable(t)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="btn btn-gold"
            style={{ width: '100%', minHeight: 48, marginTop: 10 }}
            onClick={onAddTable}
          >
            <Plus size={16} /> ➕ Přidat stůl
          </button>
        </aside>

        {/* CENTER — catalog */}
        <main className="st-center panel">
          <div className="st-cat-tabs">
            <button
              type="button"
              className={mainCat === 'food' ? 'btn btn-gold' : 'btn btn-ghost'}
              style={{ minHeight: 48 }}
              onClick={() => {
                tapFeedback()
                setMainCat('food')
                setSubCat('all')
              }}
            >
              <Utensils size={15} /> Jídlo
            </button>
            <button
              type="button"
              className={mainCat === 'beverage' ? 'btn btn-gold' : 'btn btn-ghost'}
              style={{ minHeight: 48 }}
              onClick={() => {
                tapFeedback()
                setMainCat('beverage')
                setSubCat('all')
              }}
            >
              <Wine size={15} /> Pití
            </button>
          </div>
          <div className="st-sub-bar">
            {subs.map((s) => (
              <button
                key={s.id}
                type="button"
                className={subCat === s.id ? 'btn btn-gold' : 'btn btn-ghost'}
                style={{ minHeight: 40 }}
                onClick={() => {
                  tapFeedback()
                  setSubCat(s.id)
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="st-product-grid">
            {visibleItems.map((item) => (
              <PosProductTile
                key={item.id}
                item={item}
                imageUrl={
                  imageByKey[item.id] ||
                  imageByKey[productNameKey(item.name)] ||
                  item.image_url ||
                  null
                }
                isFetching={false}
                onAdd={() => addItem(item)}
              />
            ))}
            {visibleItems.length === 0 && (
              <div className="st-empty-cat">Žádné položky v této kategorii.</div>
            )}
          </div>
        </main>

        {/* RIGHT — cart locked to table */}
        <aside className="st-right panel">
          <div className="st-cart-header">{cartHeader}</div>
          <div className="st-cart-lines">
            {cartLines.map((line, idx) => (
              <div key={line.lineId || `${line.cateringId}-${idx}`} className="st-cart-line">
                <div>
                  <div className="st-cart-name">{line.name}</div>
                  <div className="st-cart-price">
                    {formatCurrency(line.unitPrice)} · {line.sentToKds ? 'KDS ✓' : 'nové'}
                  </div>
                </div>
                <div className="st-cart-qty">
                  <button type="button" onClick={() => changeQty(line, -1)}>
                    <Minus size={14} />
                  </button>
                  <span>{line.qty}</span>
                  <button type="button" onClick={() => changeQty(line, 1)}>
                    <Plus size={14} />
                  </button>
                </div>
                <div className="st-cart-sum">
                  {formatCurrency(line.unitPrice * line.qty)}
                </div>
              </div>
            ))}
            {cartLines.length === 0 && (
              <div className="st-empty-cat">Účet je prázdný — klepněte na položku v katalogu.</div>
            )}
          </div>
          <div className="st-cart-footer">
            <div className="st-cart-total">
              Celkem <strong className="gold-text">{formatCurrency(cartTotalsValue.totalGross)}</strong>
            </div>
            {!quickSale && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 52, width: '100%' }}
                disabled={!cartLines.some((l) => !l.sentToKds)}
                onClick={sendKds}
              >
                <Send size={16} /> Odeslat na KDS
              </button>
            )}
            <button
              type="button"
              className="btn btn-gold"
              style={{ minHeight: 56, width: '100%' }}
              disabled={cartLines.length === 0}
              onClick={() => {
                tapFeedback()
                setCheckoutOpen(true)
              }}
            >
              <ShoppingCart size={16} /> Zaplatit / Platit zvlášť
            </button>
          </div>
        </aside>
      </div>

      <AdvancedCheckout
        open={checkoutOpen}
        tableLines={cartLines}
        tableLabel={quickSale ? 'Rychlý prodej' : activeTable?.label || 'Stůl'}
        onClose={() => setCheckoutOpen(false)}
        onComplete={onCheckout}
      />

      <ShiftClosureModal
        open={closureOpen}
        project={project}
        waiterId={waiter?.id || ''}
        waiterName={waiter?.name || 'Obsluha'}
        onClose={() => setClosureOpen(false)}
        onClosed={() => {
          setClosureOpen(false)
          setToast('Směna uzavřena a archivována')
        }}
      />
    </div>
  )
}
