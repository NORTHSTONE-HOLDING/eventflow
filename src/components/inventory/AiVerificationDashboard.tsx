import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Loader2,
  ShoppingBag,
  Store,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  X,
} from 'lucide-react'
import type { AiScanConfidence, InvoiceVisionLine, InvoiceVisionResult } from '../../types'
import { formatCurrency } from '../../lib/documentIds'
import { formatCzechDate } from '../../lib/czechDate'
import {
  BUILTIN_INVENTORY_CATEGORIES,
  findCategoryDef,
} from '../../lib/inventoryCategories'
import { useCategoryRegistryStore } from '../../store/useCategoryRegistryStore'

export type AiVerifyCommitMode = 'sklad' | 'pos'

type Props = {
  imageUrl: string
  draft: InvoiceVisionResult
  busy?: boolean
  title?: string
  subtitle?: string
  onCancel: () => void
  onCommit: (
    verified: InvoiceVisionResult,
    mode: AiVerifyCommitMode,
  ) => void | Promise<void>
}

function confidenceOf(line: InvoiceVisionLine): AiScanConfidence {
  if (line.confidence === 'high' || line.confidence === 'low') return line.confidence
  const score = Number(line.confidence_score)
  if (Number.isFinite(score) && score < 70) return 'low'
  return 'high'
}

function cloneDraft(draft: InvoiceVisionResult): InvoiceVisionResult {
  return {
    ...draft,
    items: (draft.items ?? []).map((it) => ({
      ...it,
      confidence: confidenceOf(it),
      confidence_score:
        it.confidence_score != null
          ? Number(it.confidence_score)
          : confidenceOf(it) === 'low'
            ? 58
            : 90,
      sale_price:
        it.sale_price != null && Number(it.sale_price) > 0
          ? Number(it.sale_price)
          : Number(it.purchase_price_ex_vat) > 0
            ? Math.round(Number(it.purchase_price_ex_vat) * 1.8 * 100) / 100
            : 0,
      category: it.category || 'Jídlo',
      subcategory: it.subcategory || 'Ostatní',
    })),
  }
}

/**
 * Ověřovací okno — split-screen AI Verification Dashboard.
 * Left: pinch-to-zoom photo · Right: editable extracted fields + dual commit.
 */
