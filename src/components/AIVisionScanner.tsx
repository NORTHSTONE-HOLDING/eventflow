import { useCallback, useRef, useState } from 'react'
import { Camera, Upload, Loader2, Lock, FileDown } from 'lucide-react'
import { useAppStore, selectActiveProject } from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import { scanMenuFromImage, readImageAsDataUrl } from '../lib/visionScan'
import { formatCurrency } from '../lib/documentIds'
import type { PrintDesign, PrintFormat } from '../types'
import { exportMenuPdf } from '../lib/printExport'

export function AIVisionScanner() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const project = useAppStore(selectActiveProject)
  const addCateringItems = useAppStore((s) => s.addCateringItems)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastCount, setLastCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const unlocked = hasFeature(subscription, 'BUSINESS')
  const visionUnlocked = hasFeature(subscription, 'ENTERPRISE')

  const processFile = useCallback(
    async (file: File) => {
      if (!project) {
        setToast('Nejdřív vytvořte projekt v AI Planneru')
        return
      }
      if (!unlocked) {
        setToast('AI Scanner vyžaduje tarif BUSINESS+')
        return
      }
      if (!visionUnlocked && file.type.startsWith('image/')) {
        // BUSINESS can use text scan simulation; ENTERPRISE gets full vision
        setToast('Photo Menu Scan vyžaduje ENTERPRISE — simulace textového skenu…')
      }
      setScanning(true)
      try {
        const url = await readImageAsDataUrl(file)
        setPreview(url)
        const items = await scanMenuFromImage(file)
        addCateringItems(project.id, items)
        setLastCount(items.length)
        setToast(`Extrahováno ${items.length} položek do cateringu`)
      } finally {
        setScanning(false)
      }
    },
    [project, unlocked, visionUnlocked, addCateringItems, setToast]
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease', position: 'relative' }}>
      <h1 className="section-title gold-text">📸 AI Skenování lístků z fotky</h1>
      <p className="section-sub">
        Nahrajte fotografii ručního zápisu nebo ceníku distributora — AI Vision extrahuje položky do cateringu.
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
                if (f) processFile(f)
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

          {preview && (
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, marginBottom: 20 }}>
              <img
                src={preview}
                alt="Nahraná fotka"
                style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)' }}
              />
              <div className="panel">
                <h3 style={{ marginBottom: 8 }}>Výsledek skenu</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Přidáno <strong style={{ color: 'var(--gold)' }}>{lastCount}</strong> položek do digitálního
                  catering stavu aktivního projektu.
                </p>
                {project && (
                  <div style={{ marginTop: 12 }}>
                    {project.catering.slice(0, lastCount || 5).map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: '1px solid var(--border)',
                          fontSize: '0.9rem',
                        }}
                      >
                        <span>{c.name}</span>
                        <span style={{ color: 'var(--gold)' }}>{formatCurrency(c.foodCost)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => setView('print')}>
                  Otevřít tiskové layouty
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 700px) {
          div[style*="grid-template-columns: 240px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

export function PrintLayoutEngine() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const profile = useAppStore((s) => s.profile)
  const project = useAppStore(selectActiveProject)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)
  const [design, setDesign] = useState<PrintDesign>('elegant')
  const [format, setFormat] = useState<PrintFormat>('A4')
  const printRef = useRef<HTMLDivElement>(null)

  const unlocked = hasFeature(subscription, 'ENTERPRISE')

  const handleExport = async () => {
    if (!printRef.current || !project) return
    await exportMenuPdf(printRef.current, format, `${project.name}-menu`)
    setToast('PDF menu připraveno ke stažení')
  }

  if (!unlocked) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">Print Layout Engine</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 300 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Tiskové layouty a PDF export vyžadují ENTERPRISE</div>
          <button className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat na ENTERPRISE
          </button>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
        Nejdřív vytvořte projekt s cateringem.
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-gold" onClick={() => setView('planner')}>
            AI Planner
          </button>
        </div>
      </div>
    )
  }

  const designStyles: Record<PrintDesign, React.CSSProperties> = {
    modern: {
      background: '#fafafa',
      color: '#111',
      fontFamily: 'var(--font-body)',
      borderTop: '4px solid #111',
    },
    elegant: {
      background: '#0f1218',
      color: '#e8ecf1',
      fontFamily: 'var(--font-display)',
      border: '2px solid #D4AF37',
    },
    corporate: {
      background: '#fff',
      color: '#1a1a2e',
      fontFamily: 'var(--font-body)',
      borderLeft: '6px solid #D4AF37',
    },
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="section-title gold-text">Printable Layout Engine</h1>
      <p className="section-sub">Vyberte design a formát — stáhněte print-ready PDF menu / beverage card.</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }} className="no-print">
        {(
          [
            ['modern', 'Modern Minimalist'],
            ['elegant', 'Elegant Gold'],
            ['corporate', 'Classic Corporate'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={design === id ? 'btn btn-gold' : 'btn btn-ghost'}
            onClick={() => setDesign(id)}
          >
            {label}
          </button>
        ))}
        <select
          className="select"
          style={{ width: 100 }}
          value={format}
          onChange={(e) => setFormat(e.target.value as PrintFormat)}
        >
          <option value="A4">A4</option>
          <option value="A5">A5</option>
        </select>
        <button className="btn btn-gold" onClick={handleExport}>
          <FileDown size={16} /> Stáhnout PDF
        </button>
      </div>

      <div
        ref={printRef}
        style={{
          ...designStyles[design],
          padding: format === 'A4' ? '2.5rem' : '1.5rem',
          maxWidth: format === 'A4' ? 794 : 559,
          margin: '0 auto',
          borderRadius: 4,
          minHeight: format === 'A4' ? 500 : 400,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              fontSize: design === 'elegant' ? '2rem' : '1.6rem',
              color: design === 'elegant' ? '#D4AF37' : undefined,
              letterSpacing: '0.06em',
            }}
          >
            {profile.companyName || 'EventFlow Catering'}
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: 4 }}>
            {project.name} · {project.date} · {project.guests} hostů
          </div>
          {profile.ico && (
            <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 4 }}>
              IČO {profile.ico} · {profile.city}
            </div>
          )}
        </div>

        <h3
          style={{
            fontSize: '1.1rem',
            marginBottom: 12,
            borderBottom: design === 'elegant' ? '1px solid #D4AF37' : '1px solid #ddd',
            paddingBottom: 8,
            color: design === 'elegant' ? '#D4AF37' : undefined,
          }}
        >
          Menu & Nápoje
        </h3>

        {(project.catering ?? []).map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: design === 'elegant' ? '1px solid rgba(212,175,55,0.2)' : '1px solid #eee',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.65 }}>{item.recipe}</div>
              {(item.allergens ?? []).length > 0 && (
                <div style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: 2 }}>
                  Alergeny: {(item.allergens ?? []).join(', ')}
                </div>
              )}
            </div>
            <div style={{ fontWeight: 600, color: design === 'elegant' ? '#D4AF37' : undefined }}>
              {formatCurrency(item.foodCost / Math.max(1, item.portion))}
            </div>
          </div>
        ))}
        {(project.catering ?? []).length === 0 && (
          <div style={{ opacity: 0.6, padding: '1rem 0' }}>Žádné položky menu</div>
        )}
      </div>
    </div>
  )
}
