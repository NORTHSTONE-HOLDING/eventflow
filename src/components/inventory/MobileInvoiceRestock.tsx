import { useRef, useState } from 'react'
import {
  Camera,
  Loader2,
  Sparkles,
  Upload,
  CloudOff,
  PackagePlus,
} from 'lucide-react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { analyzeInvoiceImage } from '../../lib/invoiceVision'
import type { InvoiceVisionResult } from '../../types'
import { useAppStore } from '../../store/useAppStore'
import {
  AiVerificationDashboard,
  type AiVerifyCommitMode,
} from './AiVerificationDashboard'

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

  const handleCommit = async (
    verified: InvoiceVisionResult,
    mode: AiVerifyCommitMode,
  ) => {
    const res = await applyInvoiceRestock(verified, {
      activatePos: mode === 'pos',
    })
    if (!res.ok) {
      setToast(res.error || 'Naskladnění selhalo')
      return
    }
    if (mode === 'pos') {
      setToast(
        `Schváleno do Kasy · nové ${res.created} · aktualizováno ${res.updated} · dlaždice v /pos-terminal`,
      )
    } else {
      setToast(
        `Uloženo pouze do skladu · nové ${res.created} · aktualizováno ${res.updated} (mimo kasu)`,
      )
    }
    setDraft(null)
    setPreview(null)
  }

  if (draft && preview) {
    return (
      <AiVerificationDashboard
        imageUrl={preview}
        draft={draft}
        busy={loading}
        title="Ověřovací okno — faktura / dodák"
        subtitle="Levý sloupec: fotka s pinch-zoom. Pravý sloupec: editovatelná tabulka AI. Nic se neuloží, dokud neschválíte."
        onCancel={() => {
          setDraft(null)
          setPreview(null)
        }}
        onCommit={handleCommit}
      />
    )
  }

  return (
    <div className="inv-mobile-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <PackagePlus size={20} color="var(--emerald)" />
        <div>
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>📸 Mobilní naskladnění faktury/dodáku</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Vyfoťte dodací list — AI Vision vytěží položky a otevře ověřovací dashboard před zápisem.
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
            AI auditor čte českou fakturu — poté otevře ověřovací okno…
          </div>
        )}

        {!draft && !scanning && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Sparkles size={14} color="var(--gold)" />
            Bez klíče AI asistenta v profilu provozovny běží realistická offline simulace. Kontaktujte správu EventFlow pro aktivaci.
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
        '🟢 Synchronizováno s cloudem'
      ) : (
        <>
          <CloudOff size={11} style={{ marginRight: 4 }} /> 🟡 Pracuji v lokálním režimu
        </>
      )}
    </span>
  )
}
