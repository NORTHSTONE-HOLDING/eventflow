import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Download,
  FileText,
  Lock,
  Loader2,
  Printer,
  ShoppingCart,
  Upload,
  UtensilsCrossed,
  Wine,
  Sparkles,
} from 'lucide-react'
import { useAppStore, selectActiveProject } from '../store/useAppStore'
import { useInventoryStore } from '../store/useInventoryStore'
import { hasFeature } from '../lib/subscriptions'
import { formatCzechDate } from '../lib/czechDate'
import { buildAllergenLegend } from '../lib/allergens'
import {
  PRINT_FORMATS,
  PRINT_THEMES,
  buildSectionsFromItems,
  collectMenuItems,
  eventMilestones,
  formatAllergenLine,
  formatMenuPrice,
  formatPreviewWidthPx,
  inventoryPrintRevision,
  normalizePrintDesign,
  shouldShowPrices,
  themeClassName,
  venueHeaderFromProfile,
} from '../lib/printMenuEngine'
import { inventoryCategoryToPos } from '../lib/inventoryPosBridge'
import { exportMenuPdf, exportMenuWord, printMenuNative } from '../lib/printExport'
import { scanPrintMenuFromImage } from '../lib/printMenuVision'
import { hasVenueOpenAiKey } from '../lib/openaiClient'
import { formatCurrency } from '../lib/documentIds'
import type {
  InventoryItem,
  PrintDesign,
  PrintFormat,
  PrintMenuItem,
  PrintMenuKind,
  PrintMenuSource,
  PrintOperationMode,
} from '../types'

/** Re-export helper used by print engine for kind filter in Live Sklad list */
function itemMatchesKind(item: InventoryItem, kind: PrintMenuKind): boolean {
  const cat = inventoryCategoryToPos(item.category)
  if (kind === 'beverage') return cat === 'beverage'
  return cat !== 'beverage'
}

