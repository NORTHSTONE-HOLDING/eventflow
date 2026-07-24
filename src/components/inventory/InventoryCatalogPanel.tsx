import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { useAppStore } from '../../store/useAppStore'
import { formatCurrency } from '../../lib/documentIds'
import { formatCzechDateTime } from '../../lib/czechDate'
import { formatStockWithPack } from '../../lib/unitConversion'
import {
  importGastroSpreadsheet,
  type GastroImportDraft,
} from '../../lib/gastroImporter'
import type { InventoryItem, InventoryUnit } from '../../types'

const GOLD = '#D4AF37'
const UNITS: Array<InventoryUnit | string> = ['ks', 'kg', 'l', 'ml', 'g', 'porce']
const CATEGORIES = [
  { value: 'raw', label: 'Jídlo' },
  { value: 'beverage', label: 'Pití' },
  { value: 'package', label: 'Inventář' },
]

type EditForm = {
  id?: string
  name: string
  barcode: string
  category: string
  unit: string
  current_quantity: string
  minimum_quantity: string
  purchase_price: string
  sale_price: string
  vat_rate: string
  pack_volume: string
  supplier: string
}

function emptyQuickForm(): EditForm {
  return {
    name: '',
    barcode: '',
    category: 'raw',
    unit: 'ks',
    current_quantity: '0',
    minimum_quantity: '1',
    purchase_price: '0',
    sale_price: '0',
    vat_rate: '12',
    pack_volume: '',
    supplier: '',
  }
}

function itemToForm(item: InventoryItem): EditForm {
  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode || '',
    category: item.category || 'raw',
    unit: String(item.unit || 'ks'),
    current_quantity: String(item.current_quantity ?? 0),
    minimum_quantity: String(item.minimum_quantity ?? 0),
    purchase_price: String(item.purchase_price ?? 0),
    sale_price: String(item.sale_price ?? 0),
    vat_rate: String(item.vat_rate ?? 12),
    pack_volume: item.pack_volume != null ? String(item.pack_volume) : '',
    supplier: item.supplier || '',
  }
}

