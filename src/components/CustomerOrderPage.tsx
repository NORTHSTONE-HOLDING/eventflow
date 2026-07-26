import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Minus, Plus, ShoppingBag, Utensils, Wine } from 'lucide-react'
import {
  migrateProject,
  selectActiveProject,
  useAppStore,
} from '../store/useAppStore'
import { useInventoryStore } from '../store/useInventoryStore'
import { useDailySpecialStore } from '../store/useDailySpecialStore'
import { parseCustomerOrderTableParam } from '../lib/tableQrPrint'
import { ensurePosTables, DEFAULT_SEAT_CAPACITY } from '../lib/tableTabs'
import { buildVenueMasterCatalog, mergeCatalogs } from '../lib/venueCatalog'
import { mergeHybridPosCatalog } from '../lib/inventoryPosBridge'
import { POS_CATEGORIES, filterPosMenu } from '../lib/posCategories'
import {
  cateringToPrintItem,
  formatAllergenLine,
  formatMenuPrice,
} from '../lib/printMenuEngine'
import { cartTotals } from '../lib/posEngine'
import { formatCurrency, uid } from '../lib/documentIds'
import { runMobileWalletHandshake } from '../lib/mobilePayHandshake'
import { tapFeedback } from '../lib/touchFeedback'
import { useWaiterAuditStore } from '../store/useWaiterAuditStore'
import type { CateringItem, POSCartLine, POSPaymentMethod, POSSubcategory } from '../types'

/**
 * Guest self-service QR ordering — public route /customer-order/:tableId
 * Elegant Gold theme, allergens, Apple Pay / card → KDS inject.
 */