export function AiVerificationDashboard({
  imageUrl,
  draft,
  busy = false,
  title = 'Ověřovací okno AI skenu',
  subtitle = 'Zkontrolujte vytěžená data před zápisem do skladu nebo kasy. Žluté řádky vyžadují dvojitou kontrolu.',
  onCancel,
  onCommit,
}: Props) {
  const [verified, setVerified] = useState(() => cloneDraft(draft))
  const getAllCategories = useCategoryRegistryStore((s) => s.getAllCategories)
  const categories = useMemo(() => {
    const all = getAllCategories()
    return all.length ? all : BUILTIN_INVENTORY_CATEGORIES
  }, [getAllCategories])

  const lowCount = useMemo(
    () => verified.items.filter((it) => confidenceOf(it) === 'low').length,
    [verified.items],
  )

  const updateLine = useCallback((index: number, patch: Partial<InvoiceVisionLine>) => {
    setVerified((prev) => ({
      ...prev,
      items: prev.items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))
  }, [])

  const removeLine = useCallback((index: number) => {
    setVerified((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }, [])

  const commit = async (mode: AiVerifyCommitMode) => {
    const clean: InvoiceVisionResult = {
      ...verified,
      items: verified.items
        .map((it) => ({
          ...it,
          name: String(it.name || '').trim(),
          quantity: Number(it.quantity) || 0,
          purchase_price_ex_vat: Number(it.purchase_price_ex_vat) || 0,
          sale_price: Number(it.sale_price) || 0,
          vat_rate: Number(it.vat_rate) || 12,
          unit: String(it.unit || 'ks').trim() || 'ks',
          confidence: confidenceOf(it),
        }))
        .filter((it) => it.name && it.quantity > 0),
    }
    await onCommit(clean, mode)
  }

  return (
    <motion.div
      className="ai-verify-shell"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="ai-verify-header">
        <div>
          <h2 className="ai-verify-title gold-text">{title}</h2>
          <p className="ai-verify-sub">{subtitle}</p>
        </div>
        <button type="button" className="btn btn-ghost ai-verify-close" onClick={onCancel} disabled={busy}>
          <X size={16} /> Zrušit
        </button>
      </div>

      <div className="ai-verify-meta">
        <div>
          <div className="label">Dodavatel / zdroj</div>
          <div style={{ fontWeight: 600 }}>{verified.supplier_name || '—'}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            IČO {verified.ico || '—'} · {formatCzechDate(verified.date)}
            {verified.source_kind ? ` · ${verified.source_kind}` : ''}
          </div>
        </div>
        <div className="ai-verify-meta-stats">
          <span className="badge badge-gold">{verified.items.length} položek</span>
          {lowCount > 0 ? (
            <span className="badge badge-warning">
              <AlertTriangle size={12} style={{ marginRight: 4 }} />
              {lowCount}× nízká jistota
            </span>
          ) : (
            <span className="badge badge-success">Vysoká jistota AI</span>
          )}
        </div>
      </div>

      <div className="ai-verify-split">
        <div className="ai-verify-left">
          <PinchZoomImage src={imageUrl} alt="Nahraná fotka dokladu" />
        </div>

        <div className="ai-verify-right">
          <div className="ai-verify-table-wrap">
            <table className="ai-verify-table">
              <thead>
                <tr>
                  <th>Název</th>
                  <th>Cena nákup</th>
                  <th>Prodej</th>
                  <th>Množ.</th>
                  <th>Jedn.</th>
                  <th>Kategorie</th>
                  <th>Podkategorie</th>
                  <th>DPH</th>
                  <th>AI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {verified.items.map((row, idx) => {
                  const conf = confidenceOf(row)
                  const score = row.confidence_score ?? (conf === 'low' ? 58 : 90)
                  return (
                    <tr
                      key={`ai-row-${idx}`}
                      className={
                        conf === 'low' ? 'ai-verify-row ai-verify-row-low' : 'ai-verify-row ai-verify-row-high'
                      }
                    >
                      <td>
                        <input
                          className="ai-verify-input"
                          value={row.name}
                          onChange={(e) => updateLine(idx, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="ai-verify-input ai-verify-num"
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.purchase_price_ex_vat}
                          onChange={(e) =>
                            updateLine(idx, {
                              purchase_price_ex_vat: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="ai-verify-input ai-verify-num"
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.sale_price ?? 0}
                          onChange={(e) =>
                            updateLine(idx, { sale_price: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="ai-verify-input ai-verify-num"
                          type="number"
                          min={0}
                          step="0.001"
                          value={row.quantity}
                          onChange={(e) =>
                            updateLine(idx, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="ai-verify-input"
                          value={row.unit || 'ks'}
                          onChange={(e) => updateLine(idx, { unit: e.target.value })}
                        >
                          {['ks', 'kg', 'l', 'ml', 'g', 'porce'].map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="ai-verify-input"
                          value={row.category || categories[0]?.label || 'Jídlo'}
                          onChange={(e) => {
                            const cat = categories.find(
                              (c) => c.id === e.target.value || c.label === e.target.value,
                            )
                            updateLine(idx, {
                              category: cat?.label || e.target.value,
                              subcategory: cat?.subs[0]?.label || 'Ostatní',
                            })
                          }}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.label}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="ai-verify-input"
                          value={row.subcategory || ''}
                          onChange={(e) => updateLine(idx, { subcategory: e.target.value })}
                          list={`ai-sub-${idx}`}
                        />
                        <datalist id={`ai-sub-${idx}`}>
                          {(findCategoryDef(categories, row.category || '')?.subs || []).map(
                            (s) => (
                              <option key={s.id} value={s.label} />
                            ),
                          )}
                        </datalist>
                      </td>
                      <td>
                        <select
                          className="ai-verify-input ai-verify-num"
                          value={row.vat_rate}
                          onChange={(e) =>
                            updateLine(idx, { vat_rate: Number(e.target.value) || 12 })
                          }
                        >
                          <option value={21}>21%</option>
                          <option value={12}>12%</option>
                          <option value={0}>0%</option>
                        </select>
                      </td>
                      <td>
                        <span
                          className={
                            conf === 'low' ? 'ai-conf-chip ai-conf-low' : 'ai-conf-chip ai-conf-high'
                          }
                          title={
                            conf === 'low'
                              ? 'Nízká jistota — ověřte proti fotce'
                              : 'Vysoká jistota — čitelný tisk'
                          }
                        >
                          {conf === 'low' ? '🟡' : '🟢'} {score}%
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost ai-verify-trash"
                          title="Odstranit řádek"
                          onClick={() => removeLine(idx)}
                          disabled={busy}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {verified.items.length === 0 && (
              <div className="ai-verify-empty">Žádné položky k ověření — nahrajte fotku znovu.</div>
            )}
          </div>

          <div className="ai-verify-legend">
            <span className="ai-conf-chip ai-conf-high">🟢 Vysoká jistota — čitelný tisk</span>
            <span className="ai-conf-chip ai-conf-low">
              🟡 Nízká jistota — rukopis / rozmazané (zkontrolujte)
            </span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
              Součet nákup: {formatCurrency(
                verified.items.reduce(
                  (s, i) => s + (Number(i.quantity) || 0) * (Number(i.purchase_price_ex_vat) || 0),
                  0,
                ),
              )}
            </span>
          </div>

          <div className="ai-verify-actions">
            <button
              type="button"
              className="btn ai-verify-btn-sklad"
              disabled={busy || verified.items.length === 0}
              onClick={() => void commit('sklad')}
            >
              {busy ? <Loader2 size={18} className="spin" /> : <Store size={18} />}
              🟢 Schválit a uložit POUZE DO SKLADU
            </button>
            <button
              type="button"
              className="btn ai-verify-btn-pos"
              disabled={busy || verified.items.length === 0}
              onClick={() => void commit('pos')}
            >
              {busy ? <Loader2 size={18} className="spin" /> : <ShoppingBag size={18} />}
              💛 Schválit a OKAMŽITĚ PRODÁVAT (Aktivovat v Kase)
            </button>
          </div>
          <p className="ai-verify-hint">
            <CheckCircle2 size={14} style={{ marginRight: 6 }} />
            Sklad = <code>pos_visible: false</code> · Kasa = <code>pos_visible: true</code> + grafické
            dlaždice v <strong>/pos-terminal</strong>.
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function PinchZoomImage({ src, alt }: { src: string; alt: string }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null)
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const reset = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  useEffect(() => {
    reset()
  }, [src])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.12 : 0.12
    setScale((s) => Math.min(5, Math.max(1, Math.round((s + delta) * 100) / 100)))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      pinchStart.current = { dist: dist || 1, scale }
      dragStart.current = null
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = Array.from(pointers.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const next = pinchStart.current.scale * (dist / pinchStart.current.dist)
      setScale(Math.min(5, Math.max(1, next)))
      return
    }
    if (dragStart.current && scale > 1) {
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 0) dragStart.current = null
  }

  return (
    <div className="ai-zoom-panel">
      <div className="ai-zoom-toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => setScale((s) => Math.min(5, s + 0.25))}>
          <ZoomIn size={15} />
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setScale((s) => Math.max(1, s - 0.25))}>
          <ZoomOut size={15} />
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          <RotateCcw size={15} /> Reset
        </button>
        <span className="ai-zoom-label">{Math.round(scale * 100)}%</span>
      </div>
      <div
        ref={viewportRef}
        className="ai-zoom-viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            touchAction: 'none',
            userSelect: 'none',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transition: pointers.current.size ? 'none' : 'transform 0.12s ease',
          }}
        />
      </div>
      <div className="ai-zoom-hint">Pinch / kolečko myši = zoom · táhnutí = posun</div>
    </div>
  )
}
