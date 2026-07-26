import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CalendarRange,
  FileText,
  Loader2,
  Printer,
  ShoppingCart,
  Sparkles,
} from 'lucide-react'
import { formatCzechDate } from '../../lib/czechDate'
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
  const [printReady, setPrintReady] = useState(false)

  const printPurchaseList = () => {
    if (!analysis.bySupplier.length) {
      setToast('Nákupní seznam je prázdný')
      return
    }
    setPrintReady(true)
    document.body.classList.add('ef-print-ai')
    const cleanup = () => {
      document.body.classList.remove('ef-print-ai')
      setPrintReady(false)
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.setTimeout(() => {
      try {
        window.print()
      } catch {
        cleanup()
      }
    }, 80)
  }

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

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
        <button
          type="button"
          className="btn btn-gold"
          style={{ width: '100%', minHeight: 52 }}
          disabled={busy || loading || !analysis.bySupplier.length}
          onClick={generateOrder}
        >
          {busy ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
          📄 Vygenerovat objednávku
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', minHeight: 52, borderColor: '#D4AF37', color: '#D4AF37' }}
          disabled={!analysis.bySupplier.length}
          onClick={printPurchaseList}
          title="Nákupní seznam k vytištění — úsporný černobílý tisk (Makro)"
        >
          <Printer size={16} /> Nákupní seznam k vytištění
        </button>
      </div>

      {orderDoc && (
        <div className="panel no-print" style={{ marginTop: 14, whiteSpace: 'pre-wrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
            <h3 style={{ color: 'var(--text)', margin: 0 }}>Náhled objednávky</h3>
            <button type="button" className="btn btn-ghost" onClick={printPurchaseList}>
              <Printer size={14} /> Tisk
            </button>
          </div>
          {orderDoc}
        </div>
      )}

      {/* Ink-saving B&W print sheet */}
      <div
        className="ai-purchase-print"
        style={{
          display: printReady ? 'block' : 'none',
          background: '#fff',
          color: '#000',
          padding: 20,
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <h1 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 900 }}>
          Nákupní seznam k vytištění
        </h1>
        <div style={{ fontSize: '0.9rem', marginBottom: 14 }}>
          EventFlow · {profile.companyName || 'Agentura'} · {formatCzechDate(new Date())}
          {project ? ` · akce: ${project.name}` : ''}
        </div>
        <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '0 0 12px' }} />
        {analysis.bySupplier.map((g) => (
          <div key={g.supplier} style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px', fontWeight: 800 }}>
              Dodavatel: {g.supplier}
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 0' }}>
                    Položka
                  </th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '4px 0' }}>
                    Objednat
                  </th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '4px 0' }}>
                    Sklad
                  </th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 0' }}>
                    Důvod
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={`${g.supplier}-${l.name}-${l.unit}`}>
                    <td style={{ padding: '5px 0', borderBottom: '1px solid #ccc' }}>{l.name}</td>
                    <td
                      style={{
                        padding: '5px 0',
                        borderBottom: '1px solid #ccc',
                        textAlign: 'right',
                        fontWeight: 700,
                      }}
                    >
                      {l.deficit} {l.unit}
                    </td>
                    <td
                      style={{
                        padding: '5px 0',
                        borderBottom: '1px solid #ccc',
                        textAlign: 'right',
                      }}
                    >
                      {l.on_hand} {l.unit}
                    </td>
                    <td style={{ padding: '5px 0', borderBottom: '1px solid #ccc' }}>
                      {l.reason === 'critical_low' ? 'kritický stav' : 'pokrytí akce'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: 6, fontWeight: 700 }}>
              Mezisoučet odhad: {formatCurrency(g.total_czk)}
            </div>
          </div>
        ))}
        <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '12px 0' }} />
        <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>
          Celkem odhad: {formatCurrency(analysis.totalEstimate)}
        </div>
        <p style={{ fontSize: '0.75rem', marginTop: 16, color: '#333' }}>
          Černobílý tisk pro velkoobchod (Makro aj.). Zaškrtněte položky při nákupu.
        </p>
      </div>
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