export function CustomerOrderPage() {
  const { tableId: rawParam } = useParams<{ tableId: string }>()
  const tableId = parseCustomerOrderTableParam(rawParam || '')
  const hydrated = useAppStore((s) => s.hydrated)
  const projects = useAppStore((s) => s.projects)
  const activeRaw = useAppStore(selectActiveProject)
  const profile = useAppStore((s) => s.profile)
  const injectCustomerQrOrder = useAppStore((s) => s.injectCustomerQrOrder)
  const setToast = useAppStore((s) => s.setToast)
  const logWaiterAction = useWaiterAuditStore((s) => s.logWaiterAction)

  const inventoryItems = useInventoryStore((s) => s.items)
  const getActiveSpecials = useDailySpecialStore((s) => s.getActiveSpecials)

  const [mainCat, setMainCat] = useState<'food' | 'beverage'>('food')
  const [subCat, setSubCat] = useState<POSSubcategory | 'all'>('all')
  const [cart, setCart] = useState<POSCartLine[]>([])
  const [paying, setPaying] = useState(false)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [bootReady, setBootReady] = useState(false)

  useEffect(() => {
    // Allow zustand rehydrate; never leave a blank first paint
    const t = window.setTimeout(() => setBootReady(true), hydrated ? 0 : 120)
    return () => window.clearTimeout(t)
  }, [hydrated])

  const project = useMemo(() => {
    try {
      const active = migrateProject(activeRaw)
      if (active && tableId && ensurePosTables(active.posTables).some((t) => t.id === tableId)) {
        return active
      }
      for (const p of projects ?? []) {
        const m = migrateProject(p)
        if (m && tableId && ensurePosTables(m.posTables).some((t) => t.id === tableId)) {
          return m
        }
      }
      return active
    } catch {
      return null
    }
  }, [activeRaw, projects, tableId])

  const table = useMemo(() => {
    if (!tableId) return null
    try {
      if (project) {
        const found = ensurePosTables(project.posTables).find((t) => t.id === tableId)
        if (found) return found
      }
      // Fallback demo table so QR route never paints blank when storage is empty
      return {
        id: tableId,
        label: `Stůl ${tableId.replace(/^table[_-]?/i, '').slice(0, 12) || 'QR'}`,
        lines: [],
        status: 'open' as const,
        updatedAt: new Date().toISOString(),
        billingKind: 'restaurant' as const,
        spaceId: 'space_main',
        seatCapacity: DEFAULT_SEAT_CAPACITY,
      }
    } catch {
      return null
    }
  }, [project, tableId])

  const catalog = useMemo(() => {
    try {
      const venue = buildVenueMasterCatalog()
      const catering = project?.catering ?? []
      return mergeHybridPosCatalog({
        base: mergeCatalogs(venue, catering),
        inventory: inventoryItems ?? [],
        dailySpecials: getActiveSpecials(),
      })
    } catch {
      return buildVenueMasterCatalog()
    }
  }, [project, inventoryItems, getActiveSpecials])

  const visibleItems = useMemo(
    () => filterPosMenu(catalog, mainCat, subCat),
    [catalog, mainCat, subCat],
  )

  const totals = cartTotals(cart)
  const venueName = String(profile?.companyName || '').trim() || 'EventFlow'
  const subs = POS_CATEGORIES.find((c) => c.id === mainCat)?.subs || []
  const tableInProject = Boolean(
    project &&
      tableId &&
      ensurePosTables(project.posTables).some((t) => t.id === tableId),
  )

  const addItem = (item: CateringItem) => {
    if (paid || paying) return
    tapFeedback('success')
    const printMeta = cateringToPrintItem(
      item,
      item.category === 'beverage' ? 'beverage' : 'food',
    )
    const unitPrice = Number(item.sellPrice) || printMeta.unitPrice || 0
    setCart((prev) => {
      const idx = prev.findIndex(
        (l) => l.cateringId === item.id && l.unitPrice === unitPrice,
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      const line: POSCartLine = {
        cateringId: item.id,
        name: item.name,
        category:
          item.category === 'beverage'
            ? 'beverage'
            : item.category === 'other'
              ? 'other'
              : 'food',
        subcategory: item.subcategory || 'ostatni',
        unitPrice,
        qty: 1,
        vatRate: Number(item.vatRate) || 12,
        foodCostPerUnit: Number(item.foodCost) || 0,
        lineId: uid('line'),
        cartState: 'draft',
        sentToKds: false,
        orderSource: 'customer_qr',
        inventory_item_id: item.inventory_item_id ?? null,
        is_daily_special: item.is_daily_special,
      }
      return [...prev, line]
    })
  }

  const changeQty = (lineId: string | undefined, delta: number) => {
    if (!lineId || paid || paying) return
    tapFeedback()
    setCart((prev) =>
      prev
        .map((l) =>
          l.lineId === lineId ? { ...l, qty: Math.max(0, l.qty + delta) } : l,
        )
        .filter((l) => l.qty > 0),
    )
  }

  const pay = async (method: POSPaymentMethod) => {
    if (!table || !cart.length || paying || paid) return
    tapFeedback('success')
    setPaying(true)
    setPayMsg(null)

    if (method === 'apple_pay' || method === 'google_pay') {
      const wallet = await runMobileWalletHandshake({
        provider: method,
        amountCzK: totals.totalGross,
        onStatus: (s) => setPayMsg(s.message),
      })
      if (!wallet.approved) {
        setPaying(false)
        setPayMsg(wallet.declineReason || 'Platba zamítnuta')
        tapFeedback('alert')
        return
      }
    } else {
      setPayMsg('Zpracování platby kartou…')
      await new Promise<void>((r) => window.setTimeout(r, 900))
      setPayMsg('Karta: ZAPLACENO')
    }

    if (!project || !tableInProject) {
      setPaying(false)
      setPaid(true)
      setCart([])
      setPayMsg('ZAPLACENO (demo režim — stůl není v lokálním projektu)')
      tapFeedback('success')
      return
    }

    const result = injectCustomerQrOrder({
      projectId: project.id,
      tableId: table.id,
      lines: cart,
      paymentMethod: method,
    })

    setPaying(false)
    if (!result.ok) {
      setPayMsg(result.error || 'Objednávka selhala')
      tapFeedback('alert')
      return
    }
    logWaiterAction({
      project_id: project.id,
      waiter_name: 'Online host',
      waiter_id: 'customer_qr',
      action_description: `📥 ONLINE OBJEDNÁVKA · ${table.label} · ${cart.length} pol. · ZAPLACENO`,
      amount_czk: totals.totalGross,
    })
    setPaid(true)
    setCart([])
    setToast(`ZAPLACENO · ${table.label}`)
    tapFeedback('success')
  }

  if (!bootReady && !hydrated) {
    return (
      <div className="co-page">
        <div className="co-shell">
          <div className="co-brand">EVENTFLOW</div>
          <h1 className="gold-text">Načítám lístek…</h1>
          <p>Připravujeme samoobslužné objednávání pro váš stůl.</p>
        </div>
      </div>
    )
  }

  if (!tableId || !table) {
    return (
      <div className="co-page co-page-error">
        <div className="co-shell">
          <div className="co-brand">EVENTFLOW</div>
          <h1>Stůl nenalezen</h1>
          <p>
            QR kód není platný. Požádejte obsluhu o nový tisk QR kódu ze stolu v
            Personálním terminálu.
          </p>
        </div>
      </div>
    )
  }

  if (paid) {
    return (
      <div className="co-page">
        <div className="co-shell co-paid">
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          >
            <div className="co-brand">EVENTFLOW</div>
            <h1 className="gold-text">ZAPLACENO</h1>
            <p>
              Děkujeme! Vaše objednávka pro <strong>{table.label}</strong> míří do
              kuchyně a baru.
            </p>
            <div className="co-online-badge">
              📥 ONLINE OBJEDNÁVKA - {table.label.toUpperCase()}
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="co-page">
      <header className="co-hero">
        <div className="co-brand">{venueName}</div>
        <h1>{table.label}</h1>
        <p>
          Kapacita: {table.seatCapacity ?? DEFAULT_SEAT_CAPACITY} osob · Objednejte si sami z
          jídelního a nápojového lístku
        </p>
        <div className="co-theme-chip">Elegant Gold</div>
        {!tableInProject && (
          <div className="co-demo-note">
            Náhled menu (stůl zatím není synchronizován s aktivním projektem v tomto
            prohlížeči)
          </div>
        )}
      </header>

      <div className="co-tabs">
        <button
          type="button"
          className={mainCat === 'food' ? 'co-tab is-active' : 'co-tab'}
          onClick={() => {
            tapFeedback()
            setMainCat('food')
            setSubCat('all')
          }}
        >
          <Utensils size={16} /> Jídelní lístek
        </button>
        <button
          type="button"
          className={mainCat === 'beverage' ? 'co-tab is-active' : 'co-tab'}
          onClick={() => {
            tapFeedback()
            setMainCat('beverage')
            setSubCat('all')
          }}
        >
          <Wine size={16} /> Nápojový lístek
        </button>
      </div>

      <div className="co-subs">
        {subs.map((s) => (
          <button
            key={s.id}
            type="button"
            className={subCat === s.id ? 'co-sub is-active' : 'co-sub'}
            onClick={() => {
              tapFeedback()
              setSubCat(s.id)
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="co-menu">
        {visibleItems.map((item) => {
          const meta = cateringToPrintItem(
            item,
            item.category === 'beverage' ? 'beverage' : 'food',
          )
          return (
            <button
              key={item.id}
              type="button"
              className="co-item"
              onClick={() => addItem(item)}
            >
              <div className="co-item-top">
                <div className="co-item-name">{item.name}</div>
                <div className="co-item-price">{formatMenuPrice(meta.unitPrice)}</div>
              </div>
              <div className="co-item-meta">
                <span>{meta.portionLabel}</span>
                {meta.allergenCodes.length > 0 && (
                  <span className="co-allergens">{formatAllergenLine(meta.allergenCodes)}</span>
                )}
              </div>
              {item.recipe ? <div className="co-item-desc">{item.recipe}</div> : null}
              <div className="co-item-add">+ Přidat do košíku</div>
            </button>
          )
        })}
        {visibleItems.length === 0 && (
          <div className="co-empty">V této kategorii zatím nic není.</div>
        )}
      </div>

      <aside className="co-cart" aria-label="Košík">
        <div className="co-cart-title">
          <ShoppingBag size={18} /> Váš účet · {table.label}
        </div>
        {cart.length === 0 ? (
          <div className="co-empty">Košík je prázdný — klepněte na položku v menu.</div>
        ) : (
          <ul className="co-cart-list">
            {cart.map((line) => (
              <li key={line.lineId} className="co-cart-line">
                <div>
                  <div className="co-cart-name">{line.name}</div>
                  <div className="co-cart-unit">{formatCurrency(line.unitPrice)}</div>
                </div>
                <div className="co-cart-qty">
                  <button
                    type="button"
                    aria-label="Snížit"
                    onClick={() => changeQty(line.lineId, -1)}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{line.qty}</span>
                  <button
                    type="button"
                    aria-label="Zvýšit"
                    onClick={() => changeQty(line.lineId, 1)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="co-cart-sum">
                  {formatCurrency(line.unitPrice * line.qty)}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="co-vat">
          Základ: {formatCurrency(totals.totalNet)} · DPH:{' '}
          {formatCurrency(totals.totalVat)} · Celkem vč. DPH
        </div>
        <div className="co-total gold-text">{formatCurrency(totals.totalGross)}</div>

        {payMsg && <div className="co-pay-msg">{payMsg}</div>}

        <button
          type="button"
          className="co-apple-pay"
          disabled={!cart.length || paying}
          onClick={() => void pay('apple_pay')}
        >
          <span className="co-apple-logo" aria-hidden>
            
          </span>
          Zaplatit přes Apple Pay
        </button>
        <button
          type="button"
          className="co-gpay"
          disabled={!cart.length || paying}
          onClick={() => void pay('google_pay')}
        >
          <span className="co-gpay-mark" aria-hidden>
            G
          </span>
          Google Pay
        </button>
        <button
          type="button"
          className="co-card-pay"
          disabled={!cart.length || paying}
          onClick={() => void pay('card')}
        >
          Zaplatit Kartou
        </button>
      </aside>
    </div>
  )
}
