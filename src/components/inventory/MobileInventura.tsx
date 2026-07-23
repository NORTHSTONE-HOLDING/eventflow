import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Barcode,
  CheckCircle2,
  ClipboardList,
  Loader2,
  ScanLine,
  X,
} from 'lucide-react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { inventuraVarianceValue } from '../../lib/inventoryModels'
import { formatCurrency } from '../../lib/documentIds'
import { useAppStore } from '../../store/useAppStore'
import { InventoryPrintReport } from './InventoryPrintReport'

export function MobileInventura() {
  const items = useInventoryStore((s) => s.items)
  const inventura = useInventoryStore((s) => s.inventura)
  const loading = useInventoryStore((s) => s.loading)
  const error = useInventoryStore((s) => s.error)
  const startInventura = useInventoryStore((s) => s.startInventura)
  const setInventuraCount = useInventoryStore((s) => s.setInventuraCount)
  const highlightByBarcode = useInventoryStore((s) => s.highlightByBarcode)
  const closeInventura = useInventoryStore((s) => s.closeInventura)
  const setToast = useAppStore((s) => s.setToast)

  const [focusId, setFocusId] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const [printOpen, setPrintOpen] = useState(false)
  const [closingSummary, setClosingSummary] = useState<{
    mankoValue: number
    prebytekValue: number
  } | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const itemMap = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, i]))
    return m
  }, [items])

  useEffect(() => {
    if (!focusId) return
    const el = rowRefs.current[focusId]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  const applyBarcode = (code: string) => {
    const hit = highlightByBarcode(code)
    if (!hit) {
      setToast(`EAN ${code} nenalezen ve skladu`)
      return
    }
    setFocusId(hit.id)
    setToast(`Nalezeno: ${hit.name}`)
    setScannerOpen(false)
    setManualBarcode('')
  }

  const simulateScan = () => {
    const withBarcode = items.filter((i) => i.barcode)
    if (!withBarcode.length) {
      setToast('Žádné položky s čárovým kódem')
      return
    }
    const pick = withBarcode[Math.floor(Math.random() * withBarcode.length)]
    applyBarcode(pick.barcode || '')
  }

  const handleClose = async () => {
    const res = await closeInventura()
    if (!res.ok) {
      setToast(res.error || 'Uzavření selhalo')
      return
    }
    setClosingSummary({
      mankoValue: res.mankoValue,
      prebytekValue: res.prebytekValue,
    })
    setToast(
      `Inventura uzavřena · manko ${formatCurrency(res.mankoValue)} · přebytek ${formatCurrency(res.prebytekValue)}`
    )
  }

  const counted = inventura?.counts.filter((c) => c.actual_quantity != null).length ?? 0
  const total = inventura?.counts.length ?? 0

  return (
    <div className="inv-mobile-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <ClipboardList size={20} color="var(--emerald)" />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Mobilní Inventura</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Choďte skladem s telefonem — zadejte reálné množství a skenujte EAN.
          </p>
        </div>
      </div>

      {!inventura && (
        <button
          type="button"
          className="btn btn-emerald"
          style={{ width: '100%', minHeight: 52 }}
          onClick={() => {
            startInventura('Hlavní sklad EventFlow')
            setClosingSummary(null)
          }}
        >
          Zahájit fyzickou inventuru
        </button>
      )}

      {inventura && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 12,
              alignItems: 'center',
            }}
          >
            <div>
              <div className="badge badge-gold">{inventura.warehouse_name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Spočítáno {counted}/{total} ·{' '}
                {inventura.status === 'open' ? 'Probíhá' : 'Uzavřeno'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 44 }}
                disabled={inventura.status !== 'open'}
                onClick={() => setScannerOpen(true)}
              >
                <ScanLine size={16} /> Skenovat EAN
              </button>
              {inventura.status === 'closed' && (
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ minHeight: 44 }}
                  onClick={() => setPrintOpen(true)}
                >
                  Tisk Inventury
                </button>
              )}
            </div>
          </div>

          {error && <div className="inv-alert danger">{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '52vh', overflowY: 'auto' }}>
            {inventura.counts.map((row) => {
              const item = itemMap.get(row.item_id)
              if (!item) return null
              const focused = focusId === item.id
              const variance =
                row.actual_quantity != null
                  ? inventuraVarianceValue({
                      expected_quantity: row.expected_quantity,
                      actual_quantity: row.actual_quantity,
                      unit_price: row.unit_price,
                    })
                  : null
              return (
                <div
                  key={row.item_id}
                  ref={(el) => {
                    rowRefs.current[row.item_id] = el
                  }}
                  className="panel"
                  style={{
                    padding: '0.85rem',
                    borderColor: focused ? 'var(--gold)' : 'var(--border)',
                    boxShadow: focused ? 'var(--shadow-gold)' : undefined,
                    background: focused ? 'var(--gold-subtle)' : 'var(--bg-elevated)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {item.warehouse_section} · {item.unit}
                        {item.barcode ? ` · ${item.barcode}` : ''}
                      </div>
                    </div>
                    {variance && variance.kind !== 'ok' && (
                      <span
                        className={`badge ${variance.kind === 'manko' ? 'badge-danger' : 'badge-success'}`}
                      >
                        {variance.kind === 'manko' ? 'Manko' : 'Přebytek'}{' '}
                        {formatCurrency(Math.abs(variance.deltaValue))}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    <div>
                      <label className="label">Očekávané množství (Systémové)</label>
                      <div
                        style={{
                          padding: '0.7rem 0.75rem',
                          borderRadius: 8,
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border)',
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {row.expected_quantity} {item.unit}
                      </div>
                    </div>
                    <div>
                      <label className="label">Reálné nalezené množství</label>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        disabled={inventura.status !== 'open'}
                        value={row.actual_quantity ?? ''}
                        onFocus={() => setFocusId(item.id)}
                        onChange={(e) => {
                          const v = e.target.value
                          setInventuraCount(
                            item.id,
                            v === '' ? null : Number(String(v).replace(',', '.'))
                          )
                        }}
                        placeholder="Zadejte…"
                        style={{ minHeight: 48, fontSize: '1.05rem' }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {inventura.status === 'open' && (
            <button
              type="button"
              className="btn btn-gold"
              style={{ width: '100%', marginTop: 14, minHeight: 54, fontSize: '1rem' }}
              disabled={loading || counted === 0}
              onClick={handleClose}
            >
              {loading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              Uložit a uzavřít inventuru
            </button>
          )}

          {closingSummary && inventura.status === 'closed' && (
            <div className="inv-alert emerald" style={{ marginTop: 12 }}>
              Uzavřeno · Manko {formatCurrency(closingSummary.mankoValue)} · Přebytek{' '}
              {formatCurrency(closingSummary.prebytekValue)}. Logy typu{' '}
              <strong>inventura_rozdil</strong> zapsány.
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {scannerOpen && (
          <BarcodeScannerModal
            manualBarcode={manualBarcode}
            setManualBarcode={setManualBarcode}
            onClose={() => setScannerOpen(false)}
            onSimulate={simulateScan}
            onSubmit={() => applyBarcode(manualBarcode)}
          />
        )}
      </AnimatePresence>

      {printOpen && inventura && (
        <InventoryPrintReport session={inventura} items={items} onClose={() => setPrintOpen(false)} />
      )}
    </div>
  )
}

function BarcodeScannerModal({
  manualBarcode,
  setManualBarcode,
  onClose,
  onSimulate,
  onSubmit,
}: {
  manualBarcode: string
  setManualBarcode: (v: string) => void
  onClose: () => void
  onSimulate: () => void
  onSubmit: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camError, setCamError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamError('Kamera není dostupná — použijte simulaci nebo ruční EAN')
          return
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch {
        setCamError('Přístup ke kameře odepřen — simulace EAN je aktivní')
      }
    })()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        style={{ maxWidth: 420 }}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Barcode size={18} color="var(--gold)" /> Skener čárových kódů
          </h3>
          <button type="button" className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--emerald-border)',
            background: '#000',
            aspectRatio: '4 / 3',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '20% 12%',
              border: '2px solid var(--gold)',
              borderRadius: 8,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '12%',
              right: '12%',
              top: '48%',
              height: 2,
              background: 'var(--emerald)',
              opacity: 0.85,
            }}
          />
        </div>

        {camError && (
          <div className="inv-alert warning" style={{ marginTop: 10 }}>
            {camError}
          </div>
        )}

        <label className="label" style={{ marginTop: 12 }}>
          Ruční EAN / simulace
        </label>
        <input
          className="input"
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          placeholder="např. 8594001100011"
          inputMode="numeric"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={onSimulate}>
            <ScanLine size={15} /> Simulovat sken
          </button>
          <button type="button" className="btn btn-emerald" onClick={onSubmit} disabled={!manualBarcode.trim()}>
            Načíst položku
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
