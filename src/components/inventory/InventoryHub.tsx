import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Boxes,
  Camera,
  ClipboardList,
  Loader2,
  Lock,
  RefreshCw,
  ShoppingCart,
  Warehouse,
} from 'lucide-react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { useAppStore } from '../../store/useAppStore'
import { hasFeature } from '../../lib/subscriptions'
import { formatCurrency } from '../../lib/documentIds'
import { MobileInvoiceRestock } from './MobileInvoiceRestock'
import { MobileInventura } from './MobileInventura'
import { AIProcurementAssistant } from './AIProcurementAssistant'
import { CloudSyncBadge } from './CloudSyncBadge'

type InvTab = 'overview' | 'restock' | 'audit' | 'procurement'

const TAB_KEY = 'eventflow-inventory-tab'

function readTab(): InvTab {
  try {
    const v = sessionStorage.getItem(TAB_KEY)
    if (v === 'overview' || v === 'restock' || v === 'audit' || v === 'procurement') {
      return v
    }
  } catch {
    // ignore
  }
  return 'overview'
}

export function InventoryHub() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const setView = useAppStore((s) => s.setView)
  const projects = useAppStore((s) => s.projects)
  const items = useInventoryStore((s) => s.items)
  const logs = useInventoryStore((s) => s.logs)
  const loading = useInventoryStore((s) => s.loading)
  const error = useInventoryStore((s) => s.error)
  const bootstrap = useInventoryStore((s) => s.bootstrap)
  const refreshFromCloud = useInventoryStore((s) => s.refreshFromCloud)
  const syncRecipesFromProjects = useInventoryStore((s) => s.syncRecipesFromProjects)
  const syncMode = useInventoryStore((s) => s.syncMode)

  const [tab, setTab] = useState<InvTab>(() => readTab())
  const unlocked = hasFeature(subscription || 'LITE', 'BUSINESS')

  useEffect(() => {
    void bootstrap().then(() => syncRecipesFromProjects(projects ?? []))
  }, [bootstrap, syncRecipesFromProjects, projects])

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_KEY, tab)
    } catch {
      // ignore
    }
  }, [tab])

  const stats = useMemo(() => {
    const list = Array.isArray(items) ? items : []
    const value = list.reduce(
      (s, i) => s + i.current_quantity * (i.average_price || i.purchase_price),
      0
    )
    const low = list.filter((i) => i.current_quantity <= i.minimum_quantity).length
    return {
      count: list.length,
      value: Math.round(value),
      low,
      logCount: (logs ?? []).length,
    }
  }, [items, logs])

  if (!unlocked) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">Sklad & Inventura</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 280 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Cloudový sklad vyžaduje tarif BUSINESS+</div>
          <button type="button" className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }} className="inventory-hub">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h1 className="section-title gold-text">Sklad & Inventura</h1>
          <p className="section-sub">
            Receptury · POS odepis · AI nákupní seznam · offline ochrana dat
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <CloudSyncBadge />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => refreshFromCloud()}
          >
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            Sync
          </button>
        </div>
      </div>

      {error && (
        <div className="inv-alert danger" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {syncMode === 'offline' && (
        <div className="inv-alert warning" style={{ marginBottom: 12 }}>
          Offline / hybrid režim — stoly, POS prodeje i skladové pohyby se ukládají lokálně a
          synchronizují po obnovení cloudu.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <StatCard icon={Boxes} label="Položky skladu" value={String(stats.count)} />
        <StatCard icon={Warehouse} label="Hodnota skladu" value={formatCurrency(stats.value)} />
        <StatCard
          icon={ClipboardList}
          label="Pod minimem"
          value={String(stats.low)}
          danger={stats.low > 0}
        />
        <StatCard icon={Camera} label="Pohyby (logy)" value={String(stats.logCount)} />
      </div>

      <div
        className="panel"
        style={{
          marginBottom: 14,
          padding: '0.65rem',
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {(
          [
            ['overview', 'Přehled skladu', Warehouse],
            ['restock', '📸 Naskladnění', Camera],
            ['audit', 'Mobilní inventura', ClipboardList],
            ['procurement', 'AI Nákupní asistent', ShoppingCart],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'btn btn-gold' : 'btn btn-ghost'}
            style={{ flexShrink: 0, minHeight: 44 }}
            onClick={() => setTab(id)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <AnimateTab id={tab}>
        {tab === 'overview' && <InventoryOverview />}
        {tab === 'restock' && <MobileInvoiceRestock />}
        {tab === 'audit' && <MobileInventura />}
        {tab === 'procurement' && <AIProcurementAssistant />}
      </AnimateTab>
    </div>
  )
}

function AnimateTab({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      {children}
    </motion.div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: typeof Boxes
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div
      className="panel glass-glow"
      style={{
        padding: '0.9rem',
        borderColor: danger ? 'rgba(239,68,68,0.45)' : 'var(--border)',
      }}
    >
      <div className="label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Icon size={13} color="var(--gold)" /> {label}
      </div>
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

function InventoryOverview() {
  const items = useInventoryStore((s) => s.items)
  const logs = useInventoryStore((s) => s.logs)
  const recipes = useInventoryStore((s) => s.recipes)
  const loading = useInventoryStore((s) => s.loading)

  if (loading && !items.length) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader2 className="spin" size={22} color="var(--gold)" />
        <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Načítám sklad…</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="panel" style={{ overflowX: 'auto' }}>
        <h3 style={{ marginBottom: 10, fontSize: '1.1rem' }}>
          Katalog skladu · receptury: {(recipes ?? []).length}
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Název</th>
              <th style={{ padding: '0.5rem' }}>Sekce</th>
              <th style={{ padding: '0.5rem' }}>Stav</th>
              <th style={{ padding: '0.5rem' }}>Min.</th>
              <th style={{ padding: '0.5rem' }}>Ø cena</th>
              <th style={{ padding: '0.5rem' }}>Dodavatel</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const low = i.current_quantity <= i.minimum_quantity
              return (
                <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.55rem' }}>
                    <div style={{ fontWeight: 600 }}>{i.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      {i.barcode || 'bez EAN'} · DPH {i.vat_rate}%
                    </div>
                  </td>
                  <td style={{ padding: '0.55rem', color: 'var(--text-muted)' }}>
                    {i.warehouse_section}
                  </td>
                  <td
                    style={{
                      padding: '0.55rem',
                      color: low ? '#fca5a5' : 'var(--success)',
                      fontWeight: 600,
                    }}
                  >
                    {i.current_quantity} {i.unit}
                  </td>
                  <td style={{ padding: '0.55rem' }}>
                    {i.minimum_quantity} {i.unit}
                  </td>
                  <td style={{ padding: '0.55rem', color: 'var(--gold)' }}>
                    {formatCurrency(i.average_price)}
                  </td>
                  <td style={{ padding: '0.55rem', color: 'var(--text-muted)' }}>{i.supplier}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 10, fontSize: '1.1rem' }}>Poslední pohyby (inventory_logs)</h3>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {(logs ?? []).slice(0, 30).map((log) => {
            const item = items.find((i) => i.id === log.item_id)
            return (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '0.45rem 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.82rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {log.type} · {item?.name || log.item_id}
                  </div>
                  <div style={{ color: 'var(--text-dim)' }}>
                    {new Date(log.timestamp).toLocaleString('cs-CZ')}
                    {log.note ? ` · ${log.note}` : ''}
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    color: log.quantity_changed < 0 ? '#fca5a5' : 'var(--success)',
                  }}
                >
                  {log.quantity_changed > 0 ? '+' : ''}
                  {log.quantity_changed}
                </div>
              </div>
            )
          })}
          {!logs.length && (
            <div style={{ color: 'var(--text-dim)' }}>
              Zatím bez pohybů — proveďte naskladnění nebo POS prodej (např. Mojito).
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
