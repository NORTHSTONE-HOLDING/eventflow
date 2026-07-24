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
import { InventoryCatalogPanel } from './InventoryCatalogPanel'
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
        {tab === 'overview' && <InventoryCatalogPanel />}
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