export function InventoryCatalogPanel() {
  const items = useInventoryStore((s) => s.items)
  const logs = useInventoryStore((s) => s.logs)
  const recipes = useInventoryStore((s) => s.recipes)
  const loading = useInventoryStore((s) => s.loading)
  const upsertInventoryItem = useInventoryStore((s) => s.upsertInventoryItem)
  const importGastroDrafts = useInventoryStore((s) => s.importGastroDrafts)
  const applyAiCopilotCommand = useInventoryStore((s) => s.applyAiCopilotCommand)
  const setToast = useAppStore((s) => s.setToast)

  const [edit, setEdit] = useState<EditForm | null>(null)
  const [quick, setQuick] = useState<EditForm>(() => emptyQuickForm())
  const [aiCommand, setAiCommand] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiBanner, setAiBanner] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importPreview, setImportPreview] = useState<GastroImportDraft[]>([])
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const sorted = useMemo(
    () =>
      [...(items ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' }),
      ),
    [items],
  )

  const saveForm = async (form: EditForm, closeAfter: boolean) => {
    if (!form.name.trim()) {
      setToast('Zadejte název položky')
      return
    }
    const res = await upsertInventoryItem({
      id: form.id,
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      category: form.category,
      unit: form.unit,
      current_quantity: Number(form.current_quantity) || 0,
      minimum_quantity: Number(form.minimum_quantity) || 0,
      purchase_price: Number(form.purchase_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      vat_rate: Number(form.vat_rate) || 12,
      pack_volume: form.pack_volume.trim() ? Number(form.pack_volume) : null,
      supplier: form.supplier.trim(),
    })
    if (!res.ok) {
      setToast(res.error || 'Uložení selhalo')
      return
    }
    setToast(form.id ? 'Změny uloženy' : 'Položka naskladněna')
    if (closeAfter) setEdit(null)
    else setQuick(emptyQuickForm())
  }

  const runAi = async () => {
    setAiBusy(true)
    setAiBanner(null)
    try {
      const res = await applyAiCopilotCommand(aiCommand)
      setAiBanner(res.message)
      setToast(res.message)
    } finally {
      setAiBusy(false)
    }
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    setImportBusy(true)
    setImportMsg('')
    try {
      const res = await importGastroSpreadsheet(file)
      setImportMsg(res.message)
      setImportPreview(res.items)
      if (!res.ok) setToast(res.message)
    } finally {
      setImportBusy(false)
    }
  }

  const commitImport = async () => {
    if (!importPreview.length) return
    setImportBusy(true)
    try {
      const res = await importGastroDrafts(importPreview)
      if (!res.ok) {
        setToast(res.error || 'Import selhal')
        return
      }
      setToast(`Import hotov · nové ${res.created} · aktualizované ${res.updated}`)
      setImportPreview([])
      setImportOpen(false)
    } finally {
      setImportBusy(false)
    }
  }

  if (loading && !items.length) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader2 className="spin" size={22} color={GOLD} />
        <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Načítám sklad…</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* AI Co-pilot */}
      <div
        className="panel"
        style={{
          borderColor: `${GOLD}66`,
          background: 'linear-gradient(135deg, rgba(212,175,55,0.08), #0f172a 55%)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <Sparkles size={18} color={GOLD} />
          <strong style={{ color: GOLD, fontSize: '1.05rem' }}>🤖 AI Skladový Asistent</strong>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 10,
            alignItems: 'stretch',
          }}
        >
          <input
            className="input"
            value={aiCommand}
            onChange={(e) => setAiCommand(e.target.value)}
            placeholder="Příkaz pro AI: Např. 'Zvedni cenu vína o 15%' nebo 'Přepiš názvy jídel do luxusního stylu'..."
            style={{ minHeight: 52, background: '#020617', borderColor: '#334155' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runAi()
            }}
          />
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 52, fontWeight: 900, minWidth: 160 }}
            disabled={aiBusy || !aiCommand.trim()}
            onClick={() => void runAi()}
          >
            {aiBusy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            Provést úpravy
          </button>
        </div>
        {aiBanner && (
          <div
            style={{
              marginTop: 10,
              padding: '0.75rem 1rem',
              borderRadius: 10,
              border: `1px solid ${GOLD}`,
              background: 'rgba(212,175,55,0.12)',
              color: '#fef3c7',
              fontWeight: 700,
            }}
          >
            {aiBanner}
          </div>
        )}
      </div>

      {/* Quick restock + import */}
      <div className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 12,
            alignItems: 'center',
          }}
        >
          <strong style={{ color: GOLD, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <Plus size={16} /> ➕ Rychlé ruční naskladnění
          </strong>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 44, borderColor: GOLD, color: GOLD }}
            onClick={() => setImportOpen((v) => !v)}
          >
            <Download size={15} /> 📥 Importovat data ze starého systému (CSV/Excel)
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8,
          }}
        >
          <Field label="Název" value={quick.name} onChange={(v) => setQuick({ ...quick, name: v })} />
          <Field
            label="Kategorie"
            as="select"
            value={quick.category}
            onChange={(v) => setQuick({ ...quick, category: v })}
            options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />
          <Field
            label="Jednotka"
            as="select"
            value={quick.unit}
            onChange={(v) => setQuick({ ...quick, unit: v })}
            options={UNITS.map((u) => ({ value: u, label: u }))}
          />
          <Field
            label="Množství skladem"
            value={quick.current_quantity}
            onChange={(v) => setQuick({ ...quick, current_quantity: v })}
          />
          <Field
            label="Minimální množství"
            value={quick.minimum_quantity}
            onChange={(v) => setQuick({ ...quick, minimum_quantity: v })}
          />
          <Field
            label="Nákupní cena"
            value={quick.purchase_price}
            onChange={(v) => setQuick({ ...quick, purchase_price: v })}
          />
        </div>
        <button
          type="button"
          className="btn btn-gold"
          style={{ marginTop: 12, minHeight: 48, fontWeight: 900 }}
          onClick={() => void saveForm(quick, false)}
        >
          <Save size={15} /> Uložit
        </button>
      </div>

      <AnimatePresence>
        {importOpen && (
          <motion.div
            className="panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{ borderColor: `${GOLD}66` }}
          >
            <strong style={{ color: GOLD }}>Universal Gastro Migrace</strong>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '8px 0 12px' }}>
              Nahrajte CSV/Excel ze starého systému. AI (nebo lokální parser) zařadí položky do
              Jídlo / Pití / Inventář, doplní EAN a ceny.
            </p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void onFile(e.dataTransfer.files?.[0] || null)
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${GOLD}`,
                borderRadius: 14,
                padding: '2rem 1rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(212,175,55,0.06)',
                touchAction: 'manipulation',
              }}
            >
              <Upload size={28} color={GOLD} />
              <div style={{ marginTop: 8, fontWeight: 800, color: '#e2e8f0' }}>
                Přetáhněte soubor nebo klepněte pro výběr
              </div>
              <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: 4 }}>
                .csv · .xlsx · .xls · .txt
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,.txt,text/csv"
                hidden
                onChange={(e) => void onFile(e.target.files?.[0] || null)}
              />
            </div>
            {importBusy && (
              <div style={{ marginTop: 10, color: GOLD, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Loader2 className="spin" size={16} /> Zpracovávám migraci…
              </div>
            )}
            {importMsg && (
              <div style={{ marginTop: 10, color: '#cbd5e1', fontWeight: 600 }}>{importMsg}</div>
            )}
            {importPreview.length > 0 && (
              <>
                <div
                  style={{
                    marginTop: 12,
                    maxHeight: 220,
                    overflow: 'auto',
                    border: '1px solid #334155',
                    borderRadius: 10,
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: 8 }}>Název</th>
                        <th style={{ padding: 8 }}>Kat.</th>
                        <th style={{ padding: 8 }}>MJ</th>
                        <th style={{ padding: 8 }}>Qty</th>
                        <th style={{ padding: 8 }}>EAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 40).map((row, i) => (
                        <tr key={`${row.name}-${i}`} style={{ borderTop: '1px solid #1e293b' }}>
                          <td style={{ padding: 8 }}>{row.name}</td>
                          <td style={{ padding: 8 }}>{row.category}</td>
                          <td style={{ padding: 8 }}>{row.unit}</td>
                          <td style={{ padding: 8 }}>{row.quantity}</td>
                          <td style={{ padding: 8 }}>{row.barcode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ marginTop: 12, minHeight: 48, fontWeight: 900 }}
                  disabled={importBusy}
                  onClick={() => void commitImport()}
                >
                  Potvrdit import ({importPreview.length})
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Catalog table */}
      <div className="panel" style={{ overflowX: 'auto' }}>
        <h3 style={{ marginBottom: 10, fontSize: '1.1rem' }}>
          Katalog skladu · receptury: {(recipes ?? []).length} · klepněte na ✏️ nebo dvojklik řádku
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Název</th>
              <th style={{ padding: '0.5rem' }}>EAN</th>
              <th style={{ padding: '0.5rem' }}>Stav</th>
              <th style={{ padding: '0.5rem' }}>Min.</th>
              <th style={{ padding: '0.5rem' }}>Nákup</th>
              <th style={{ padding: '0.5rem' }}>Prodej</th>
              <th style={{ padding: '0.5rem' }}>DPH</th>
              <th style={{ padding: '0.5rem' }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((i) => {
              const low = i.current_quantity <= i.minimum_quantity
              return (
                <tr
                  key={i.id}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onDoubleClick={() => setEdit(itemToForm(i))}
                >
                  <td style={{ padding: '0.55rem' }}>
                    <div style={{ fontWeight: 700 }}>{i.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      {CATEGORIES.find((c) => c.value === i.category)?.label || i.category} ·{' '}
                      {i.warehouse_section}
                    </div>
                  </td>
                  <td style={{ padding: '0.55rem', color: '#94a3b8' }}>{i.barcode || '—'}</td>
                  <td
                    style={{
                      padding: '0.55rem',
                      color: low ? '#fca5a5' : 'var(--success)',
                      fontWeight: 700,
                    }}
                  >
                    {formatStockWithPack(i)}
                  </td>
                  <td style={{ padding: '0.55rem' }}>
                    {i.minimum_quantity} {i.unit}
                  </td>
                  <td style={{ padding: '0.55rem', color: GOLD }}>
                    {formatCurrency(i.purchase_price)}
                  </td>
                  <td style={{ padding: '0.55rem', color: '#e2e8f0' }}>
                    {formatCurrency(i.sale_price || 0)}
                  </td>
                  <td style={{ padding: '0.55rem' }}>{i.vat_rate}%</td>
                  <td style={{ padding: '0.55rem' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 40, minWidth: 40, padding: 8, borderColor: GOLD }}
                      title="Upravit položku"
                      onClick={() => setEdit(itemToForm(i))}
                    >
                      <Pencil size={14} color={GOLD} />
                    </button>
                  </td>
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
          {(logs ?? []).slice(0, 40).map((log) => {
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
                    {formatCzechDateTime(log.timestamp)}
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
              Zatím bez pohybů — proveďte naskladnění nebo POS prodej (např. Mojito / Panák).
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {edit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 8000,
              background: 'rgba(2,6,23,0.78)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              touchAction: 'manipulation',
            }}
            onClick={() => setEdit(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(96vw, 640px)',
                maxHeight: '92vh',
                overflow: 'auto',
                background: '#0f172a',
                border: `2px solid ${GOLD}`,
                borderRadius: 16,
                padding: '1.15rem 1.25rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 12,
                  alignItems: 'center',
                }}
              >
                <strong style={{ color: GOLD, fontSize: '1.1rem' }}>
                  Ruční úprava položky
                </strong>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 40 }}
                  onClick={() => setEdit(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <Field label="Název" value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
                <Field
                  label="Čárový kód"
                  value={edit.barcode}
                  onChange={(v) => setEdit({ ...edit, barcode: v })}
                />
                <Field
                  label="Kategorie"
                  as="select"
                  value={edit.category}
                  onChange={(v) => setEdit({ ...edit, category: v })}
                  options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                />
                <Field
                  label="Jednotka"
                  as="select"
                  value={edit.unit}
                  onChange={(v) => setEdit({ ...edit, unit: v })}
                  options={UNITS.map((u) => ({ value: u, label: u }))}
                />
                <Field
                  label="Množství skladem"
                  value={edit.current_quantity}
                  onChange={(v) => setEdit({ ...edit, current_quantity: v })}
                />
                <Field
                  label="Minimální limit"
                  value={edit.minimum_quantity}
                  onChange={(v) => setEdit({ ...edit, minimum_quantity: v })}
                />
                <Field
                  label="Nákupní cena"
                  value={edit.purchase_price}
                  onChange={(v) => setEdit({ ...edit, purchase_price: v })}
                />
                <Field
                  label="Prodejní cena"
                  value={edit.sale_price}
                  onChange={(v) => setEdit({ ...edit, sale_price: v })}
                />
                <Field
                  label="Sazba DPH %"
                  value={edit.vat_rate}
                  onChange={(v) => setEdit({ ...edit, vat_rate: v })}
                />
                <Field
                  label="Objem balení (l) — láhev/sud"
                  value={edit.pack_volume}
                  onChange={(v) => setEdit({ ...edit, pack_volume: v })}
                />
                <Field
                  label="Dodavatel"
                  value={edit.supplier}
                  onChange={(v) => setEdit({ ...edit, supplier: v })}
                />
              </div>
              <button
                type="button"
                className="btn btn-gold"
                style={{ marginTop: 16, minHeight: 52, width: '100%', fontWeight: 900 }}
                onClick={() => void saveForm(edit, true)}
              >
                <Save size={16} /> Uložit změny
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  as,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  as?: 'select'
  options?: Array<{ value: string; label: string }>
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="label" style={{ margin: 0 }}>
        {label}
      </span>
      {as === 'select' ? (
        <select
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight: 44, background: '#020617', borderColor: '#334155' }}
        >
          {(options || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight: 44, background: '#020617', borderColor: '#334155' }}
        />
      )}
    </label>
  )
}
