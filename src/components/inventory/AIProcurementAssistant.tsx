import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CalendarRange,
  FileText,
  Loader2,
  ShoppingCart,
  Sparkles,
} from 'lucide-react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { useAppStore, migrateProject, selectActiveProject } from '../../store/useAppStore'
import {
  buildAiPurchaseList,
  buildPurchaseOrderDocument,
} from '../../lib/recipeEngine'
import { allocateDocumentSequence, formatCurrency } from '../../lib/documentIds'

export function AIProcurementAssistant() {
  const items = useInventoryStore((s) => s.items)
  const recipes = useInventoryStore((s) => s.recipes)
  const loading = useInventoryStore((s) => s.loading)
  const profile = useAppStore((s) => s.profile)
  const projects = useAppStore((s) => s.projects)
  const activeRaw = useAppStore(selectActiveProject)
  const setToast = useAppStore((s) => s.setToast)

  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])
  const [orderDoc, setOrderDoc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const analysis = useMemo(
    () => buildAiPurchaseList(items, project, recipes ?? []),
    [items, project, recipes]
  )

  const generateOrder = async () => {
    if (!analysis.bySupplier.length) {
      setToast('Nákupní seznam je prázdný — sklad pokrývá požadavky')
      return
    }
    setBusy(true)
    try {
      const seq = await allocateDocumentSequence(projects)
      const padded = String(seq).padStart(3, '0')
      const orderNumber = `OBJ${new Date().getFullYear()}${padded}`
      const doc = buildPurchaseOrderDocument({
        profile,
        groups: analysis.bySupplier,
        projectName: project?.name,
        orderNumber,
      })
      setOrderDoc(doc)
      setToast(`Objednávka ${orderNumber} připravena`)
    } catch {
      setToast('Generování objednávky selhalo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inv-mobile-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
        <ShoppingCart size={20} color="var(--gold)" />
        <div>
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>AI Nákupní asistent</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Proaktivní sken skladu: kritické stavy a pokrytí aktivní akce recepturami.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <MiniStat
          icon={AlertTriangle}
          label="Kritický stav"
          value={String(analysis.critical.length)}
          danger={analysis.critical.length > 0}
        />
        <MiniStat
          icon={CalendarRange}
          label="Chybí pro akci"
          value={String(analysis.event.length)}
          danger={analysis.event.length > 0}
        />
        <MiniStat
          icon={Sparkles}
          label="Odhad nákupu"
          value={formatCurrency(analysis.totalEstimate)}
        />
      </div>

      {project ? (
        <div className="inv-alert emerald" style={{ marginBottom: 12 }}>
          Aktivní akce: <strong>{project.name}</strong> · {project.guests} hostů · menu{' '}
          {(project.catering ?? []).length} položek
        </div>
      ) : (
        <div className="inv-alert warning" style={{ marginBottom: 12 }}>
          Není vybrána aktivní akce — hodnotím pouze kritické minimum skladu.
        </div>
      )}

      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={16} color="#fca5a5" /> 🚨 Kritický stav (≤ minimum)
        </h3>
        {!analysis.critical.length ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
            Žádné položky pod minimálním množstvím.
          </p>
        ) : (
          <NeedTable lines={analysis.critical} />
        )}
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <CalendarRange size={16} color="var(--gold)" /> 📅 Požadavek akce (receptury)
        </h3>
        {!analysis.event.length ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
            Sklad pokrývá zbývající porce aktivního menu, nebo není co počítat.
          </p>
        ) : (
          <NeedTable lines={analysis.event} />
        )}
      </section>

      <section style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: 8 }}>AI Nákupní seznam dle dodavatele</h3>
        {!analysis.bySupplier.length ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Seznam je prázdný.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {analysis.bySupplier.map((g) => (
              <motion.div
                key={g.supplier}
                className="panel"
                style={{ padding: '0.85rem', borderColor: 'var(--border-strong)' }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{g.supplier}</strong>
                  <span className="gold-text">{formatCurrency(g.total_czk)}</span>
                </div>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {g.lines.map((l) => (
                    <li key={`${l.name}-${l.unit}`}>
                      {l.name}: objednat <strong style={{ color: 'var(--text)' }}>{l.deficit} {l.unit}</strong>
                      {' '}({l.reason === 'critical_low' ? 'kritický stav' : 'pokrytí akce'})
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        className="btn btn-gold"
        style={{ width: '100%', minHeight: 52 }}
        disabled={busy || loading || !analysis.bySupplier.length}
        onClick={generateOrder}
      >
        {busy ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
        📄 Vygenerovat objednávku pro dodavatele
      </button>

      {orderDoc && (
        <div className="panel" style={{ marginTop: 14, whiteSpace: 'pre-wrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
            <h3 style={{ color: 'var(--text)', margin: 0 }}>Náhled objednávky</h3>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900')
                if (!w) return
                w.document.write(
                  `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;padding:24px">${orderDoc
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')}</pre>`
                )
                w.document.close()
                w.focus()
                w.print()
              }}
            >
              Tisk
            </button>
          </div>
          {orderDoc}
        </div>
      )}
    </div>
  )
}

function NeedTable({
  lines,
}: {
  lines: ReturnType<typeof buildAiPurchaseList>['critical']
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '0.4rem' }}>Položka</th>
            <th style={{ padding: '0.4rem' }}>Sklad</th>
            <th style={{ padding: '0.4rem' }}>Deficit</th>
            <th style={{ padding: '0.4rem' }}>Dodavatel</th>
            <th style={{ padding: '0.4rem' }}>Kč</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.name}-${l.unit}-${l.reason}`} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '0.45rem', fontWeight: 600 }}>{l.name}</td>
              <td style={{ padding: '0.45rem' }}>
                {l.on_hand} {l.unit}
              </td>
              <td style={{ padding: '0.45rem', color: '#fca5a5', fontWeight: 700 }}>
                {l.deficit} {l.unit}
              </td>
              <td style={{ padding: '0.45rem', color: 'var(--text-muted)' }}>{l.supplier}</td>
              <td style={{ padding: '0.45rem', color: 'var(--gold)' }}>
                {formatCurrency(l.estimate_czk)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: typeof AlertTriangle
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div
      className="panel"
      style={{
        padding: '0.75rem',
        borderColor: danger ? 'rgba(239,68,68,0.4)' : undefined,
      }}
    >
      <div className="label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Icon size={12} /> {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          color: danger ? '#fca5a5' : 'var(--gold)',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}
