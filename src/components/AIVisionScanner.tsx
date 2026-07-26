import { useCallback, useRef, useState } from 'react'
import { Camera, Upload, Loader2, Lock } from 'lucide-react'
import { useAppStore, selectActiveProject } from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import { analyzeInvoiceImage } from '../lib/invoiceVision'
import { hasVenueOpenAiKey } from '../lib/openaiClient'
import type { InvoiceVisionResult } from '../types'
import { useInventoryStore } from '../store/useInventoryStore'
import {
  AiVerificationDashboard,
  type AiVerifyCommitMode,
} from './inventory/AiVerificationDashboard'

export { PrintLayoutEngine, PrintMenuEngine } from './PrintMenuEngine'

export function AIVisionScanner() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const project = useAppStore(selectActiveProject)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)
  const applyInvoiceRestock = useInventoryStore((s) => s.applyInvoiceRestock)
  const inventoryLoading = useInventoryStore((s) => s.loading)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [draft, setDraft] = useState<InvoiceVisionResult | null>(null)
  const [lastSummary, setLastSummary] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const unlocked = hasFeature(subscription, 'BUSINESS')
  const visionUnlocked = hasFeature(subscription, 'ENTERPRISE')

  const processFile = useCallback(
    async (file: File) => {
      if (!unlocked) {
        setToast('AI Scanner vyžaduje tarif BUSINESS+')
        return
      }
      if (!visionUnlocked && file.type.startsWith('image/')) {
        setToast('Photo Menu Scan vyžaduje ENTERPRISE — běží ověřovací simulace…')
      }
      setScanning(true)
      setDraft(null)
      setLastSummary(null)
      try {
        const url = URL.createObjectURL(file)
        setPreview(url)
        const result = await analyzeInvoiceImage(file)
        setDraft(result)
        setToast(
          hasVenueOpenAiKey()
            ? `AI vytěžila ${result.items.length} položek — ověřte před zápisem`
            : `Simulace skenu: ${result.items.length} položek · kontaktujte správu EventFlow pro klíč AI asistenta`,
        )
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Skenování selhalo')
      } finally {
        setScanning(false)
      }
    },
    [unlocked, visionUnlocked, setToast],
  )

  const handleCommit = async (
    verified: InvoiceVisionResult,
    mode: AiVerifyCommitMode,
  ) => {
    const res = await applyInvoiceRestock(verified, {
      activatePos: mode === 'pos',
    })
    if (!res.ok) {
      setToast(res.error || 'Uložení selhalo')
      return
    }
    const summary =
      mode === 'pos'
        ? `Aktivováno v Kase · ${res.created} nových · ${res.updated} aktualizovaných · dlaždice v /pos-terminal`
        : `Uloženo pouze do skladu · ${res.created} nových · ${res.updated} aktualizovaných`
    setLastSummary(summary)
    setToast(summary)
    setDraft(null)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  if (draft && preview) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <AiVerificationDashboard
          imageUrl={preview}
          draft={draft}
          busy={inventoryLoading}
          title="Ověřovací okno — AI skenování lístků"
          subtitle="Ruční lístek, ceník nebo účtenka. Opravte žluté řádky a zvolte zápis do skladu nebo okamžitou aktivaci v Kase."
          onCancel={() => {
            setDraft(null)
          }}
          onCommit={handleCommit}
        />
      </div>
    )
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease', position: 'relative' }}>
      <h1 className="section-title gold-text">📸 AI Skenování lístků z fotky</h1>
      <p className="section-sub">
        Nahrajte fotografii ručního zápisu, ceníku nebo účtenky — AI Vision otevře ověřovací dashboard
        (split-screen) před zápisem do skladu / kasy.
      </p>

      {!unlocked && (
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 280, marginBottom: 20 }}>
          <Lock size={32} color="var(--gold)" />
          <div style={{ fontSize: '1.1rem' }}>Vyžaduje tarif BUSINESS nebo vyšší</div>
          <button className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat
          </button>
        </div>
      )}

      {unlocked && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="panel glass-glow"
            style={{
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: dragging ? 'var(--gold)' : 'var(--border-strong)',
              textAlign: 'center',
              padding: '3rem 2rem',
              cursor: 'pointer',
              background: dragging ? 'var(--gold-subtle)' : undefined,
              marginBottom: 20,
              transition: 'all 0.3s',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.txt,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void processFile(f)
              }}
            />
            {scanning ? (
              <Loader2 size={40} color="var(--gold)" className="spin" />
            ) : (
              <Camera size={40} color="var(--gold)" />
            )}
            <div style={{ marginTop: 16, fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
              {scanning ? 'AI Vision analyzuje…' : 'Přetáhněte fotku sem'}
            </div>
            <div style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '0.9rem' }}>
              <Upload size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              JPG, PNG, WebP — handwritten notes & distributor lists
              {!visionUnlocked && (
                <div style={{ marginTop: 8 }}>
                  <span className="badge badge-warning">Photo Vision = ENTERPRISE</span>
                </div>
              )}
            </div>
          </div>

          {preview && !draft && (
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                maxWidth: 420,
                marginBottom: 16,
              }}
            >
              <img
                src={preview}
                alt="Nahraná fotka"
                style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }}
              />
            </div>
          )}

          {lastSummary && (
            <div className="panel" style={{ borderColor: 'var(--gold)', marginBottom: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Poslední schválení</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>{lastSummary}</p>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-gold" onClick={() => setView('inventory')}>
                  Otevřít Sklad
                </button>
                <button className="btn btn-ghost" onClick={() => setView('print')}>
                  Tiskové layouty
                </button>
              </div>
              {project && (
                <p style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  Aktivní projekt: {project.name} — položky jsou ve skladu / kase (ne automaticky v cateringu).
                </p>
              )}
            </div>
          )}
        </>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