export function PrintMenuEngine() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const profile = useAppStore((s) => s.profile)
  const project = useAppStore(selectActiveProject)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)

  // Reactive inventory subscription — fingerprint forces re-render on Do kasy / price / name
  const inventoryRevision = useInventoryStore((s) => inventoryPrintRevision(s.items))
  const inventory = useInventoryStore((s) => s.items)
  const togglePosVisible = useInventoryStore((s) => s.togglePosVisible)

  const [design, setDesign] = useState<PrintDesign>('elegant_gold')
  const [format, setFormat] = useState<PrintFormat>('A4')
  const [mode, setMode] = useState<PrintOperationMode>('restaurant')
  const [kind, setKind] = useState<PrintMenuKind>('food')
  const [source, setSource] = useState<PrintMenuSource>('sklad')
  const [visionItems, setVisionItems] = useState<PrintMenuItem[]>([])
  const [scanning, setScanning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [inkSave, setInkSave] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  /** Explicit Live Sklad selection — synced from pos_visible, editable via checkboxes */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const printRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const unlocked = hasFeature(subscription, 'ENTERPRISE')
  const theme = normalizePrintDesign(design)
  const header = venueHeaderFromProfile(profile)
  const showPrices = shouldShowPrices(mode, profile)
  const milestones = eventMilestones(project)
  const menuTitle = kind === 'beverage' ? 'Nápojový lístek' : 'Jídelní lístek'

  const liveCandidates = useMemo(() => {
    void inventoryRevision
    return (inventory ?? [])
      .filter((i) => !i.is_raw_material)
      .filter((i) => itemMatchesKind(i, kind))
      .slice()
      .sort((a, b) => {
        if (a.pos_visible !== b.pos_visible) return a.pos_visible ? -1 : 1
        return a.name.localeCompare(b.name, 'cs')
      })
  }, [inventory, inventoryRevision, kind])

  // Mirror Do kasy / Aktivovat → print selection immediately
  useEffect(() => {
    const next = new Set<string>()
    for (const item of liveCandidates) {
      if (item.pos_visible) next.add(item.id)
    }
    setSelectedIds(next)
  }, [inventoryRevision, liveCandidates])

  const items = useMemo(() => {
    void inventoryRevision
    return collectMenuItems({
      kind,
      source,
      inventory,
      project,
      visionItems,
      selectedInventoryIds: source === 'sklad' ? selectedIds : null,
    })
  }, [kind, source, inventory, inventoryRevision, project, visionItems, selectedIds])

  const sections = useMemo(() => buildSectionsFromItems(items, kind), [items, kind])

  const allCodes = useMemo(() => {
    const set = new Set<number>()
    for (const s of sections) {
      for (const it of s.items) {
        for (const c of it.allergenCodes) set.add(c)
      }
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [sections])

  const legend = useMemo(() => buildAllergenLegend(allCodes), [allCodes])
  const previewWidth = formatPreviewWidthPx(format)

  const onVisionFile = async (file: File | null) => {
    if (!file) return
    setScanning(true)
    setSource('vision')
    try {
      const parsed = await scanPrintMenuFromImage(file, kind)
      setVisionItems(parsed)
      setToast(
        hasVenueOpenAiKey()
          ? `AI Vision vytěžila ${parsed.length} položek do tiskové šablony`
          : `Simulace skenu: ${parsed.length} položek · 🔒 kontaktujte správu EventFlow pro klíč AI asistenta`,
      )
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Skenování lístku selhalo')
    } finally {
      setScanning(false)
    }
  }

  const handlePdf = async () => {
    if (!printRef.current) return
    setExporting(true)
    try {
      const base =
        kind === 'beverage'
          ? `${header.title}-napojovy-listek`
          : `${header.title}-jidelni-listek`
      await exportMenuPdf(printRef.current, format, base)
      setToast('PDF připraveno ke stažení')
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = () => {
    setInkSave(true)
    requestAnimationFrame(() => printMenuNative(format))
  }

  const handleWord = () => {
    const base =
      kind === 'beverage'
        ? `${header.title}-napojovy-listek`
        : `${header.title}-jidelni-listek`
    exportMenuWord(sections, {
      filename: base,
      kind,
      showPrices,
      venueName: header.title,
    })
    setToast('Word (.docx) exportován')
  }

  const onToggleLiveItem = async (item: InventoryItem) => {
    setTogglingId(item.id)
    try {
      const res = await togglePosVisible(item.id)
      if (!res.ok) {
        setToast(res.error || 'Přepnutí Do kasy selhalo')
        return
      }
      setToast(
        res.item?.pos_visible
          ? `„${item.name}“ aktivováno v Kase a na lístku`
          : `„${item.name}“ odebráno z Kasy a lístku`,
      )
    } finally {
      setTogglingId(null)
    }
  }

  if (!unlocked) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">Print Menu & Beverage Card Engine</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 300 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Tiskové layouty, PDF a Word export vyžadují ENTERPRISE</div>
          <button className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat na ENTERPRISE
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="section-title gold-text">Print Menu & Beverage Card Engine</h1>
      <p className="section-sub">
        Profesionální jídelní a nápojové lístky — 6 luxusních témat, A4 / A5 / DL Slim, PDF i Word,
        alergenový index dle EU 1169/2011.
      </p>

      <div className="print-control-bar no-print panel">
        <div className="print-control-group">
          <div className="label">Druh lístku</div>
          <div className="print-segment">
            <button
              type="button"
              className={kind === 'food' ? 'btn btn-gold' : 'btn btn-ghost'}
              onClick={() => setKind('food')}
            >
              <UtensilsCrossed size={15} /> Vytvořit Jídelní lístek
            </button>
            <button
              type="button"
              className={kind === 'beverage' ? 'btn btn-gold' : 'btn btn-ghost'}
              onClick={() => setKind('beverage')}
            >
              <Wine size={15} /> Vytvořit Nápojový lístek
            </button>
          </div>
        </div>

        <div className="print-control-group">
          <div className="label">Režim provozu (pouze náhled — nepatří do tisku)</div>
          <div className="print-segment">
            <button
              type="button"
              className={mode === 'restaurant' ? 'btn btn-gold' : 'btn btn-ghost'}
              onClick={() => setMode('restaurant')}
            >
              Běžný provoz (Menu restaurace)
            </button>
            <button
              type="button"
              className={mode === 'event' ? 'btn btn-gold' : 'btn btn-ghost'}
              onClick={() => setMode('event')}
            >
              Uzavřená akce (Eventový raut/Svatba)
            </button>
          </div>
        </div>

        <div className="print-control-group">
          <div className="label">Zdroj dat</div>
          <div className="print-segment">
            <button
              type="button"
              className={source === 'sklad' ? 'btn btn-gold' : 'btn btn-ghost'}
              onClick={() => setSource('sklad')}
            >
              Live Sklad (pos_visible)
            </button>
            <button
              type="button"
              className={source === 'project' ? 'btn btn-gold' : 'btn btn-ghost'}
              onClick={() => setSource('project')}
            >
              Aktivní projekt (catering)
            </button>
            <button
              type="button"
              className={source === 'vision' ? 'btn btn-gold' : 'btn btn-ghost'}
              onClick={() => fileRef.current?.click()}
            >
              {scanning ? <Loader2 size={15} className="spin" /> : <Camera size={15} />}
              AI Vision foto/skica
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.txt"
            hidden
            onChange={(e) => void onVisionFile(e.target.files?.[0] ?? null)}
          />
          <div
            className="print-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) void onVisionFile(f)
            }}
          >
            <Upload size={14} /> Přetáhněte fotku lístku sem — gpt-4o-mini vytěží položky, ceny a alergeny
          </div>
        </div>

        {source === 'sklad' && (
          <div className="print-control-group">
            <div className="label">
              Live Sklad — výběr položek ({selectedIds.size} aktivních na lístku)
            </div>
            <div className="print-live-picker">
              {liveCandidates.length === 0 && (
                <div className="print-live-empty">
                  Žádné prodejné položky pro {menuTitle.toLowerCase()}. Přidejte zboží ve Skladu a
                  aktivujte zeleným Do kasy.
                </div>
              )}
              {liveCandidates.map((item) => {
                const checked = selectedIds.has(item.id) || item.pos_visible
                const busy = togglingId === item.id
                return (
                  <label
                    key={`${item.id}-${item.pos_visible ? 'on' : 'off'}-${inventoryRevision.slice(0, 12)}`}
                    className={`print-live-row ${checked ? 'is-on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => void onToggleLiveItem(item)}
                    />
                    <span className="print-live-name">{item.name}</span>
                    <span className="print-live-price">{formatCurrency(item.sale_price || 0)}</span>
                    <button
                      type="button"
                      className={item.pos_visible ? 'btn btn-emerald' : 'btn btn-ghost'}
                      style={{ minHeight: 40, padding: '0 10px' }}
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault()
                        void onToggleLiveItem(item)
                      }}
                      title={item.pos_visible ? 'Deaktivovat v Kase' : 'Do kasy — Aktivovat'}
                    >
                      {busy ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <ShoppingCart size={14} />
                      )}
                      {item.pos_visible ? 'V kase' : 'Do kasy'}
                    </button>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <div className="print-control-group">
          <div className="label">Luxusní šablona (6 stylů)</div>
          <div className="print-theme-grid">
            {PRINT_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? 'btn btn-gold' : 'btn btn-ghost'}
                title={t.description}
                onClick={() => setDesign(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="print-control-group">
          <div className="label">Formát tisku</div>
          <div className="print-segment">
            {PRINT_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={format === f.id ? 'btn btn-gold' : 'btn btn-ghost'}
                onClick={() => setFormat(f.id)}
                title={f.hint}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="print-export-row">
          <label className="print-ink-toggle">
            <input
              type="checkbox"
              checked={inkSave}
              onChange={(e) => setInkSave(e.target.checked)}
            />
            Úsporný tisk (vysoký kontrast)
          </label>
          <button
            type="button"
            className="btn btn-gold"
            disabled={exporting || scanning}
            onClick={() => void handlePdf()}
          >
            {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            📥 Stáhnout pro tisk (PDF)
          </button>
          <button type="button" className="btn btn-ghost" onClick={handlePrint}>
            <Printer size={16} /> Okamžitý tisk
          </button>
          <button type="button" className="btn btn-emerald" onClick={handleWord}>
            <FileText size={16} /> 📄 Exportovat do Wordu (.docx)
          </button>
        </div>

        <div className="print-source-hint">
          <Sparkles size={14} color="var(--gold)" />
          {source === 'sklad' && (
            <span>
              Live Sklad · {items.length} položek na lístku · změny Do kasy se propsí okamžitě
              (revize {inventoryRevision.length}).
            </span>
          )}
          {source === 'project' && (
            <span>
              Zdroj: catering projektu {project?.name || '—'} ({items.length} položek).
            </span>
          )}
          {source === 'vision' && (
            <span>Zdroj: AI Vision sken — {visionItems.length} vytěžených položek.</span>
          )}
        </div>
      </div>

      <div className="print-preview-stage">
        <div
          ref={printRef}
          className={[
            'print-menu-sheet',
            themeClassName(theme),
            inkSave ? 'print-ink-save' : '',
            mode === 'event' ? 'print-mode-event' : 'print-mode-restaurant',
            format === 'DL' ? 'print-format-dl' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            width: previewWidth,
            maxWidth: '100%',
          }}
        >
          <header className="print-menu-header">
            {header.logoUrl && (
              <img src={header.logoUrl} alt={header.title} className="print-menu-logo" />
            )}
            <div className="print-menu-brand">{header.title}</div>
            <h1 className="print-menu-doc-title">{menuTitle}</h1>
          </header>

          {mode === 'event' && (
            <section className="print-event-block">
              <h3 className="print-section-title">Vítejte</h3>
              <p className="print-welcome">
                {(profile.eventWelcomeMessage || '').trim() ||
                  (project
                    ? `Vážení hosté, vítejte na akci „${project.name}“. Menu je připraveno jako součást kompletního zážitku.`
                    : 'Vážení hosté, vítejte. Menu je připraveno jako součást kompletního zážitku.')}
              </p>
              {milestones.length > 0 && (
                <>
                  <h3 className="print-section-title">Program večera</h3>
                  <ul className="print-milestones">
                    {milestones.map((m, i) => (
                      <li key={`${m.time}-${i}`}>
                        <strong>
                          {m.time ? `${m.time} · ` : ''}
                          {m.title}
                        </strong>
                        {m.description ? <span> — {m.description}</span> : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {project && (
                <div className="print-event-meta no-print">
                  {project.name} · {formatCzechDate(project.date)} · {project.guests} hostů
                </div>
              )}
            </section>
          )}

          {sections.length === 0 && (
            <div className="print-empty">
              Žádné položky pro tento lístek. Ve výběru Live Sklad zaškrtněte produkty (Do kasy),
              načtěte catering projektu, nebo nahrajte fotku přes AI Vision.
            </div>
          )}

          {sections.map((section) => (
            <section key={section.id} className="print-section">
              <h3 className="print-section-title">{section.label}</h3>
              <div className="print-rows">
                {section.items.map((item) => (
                  <div key={item.id} className="print-row">
                    <div className="print-row-main">
                      <div className="print-row-top">
                        <span className="print-portion">{item.portionLabel}</span>
                        <span className="print-item-name">{item.name}</span>
                        {showPrices && (
                          <span className="print-item-price">{formatMenuPrice(item.unitPrice)}</span>
                        )}
                      </div>
                      {item.description && (
                        <div className="print-item-desc">{item.description}</div>
                      )}
                      {item.allergenCodes.length > 0 && (
                        <div className="print-item-allergens">
                          {formatAllergenLine(item.allergenCodes)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <footer className="print-allergen-footer">
            <div className="print-allergen-title">Index alergenů (EU 1169/2011)</div>
            {legend.length === 0 ? (
              <div className="print-allergen-empty">
                Na tomto lístku nejsou uvedeny povinné alergeny — doplňte je u položek ve skladu / AI
                skenu.
              </div>
            ) : (
              <div className="print-allergen-grid">
                {legend.map((a) => (
                  <div key={a.code} className="print-allergen-cell">
                    <strong>{a.code}</strong>
                    <span>{a.label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="print-footer-note">
              Ceny uvedeny v Kč · Informace o alergenech poskytne obsluha na vyžádání.
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

/** Backward-compatible export name used by AppShell. */
export function PrintLayoutEngine() {
  return <PrintMenuEngine />
}
