import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  ChefHat,
  Flag,
  Map as MapIcon,
  Minus,
  Plus,
  Printer,
  Settings2,
  ShoppingCart,
  Smartphone,
  Trash2,
  Utensils,
  Wine,
  X,
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
import { useShiftFinanceStore } from '../../store/useShiftFinanceStore'
import { useCctvStore } from '../../store/useCctvStore'
import { useDailySpecialStore } from '../../store/useDailySpecialStore'
import { useProductImageStore, productNameKey } from '../../store/useProductImageStore'
import { PosProductTile } from '../pos/PosProductTile'
import { AdvancedCheckout, type CheckoutResult } from '../pos/AdvancedCheckout'
import { ShiftClosureHub } from '../ShiftClosureHub'
import { PosShiftExpressInput } from '../pos/PosShiftExpressInput'
import { ManagerPinKeypadModal } from './ManagerPinKeypadModal'
import { POS_CATEGORIES, filterPosMenu } from '../../lib/posCategories'
import { buildVenueMasterCatalog, mergeCatalogs } from '../../lib/venueCatalog'
import { mergeHybridPosCatalog } from '../../lib/inventoryPosBridge'
import {
  clampSeatCapacity,
  DEFAULT_SEAT_CAPACITY,
  ensurePosTables,
  isSentCartLine,
  seatLabel,
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
import { printTableQrCode } from '../../lib/tableQrPrint'
import { tapFeedback } from '../../lib/touchFeedback'
import { StornoPinModal } from './StornoPinModal'
import { TableConfigModal } from './TableConfigModal'
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
  const updateProject = useAppStore((s) => s.updateProject)
  const addTable = useAppStore((s) => s.addTable)
  const removeTable = useAppStore((s) => s.removeTable)
  const renameTable = useAppStore((s) => s.renameTable)
  const updateTableCapacity = useAppStore((s) => s.updateTableCapacity)
  const sendTableOrderToKds = useAppStore((s) => s.sendTableOrderToKds)
  const removeDraftCartLine = useAppStore((s) => s.removeDraftCartLine)
  const voidSentCartLine = useAppStore((s) => s.voidSentCartLine)
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
  const waiterLoggedOut = usePosSessionStore((s) => s.waiterLoggedOut)
  const setActiveWaiter = usePosSessionStore((s) => s.setActiveWaiter)
  const getActiveWaiter = usePosSessionStore((s) => s.getActiveWaiter)
  const getWorkspaceTableId = usePosSessionStore((s) => s.getWorkspaceTableId)
  const setWorkspaceTableId = usePosSessionStore((s) => s.setWorkspaceTableId)
  const logoutWaiterSession = usePosSessionStore((s) => s.logoutWaiterSession)
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
  const ordersLocked = useShiftFinanceStore((s) => s.ordersLocked)
  const startNewShift = useShiftFinanceStore((s) => s.startNewShift)
  const cctvGlobalAlert = useCctvStore((s) => s.globalAlert)
  const resolveCctvAlert = useCctvStore((s) => s.resolveGlobalAlert)

  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const waiter = getActiveWaiter()

  const [mainCat, setMainCat] = useState<'food' | 'beverage'>('food')
  const [subCat, setSubCat] = useState<POSSubcategory | 'all'>('all')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [quickSale, setQuickSale] = useState(false)
  const [quickLines, setQuickLines] = useState<POSCartLine[]>([])
  const [showShifts, setShowShifts] = useState(false)
  const [flashReady, setFlashReady] = useState<string | null>(null)
  const [emergency, setEmergency] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<POSCartLine | null>(null)
  /** After Odeslat — stay on space map until waiter taps a table again */
  const [mapFocus, setMapFocus] = useState(false)
  /** PIN-gated Uzávěrka & Směna inside /pos-terminal */
  const [closurePinOpen, setClosurePinOpen] = useState(false)
  const [closureUnlocked, setClosureUnlocked] = useState(false)
  /** null = Celý stůl (společný účet); 1…N = Židle N */
  const [activeSeatIndex, setActiveSeatIndex] = useState<number | null>(null)
  const [isMobileWaiter, setIsMobileWaiter] = useState(false)
  const [tableConfig, setTableConfig] = useState<
    null | { mode: 'add' } | { mode: 'edit'; table: PosTableTab }
  >(null)

  useEffect(() => {
    void bootstrapInventory()
    purgeExpired()
    if (project) ensureProjectPosReady(project.id)
  }, [bootstrapInventory, purgeExpired, project, ensureProjectPosReady])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 900px)')
    const sync = () => setIsMobileWaiter(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const tables = useMemo(
    () => (project ? ensurePosTables(project.posTables) : []),
    [project],
  )

  const activeTableId = useMemo(() => {
    if (mapFocus && !quickSale) return null
    const preferred = getWorkspaceTableId() || project?.activeTableId || null
    if (!preferred) return null
    return tables.some((t) => t.id === preferred) ? preferred : null
  }, [tables, project, getWorkspaceTableId, activeWaiterId, mapFocus, quickSale])

  const activeTable = useMemo(
    () => tables.find((t) => t.id === activeTableId) || null,
    [tables, activeTableId],
  )

  useEffect(() => {
    setActiveSeatIndex(null)
  }, [activeTableId])

  const draftLines = useMemo(
    () => (quickSale ? quickLines : (activeTable?.lines ?? []).filter((l) => !isSentCartLine(l))),
    [quickSale, quickLines, activeTable],
  )
  const sentLines = useMemo(
    () => (quickSale ? [] : (activeTable?.lines ?? []).filter((l) => isSentCartLine(l))),
    [quickSale, activeTable],
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
  const seatCapacity = clampSeatCapacity(
    activeTable?.seatCapacity ?? DEFAULT_SEAT_CAPACITY,
  )
  const cartHeader = quickSale
    ? '🛒 ÚČET: RYCHLÝ PRODEJ'
    : activeTable
      ? `🛒 ÚČET: ${activeTable.label} · Kapacita: ${seatCapacity} osob · ${spaceLabel}`
      : `🛒 ÚČET: STŮL — · ${spaceLabel}`
  const focusSeatLabel = seatLabel(activeSeatIndex)

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
      setMapFocus(false)
      setWorkspaceTableId(tableId)
      if (project) setActiveTable(project.id, tableId)
    },
    [project, setActiveTable, setWorkspaceTableId],
  )

  const returnToTableMap = useCallback(() => {
    setMapFocus(true)
    setWorkspaceTableId(null)
    if (project) updateProject(project.id, { activeTableId: null })
  }, [project, setWorkspaceTableId, updateProject])

  const resetTerminalAfterClosure = useCallback(() => {
    // ShiftFinance startNewShift already ran inside embedded hub close protocol
    setClosureUnlocked(false)
    setClosurePinOpen(false)
    setQuickSale(false)
    setQuickLines([])
    setCheckoutOpen(false)
    setShowShifts(false)
    setMapFocus(true)
    setWorkspaceTableId(null)
    if (project) updateProject(project.id, { activeTableId: null })
    logoutWaiterSession()
  }, [project, updateProject, setWorkspaceTableId, logoutWaiterSession])

  const addItem = (item: CateringItem) => {
    if (waiterLoggedOut) {
      tapFeedback('alert')
      setToast('Nejdřív vyberte obsluhu pro novou směnu')
      return
    }
    if (ordersLocked) {
      tapFeedback('alert')
      setToast('Směna uzavřena — zahajte novou směnu v Uzávěrka & Směna')
      return
    }
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
      seatIndex: quickSale ? null : activeSeatIndex,
      orderSource: 'waiter',
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

  const changeDraftQty = (line: POSCartLine, delta: number) => {
    tapFeedback()
    if (isSentCartLine(line)) {
      setToast('Odeslanou položku nelze měnit — použijte Storno s PIN')
      return
    }
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
    if (!project || !activeTable || !line.lineId) return
    if (delta < 0 && line.qty + delta <= 0) {
      removeDraftCartLine({
        projectId: project.id,
        tableId: activeTable.id,
        lineId: line.lineId,
        waiterId: waiter?.id,
        waiterName: waiter?.name,
      })
      return
    }
    const next = (activeTable.lines ?? [])
      .map((l) =>
        l.lineId && line.lineId && l.lineId === line.lineId
          ? { ...l, qty: l.qty + delta, cartState: 'draft' as const, sentToKds: false }
          : l,
      )
      .filter((l) => l.qty > 0)
    setTableLines(project.id, activeTable.id, next)
  }

  const deleteDraftLine = (line: POSCartLine) => {
    tapFeedback('alert')
    if (isSentCartLine(line)) {
      setVoidTarget(line)
      return
    }
    if (quickSale) {
      setQuickLines((prev) =>
        prev.filter(
          (l) =>
            !(
              (l.lineId && line.lineId && l.lineId === line.lineId) ||
              (!line.lineId && l.cateringId === line.cateringId)
            ),
        ),
      )
      return
    }
    if (!project || !activeTable || !line.lineId) return
    const res = removeDraftCartLine({
      projectId: project.id,
      tableId: activeTable.id,
      lineId: line.lineId,
      waiterId: waiter?.id,
      waiterName: waiter?.name,
    })
    if (!res.ok) setToast(res.error || 'Smazání selhalo')
  }

  const requestVoidSent = (line: POSCartLine) => {
    tapFeedback('alert')
    setVoidTarget(line)
  }

  const confirmVoidSent = (pin: string) => {
    if (!project || !activeTable || !voidTarget?.lineId) {
      setVoidTarget(null)
      return
    }
    const res = voidSentCartLine({
      projectId: project.id,
      tableId: activeTable.id,
      lineId: voidTarget.lineId,
      managerPin: pin,
      expectedPin: profile.managerPin,
      waiterId: waiter?.id,
      waiterName: waiter?.name,
      reason: `Storno manažerem · ${voidTarget.name}`,
    })
    if (!res.ok) {
      setToast(res.error || 'Storno selhalo')
      return
    }
    setVoidTarget(null)
  }

  const sendOrder = () => {
    tapFeedback('kds')
    if (waiterLoggedOut) {
      setToast('Nejdřív vyberte obsluhu pro novou směnu')
      return
    }
    if (ordersLocked) {
      setToast('Směna uzavřena — nové objednávky jsou uzamčeny')
      return
    }
    if (!project || !activeTable || !waiter) {
      setToast('Vyberte stůl a obsluhu')
      return
    }
    if (!draftLines.length) {
      setToast('Žádné rozpracované položky k odeslání')
      return
    }
    const res = sendTableOrderToKds({
      projectId: project.id,
      tableId: activeTable.id,
      waiterId: waiter.id,
      waiterName: waiter.name,
    })
    if (!res.ok) {
      setToast(res.error || 'KDS odeslání selhalo')
      return
    }
    returnToTableMap()
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
      profile: {
        companyName: profile.companyName,
        ico: profile.ico,
        dic: profile.dic,
        street: profile.street,
        city: profile.city,
        zip: profile.zip,
        logoUrl: profile.logoUrl ?? null,
      },
      paymentMethod: result.method,
      projectSequence: project?.documents?.sequence,
    })
  }

  const onCheckout = async (result: CheckoutResult) => {
    tapFeedback('success')
    if (ordersLocked) {
      setToast('Směna uzavřena — platby jsou uzamčeny do nové směny')
      return
    }
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
    const walletPaid =
      result.method === 'apple_pay' || result.method === 'google_pay'
    setToast(
      walletPaid
        ? `ZAPLACENO · ${activeTable.label} · ${paymentMethodLabel(result.method)}`
        : `Platba ${activeTable.label} · zbývající položky zůstávají na stole`,
    )
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
    setTableConfig({ mode: 'add' })
  }

  const onEditTable = (table: PosTableTab) => {
    tapFeedback()
    setTableConfig({ mode: 'edit', table })
  }

  const onPrintTableQr = (table: PosTableTab) => {
    tapFeedback('success')
    printTableQrCode({
      tableId: table.id,
      tableLabel: table.label,
      seatCapacity: clampSeatCapacity(table.seatCapacity),
      venueName: profile.companyName || 'EventFlow',
    })
    setToast(`QR kód pro ${table.label} připraven k tisku`)
  }

  const onDeleteTable = (table: PosTableTab) => {
    tapFeedback('alert')
    if (!project) return
    if (!window.confirm(`Smazat stůl „${table.label}“?`)) return
    const res = removeTable(project.id, table.id)
    if (!res.ok) setToast(res.error || 'Smazání selhalo')
    else setToast(`Stůl „${table.label}“ smazán`)
  }

  const onSaveTableConfig = (result: { label: string; seatCapacity: number }) => {
    if (!project || !tableConfig) return
    if (tableConfig.mode === 'add') {
      const id = addTable(project.id, result.label, {
        spaceId: activeSpaceId,
        seatCapacity: result.seatCapacity,
      })
      if (id) {
        setWorkspaceTableId(id)
        setMapFocus(false)
        setToast(
          `${result.label} přidán · Kapacita: ${result.seatCapacity} osob · ${getSpaceName(activeSpaceId)}`,
        )
      }
    } else {
      renameTable(project.id, tableConfig.table.id, result.label)
      updateTableCapacity(project.id, tableConfig.table.id, result.seatCapacity)
      setToast(
        `${result.label} uložen · Kapacita: ${result.seatCapacity} osob`,
      )
    }
    setTableConfig(null)
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

  if (closureUnlocked) {
    return (
      <div className="staff-terminal staff-terminal-closure">
        <ShiftClosureHub
          embedded
          onBack={() => {
            tapFeedback()
            setClosureUnlocked(false)
          }}
          onClosedComplete={resetTerminalAfterClosure}
        />
      </div>
    )
  }

  return (
    <div
      className={`staff-terminal${isMobileWaiter ? ' staff-terminal-mobile' : ''}`}
    >
      {isMobileWaiter && (
        <div className="st-mobile-banner" role="status">
          <Smartphone size={16} /> Mobilní číšník · optimalizovaný jedno sloupec
        </div>
      )}
      {waiterLoggedOut && (
        <div className="st-waiter-login-gate panel" role="dialog" aria-modal="true">
          <h2 className="gold-text" style={{ marginTop: 0 }}>
            Výběr obsluhy — nová směna
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            Předchozí směna byla uzavřena. Vyberte obsluhu pro čistý start terminálu.
          </p>
          <div className="st-waiter-login-grid">
            {waiters.map((w) => (
              <button
                key={w.id}
                type="button"
                className="btn btn-gold"
                style={{ minHeight: 64, fontWeight: 900 }}
                onClick={() => {
                  tapFeedback('success')
                  setActiveWaiter(w.id)
                  setToast(`Přihlášen(a): ${w.name}`)
                }}
              >
                <UserRound size={18} /> {w.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {ordersLocked && (
        <div className="st-shift-locked-banner" role="status">
          <span>
            🔒 Směna uzavřena — terminál nepřijímá nové objednávky. KDS historie je v archivu.
          </span>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 44 }}
            onClick={() => {
              tapFeedback('success')
              startNewShift()
              setToast('Nová směna zahájena')
            }}
          >
            Zahájit novou směnu
          </button>
        </div>
      )}
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
              className={
                !waiterLoggedOut && activeWaiterId === w.id ? 'btn btn-gold' : 'btn btn-ghost'
              }
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
              setMapFocus(false)
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
            className="btn btn-gold st-closure-nav-btn"
            style={{ minHeight: 52, fontWeight: 900 }}
            onClick={() => {
              tapFeedback()
              setClosurePinOpen(true)
            }}
          >
            <Flag size={15} /> 🏁 Uzávěrka & Směna
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
              const cap = clampSeatCapacity(t.seatCapacity)
              const onlineLines = (t.lines ?? []).filter(
                (l) => l.orderSource === 'customer_qr' || l.orderSource === 'online',
              ).length
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
                    <div className="st-table-zone">
                      {getSpaceName(t.spaceId)} · Kapacita: {cap} osob
                    </div>
                    <div className="st-table-balance">
                      {total > 0 ? formatCurrency(total) : 'Volný'}
                    </div>
                    <div className="st-table-meta">
                      {(t.lines ?? []).length} pol. · {t.assignedWaiterName || '—'}
                      {onlineLines > 0 ? ` · 📥 Online ${onlineLines}` : ''}
                    </div>
                  </button>
                  <div className="st-table-card-actions">
                    <button
                      type="button"
                      className="st-table-tool"
                      title="Konfigurace stolu"
                      onClick={() => onEditTable(t)}
                    >
                      <Settings2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="st-table-tool"
                      title="Vytisknout QR kód pro stůl"
                      onClick={() => onPrintTableQr(t)}
                    >
                      <Printer size={14} />
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
                  <button
                    type="button"
                    className="st-table-qr-btn"
                    onClick={() => onPrintTableQr(t)}
                  >
                    🖨️ Vytisknout QR kód pro stůl
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

        {/* CENTER — catalog (+ seat focus strip when table open) */}
        <main className="st-center panel">
          {!quickSale && activeTable && (
            <div className="st-seat-rail" aria-label="Výběr židle">
              <div className="st-seat-rail-title">
                {activeTable.label} · Kapacita: {seatCapacity} osob · fokus:{' '}
                <strong className="gold-text">{focusSeatLabel}</strong>
              </div>
              <div className="st-seat-nodes">
                <button
                  type="button"
                  className={
                    activeSeatIndex == null
                      ? 'st-seat-node is-active is-shared'
                      : 'st-seat-node is-shared'
                  }
                  onClick={() => {
                    tapFeedback()
                    setActiveSeatIndex(null)
                  }}
                >
                  Celý Stůl (Společný účet)
                </button>
                {Array.from({ length: seatCapacity }, (_, i) => i + 1).map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    className={
                      activeSeatIndex === seat ? 'st-seat-node is-active' : 'st-seat-node'
                    }
                    onClick={() => {
                      tapFeedback()
                      setActiveSeatIndex(seat)
                    }}
                  >
                    Židle {seat}
                  </button>
                ))}
              </div>
            </div>
          )}
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

        {/* RIGHT — cart locked to table / seat */}
        <aside className="st-right panel">
          <div className="st-cart-header">{cartHeader}</div>
          {!quickSale && activeTable && (
            <div className="st-cart-seat-focus">
              Aktivní účet:{' '}
              <strong className="gold-text">{focusSeatLabel}</strong>
              {activeSeatIndex != null
                ? ' — nové položky se uzamknou na tuto židli'
                : ' — společný účet stolu'}
            </div>
          )}
          {!quickSale && !activeTable && (
            <div className="st-empty-cat" style={{ padding: '1.5rem 0.75rem' }}>
              Vyberte stůl na mapě vlevo. Po odeslání objednávky se pohled vrátí sem.
            </div>
          )}
          <div className="st-cart-lines">
            {draftLines.length > 0 && (
              <div className="st-cart-section-label st-cart-section-draft">
                Rozpracováno / Nepotvrzené
              </div>
            )}
            {draftLines.map((line, idx) => (
              <div
                key={line.lineId || `draft-${line.cateringId}-${idx}`}
                className="st-cart-line st-cart-line-draft"
              >
                <div>
                  <div className="st-cart-name">{line.name}</div>
                  <div className="st-cart-price">
                    {formatCurrency(line.unitPrice)} · Draft · {seatLabel(line.seatIndex)}
                    {line.orderSource === 'customer_qr' || line.orderSource === 'online'
                      ? ' · 📥 Online'
                      : ''}
                  </div>
                </div>
                <div className="st-cart-qty">
                  <button
                    type="button"
                    className="st-qty-minus"
                    aria-label="Snížit množství"
                    onClick={() => changeDraftQty(line, -1)}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{line.qty}</span>
                  <button
                    type="button"
                    aria-label="Zvýšit množství"
                    onClick={() => changeDraftQty(line, 1)}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    className="st-draft-delete"
                    title="Smazat rozpracovanou položku"
                    aria-label="Smazat"
                    onClick={() => deleteDraftLine(line)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="st-cart-sum">
                  {formatCurrency(line.unitPrice * line.qty)}
                </div>
              </div>
            ))}

            {sentLines.length > 0 && (
              <div className="st-cart-section-label st-cart-section-sent">
                Odesláno / Uzamčeno
              </div>
            )}
            {sentLines.map((line, idx) => (
              <div
                key={line.lineId || `sent-${line.cateringId}-${idx}`}
                className={`st-cart-line st-cart-line-sent${
                  line.orderSource === 'customer_qr' || line.orderSource === 'online'
                    ? ' st-cart-line-online'
                    : ''
                }`}
              >
                <div>
                  <div className="st-cart-name">
                    {line.orderSource === 'customer_qr' || line.orderSource === 'online'
                      ? '📥 '
                      : ''}
                    {line.name}
                  </div>
                  <div className="st-cart-price">
                    {formatCurrency(line.unitPrice)} · Odesláno · {seatLabel(line.seatIndex)}
                    {line.sentAt
                      ? ` · ${new Date(line.sentAt).toLocaleTimeString('cs-CZ')}`
                      : ''}
                    {line.orderSource === 'customer_qr' || line.orderSource === 'online'
                      ? ' · ONLINE OBJEDNÁVKA'
                      : ''}
                  </div>
                </div>
                <div className="st-cart-qty st-cart-qty-locked">
                  <span className="st-sent-qty">{line.qty}×</span>
                  <button
                    type="button"
                    className="st-sent-void"
                    title="Storno (Manažerský PIN)"
                    aria-label="Storno"
                    onClick={() => requestVoidSent(line)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="st-cart-sum">
                  {formatCurrency(line.unitPrice * line.qty)}
                </div>
              </div>
            ))}

            {cartLines.length === 0 && (quickSale || activeTable) && (
              <div className="st-empty-cat">
                Účet je prázdný — klepněte na položku v katalogu (Draft).
              </div>
            )}
          </div>
          <div className="st-cart-footer">
            <div className="st-cart-total">
              Celkem <strong className="gold-text">{formatCurrency(cartTotalsValue.totalGross)}</strong>
            </div>
            {!quickSale && (
              <button
                type="button"
                className="st-send-order-btn"
                disabled={!activeTable || draftLines.length === 0}
                onClick={sendOrder}
              >
                🔥 Odeslat objednávku do kuchyně / baru
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

      <StornoPinModal
        open={Boolean(voidTarget)}
        itemName={voidTarget?.name || ''}
        expectedPin={profile.managerPin}
        onSuccess={confirmVoidSent}
        onCancel={() => setVoidTarget(null)}
      />

      <ManagerPinKeypadModal
        open={closurePinOpen}
        title="Zadejte Manažerský PIN pro přístup k uzávěrce"
        subtitle="Uzávěrka & Směna je chráněna. Po autorizaci se otevře kompletní finanční dashboard směny."
        expectedPin={profile.managerPin}
        confirmLabel="Odemknout uzávěrku"
        onSuccess={() => {
          setClosurePinOpen(false)
          setClosureUnlocked(true)
          setToast('Uzávěrka odemčena — Manažerský PIN ověřen')
        }}
        onCancel={() => setClosurePinOpen(false)}
      />

      <TableConfigModal
        open={Boolean(tableConfig)}
        mode={tableConfig?.mode === 'edit' ? 'edit' : 'add'}
        initialLabel={
          tableConfig?.mode === 'edit'
            ? tableConfig.table.label
            : `Stůl ${tables.length + 1}`
        }
        initialSeatCapacity={
          tableConfig?.mode === 'edit'
            ? tableConfig.table.seatCapacity
            : DEFAULT_SEAT_CAPACITY
        }
        spaceName={getSpaceName(
          tableConfig?.mode === 'edit'
            ? tableConfig.table.spaceId || activeSpaceId
            : activeSpaceId,
        )}
        onClose={() => setTableConfig(null)}
        onSave={onSaveTableConfig}
      />
    </div>
  )
}
