import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Camera,
  CheckCircle2,
  Loader2,
  Sparkles,
  Upload,
  CloudOff,
  PackagePlus,
} from 'lucide-react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { analyzeInvoiceImage } from '../../lib/invoiceVision'
import { formatCurrency } from '../../lib/documentIds'
import type { InvoiceVisionResult } from '../../types'
import { useAppStore } from '../../store/useAppStore'

export function MobileInvoiceRestock() {
  const loading = useInventoryStore((s) => s.loading)
  const error = useInventoryStore((s) => s.error)
  const applyInvoiceRestock = useInventoryStore((s) => s.applyInvoiceRestock)
  const setToast = useAppStore((s) => s.setToast)
  const fileRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [draft, setDraft] = useState<InvoiceVisionResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const totalLines = draft?.items?.length ?? 0
  const totalValue = useMemo(
    () =>
      (draft?.items ?? []).reduce(
        (s, i) => s + i.quantity * i.purchase_price_ex_vat,
        0
      ),
    [draft]
  )

  const onPick = async (file: File | null) => {
    if (!file) return
    setScanError(null)
    setDraft(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    setScanning(true)
    try {
      const result = await analyzeInvoiceImage(file)
      setDraft(result)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Analýza faktury selhala')
    } finally {
      setScanning(false)
    }
  }

  const confirmRestock = async () => {
    if (!draft) return
    const res = await applyInvoiceRestock(draft)
    if (!res.ok) {
      setToast(res.error || 'Naskladnění selhalo')
      return
    }
    setToast(
      `Naskladněno · nové ${res.created} · aktualizováno ${res.updated} položek`
    )
    setDraft(null)
    setPreview(null)
  }

  return (
    <div className="inv-mobile-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <PackagePlus size={20} color="var(--emerald)" />
        <div>
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>📸 Mobilní naskladnění faktury/dodáku</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Vyfoťte dodací list — AI Vision (gpt-4o-mini) vytěží položky a naskladní sklad.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />

      <div style={{ display: 'grid', gap: 10 }}>
        <button
          type="button"
          className="btn btn-gold"
          style={{ minHeight: 56, fontSize: '1.05rem' }}
          disabled={scanning || loading}
          onClick={() => fileRef.current?.click()}
        >
          {scanning ? <Loader2 size={18} className="spin" /> : <Camera size={18} />}
          {scanning ? 'Analyzuji fakturu…' : 'Otevřít fotoaparát / nahrát'}
        </button>

        {preview && (
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--emerald-border)',
              maxHeight: 220,
            }}
          >
            <img
              src={preview}
              alt="Náhled faktury"
              style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 220 }}
            />
          </div>
        )}

        {(scanError || error) && (
          <div className="inv-alert danger">{scanError || error}</div>
        )}

        {scanning && (
          <div className="inv-alert emerald" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Loader2 size={18} className="spin" />
            AI auditor čte českou fakturu…
          </div>
        )}

        {draft && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="panel"
            style={{ borderColor: 'var(--emerald-border)', background: 'var(--emerald-subtle)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div className="label">Dodavatel</div>
                <div style={{ fontWeight: 600 }}>{draft.supplier_name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  IČO {draft.ico} · {draft.date}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label">Položky / bez DPH</div>
                <div className="gold-text" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                  {totalLines} · {formatCurrency(totalValue)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {draft.items.map((it, idx) => (
                <div
                  key={`${it.name}-${idx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8,
                    padding: '0.55rem 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{it.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {it.quantity} {it.unit} · DPH {it.vat_rate}%
                      {it.barcode ? ` · EAN ${it.barcode}` : ''}
                    </div>
                  </div>
                  <div style={{ color: 'var(--gold)', fontWeight: 600 }}>
                    {formatCurrency(it.purchase_price_ex_vat)}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-emerald"
              style={{ width: '100%', marginTop: 14, minHeight: 52 }}
              disabled={loading}
              onClick={confirmRestock}
            >
              {loading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              Potvrdit naskladnění do skladu
            </button>
            <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Existující položky (název/EAN) se navýší · nové se založí · log typu{' '}
              <strong>naskladneni</strong>.
            </p>
          </motion.div>
        )}

        {!draft && !scanning && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Sparkles size={14} color="var(--gold)" />
            Bez OpenAI klíče běží realistická offline simulace podle názvu souboru.
            <Upload size={14} />
          </div>
        )}
      </div>
    </div>
  )
}

export function SyncBadge() {
  const syncMode = useInventoryStore((s) => s.syncMode)
  const lastSyncedAt = useInventoryStore((s) => s.lastSyncedAt)
  return (
    <span
      className={`badge ${syncMode === 'online' ? 'badge-success' : 'badge-warning'}`}
      title={lastSyncedAt || undefined}
    >
      {syncMode === 'online' ? (
        'Supabase online'
      ) : (
        <>
          <CloudOff size={11} style={{ marginRight: 4 }} /> Offline záloha
        </>
      )}
    </span>
  )
}
