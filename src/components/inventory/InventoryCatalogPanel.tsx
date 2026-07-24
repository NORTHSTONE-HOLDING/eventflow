import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Camera,
  Download,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { useAppStore } from '../../store/useAppStore'
import {
  productNameKey,
  useProductImageStore,
} from '../../store/useProductImageStore'
import { useCategoryRegistryStore } from '../../store/useCategoryRegistryStore'
import {
  ALL_CATEGORY_ID,
  ALL_SUBCATEGORY_ID,
  categoryLabel,
  inferInventorySubcategory,
  itemMatchesInventoryFilter,
  subcategoryLabel,
  type InventoryCategoryDef,
} from '../../lib/inventoryCategories'
import { formatCurrency } from '../../lib/documentIds'
import { formatCzechDateTime } from '../../lib/czechDate'
import { formatStockWithPack } from '../../lib/unitConversion'
import {
  importGastroSpreadsheet,
  type GastroImportDraft,
  type GastroImportProgress,
} from '../../lib/gastroImporter'
import type { InventoryItem, InventoryUnit } from '../../types'

const GOLD = '#D4AF37'
const UNITS: Array<InventoryUnit | string> = ['ks', 'kg', 'l', 'ml', 'g', 'porce']

type EditForm = {
  id?: string
  name: string
  barcode: string
  category: string
  subcategory: string
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
    subcategory: 'hlavni',
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
    subcategory: item.subcategory || 'ostatni',
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
  const setItemImageUrl = useInventoryStore((s) => s.setItemImageUrl)
  const togglePosVisible = useInventoryStore((s) => s.togglePosVisible)
  const deleteInventoryItem = useInventoryStore((s) => s.deleteInventoryItem)
  const importGastroDrafts = useInventoryStore((s) => s.importGastroDrafts)
  const applyAiCopilotCommand = useInventoryStore((s) => s.applyAiCopilotCommand)
  const setToast = useAppStore((s) => s.setToast)
  const imageByKey = useProductImageStore((s) => s.byKey)
  const imageFetching = useProductImageStore((s) => s.fetching)
  const saveManualImage = useProductImageStore((s) => s.saveManualImage)
  const ensureAiImage = useProductImageStore((s) => s.ensureAiImage)
  const customCategories = useCategoryRegistryStore((s) => s.customCategories)
  const customSubcategories = useCategoryRegistryStore((s) => s.customSubcategories)
  const addCustomCategory = useCategoryRegistryStore((s) => s.addCustomCategory)
  const addCustomSubcategory = useCategoryRegistryStore((s) => s.addCustomSubcategory)
  const getAllCategories = useCategoryRegistryStore((s) => s.getAllCategories)

  const [edit, setEdit] = useState<EditForm | null>(null)
  const [quick, setQuick] = useState<EditForm>(() => emptyQuickForm())
  const [aiCommand, setAiCommand] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiBanner, setAiBanner] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importPreview, setImportPreview] = useState<GastroImportDraft[]>([])
  const [importMsg, setImportMsg] = useState('')
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<GastroImportProgress | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [filterCat, setFilterCat] = useState<string>(ALL_CATEGORY_ID)
  const [filterSub, setFilterSub] = useState<string>(ALL_SUBCATEGORY_ID)
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatTarget, setNewCatTarget] = useState<'quick' | 'edit' | 'filter'>('quick')
  const [newSubOpen, setNewSubOpen] = useState(false)
  const [newSubLabel, setNewSubLabel] = useState('')
  const [newSubTarget, setNewSubTarget] = useState<'quick' | 'edit'>('quick')
  const [newSubParentId, setNewSubParentId] = useState('raw')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(
    () => getAllCategories(),
    [getAllCategories, customCategories, customSubcategories],
  )

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.label })),
    [categories],
  )

  const activeCategoryDef: InventoryCategoryDef | undefined = useMemo(
    () => categories.find((c) => c.id === filterCat),
    [categories, filterCat],
  )

  const sorted = useMemo(
    () =>
      [...(items ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' }),
      ),
    [items],
  )

  const filtered = useMemo(
    () =>
      sorted.filter((item) =>
        itemMatchesInventoryFilter(item, filterCat, filterSub, categories),
      ),
    [sorted, filterCat, filterSub, categories],
  )

  const resolveItemImage = (item: InventoryItem): string | null => {
    return (
      imageByKey[item.id] ||
      imageByKey[productNameKey(item.name)] ||
      item.image_url ||
      null
    )
  }

  const isItemFetching = (item: InventoryItem): boolean =>
    Boolean(imageFetching[item.id] || imageFetching[productNameKey(item.name)])

  useEffect(() => {
    if (!edit?.id) return
    const item = items.find((i) => i.id === edit.id)
    if (!item) return
    if (resolveItemImage(item)) return
    void ensureAiImage(item).then((url) => {
      if (url) void setItemImageUrl(item.id, url)
    })
  }, [edit?.id, items, ensureAiImage, setItemImageUrl, imageByKey])

  const openNewCategory = (target: 'quick' | 'edit' | 'filter') => {
    setNewCatTarget(target)
    setNewCatLabel('')
    setNewCatOpen(true)
  }

  const commitNewCategory = () => {
    const res = addCustomCategory(newCatLabel)
    if (!res.ok || !res.category) {
      setToast(res.error || 'Registrace kategorie selhala')
      return
    }
    setToast(`Kategorie „${res.category.label}“ přidána`)
    setNewCatOpen(false)
    if (newCatTarget === 'quick') {
      setQuick((q) => ({
        ...q,
        category: res.category!.id,
        subcategory: res.category!.subs[0]?.id || 'ostatni',
      }))
    } else if (newCatTarget === 'edit' && edit) {
      setEdit({
        ...edit,
        category: res.category.id,
        subcategory: res.category.subs[0]?.id || 'ostatni',
      })
    } else {
      setFilterCat(res.category.id)
      setFilterSub(ALL_SUBCATEGORY_ID)
    }
  }

  const openNewSubcategory = (target: 'quick' | 'edit', parentId: string) => {
    setNewSubTarget(target)
    setNewSubParentId(parentId)
    setNewSubLabel('')
    setNewSubOpen(true)
  }

  const commitNewSubcategory = () => {
    const res = addCustomSubcategory(newSubParentId, newSubLabel)
    if (!res.ok || !res.subcategory) {
      setToast(res.error || 'Registrace podkategorie selhala')
      return
    }
    setToast(`Podkategorie „${res.subcategory.label}“ přidána`)
    setNewSubOpen(false)
    if (newSubTarget === 'quick') {
      setQuick((q) => ({ ...q, subcategory: res.subcategory!.id }))
    } else if (edit) {
      setEdit({ ...edit, subcategory: res.subcategory.id })
    }
  }

  const onTogglePos = async (item: InventoryItem) => {
    const res = await togglePosVisible(item.id)
    if (!res.ok) {
      setToast(res.error || 'Přepnutí Do kasy selhalo')
      return
    }
    setToast(
      res.item?.pos_visible
        ? `„${item.name}“ je aktivní v Kase (V kase)`
        : `„${item.name}“ odstraněno z Kasy · pouze sklad`,
    )
  }

  const onConfirmDelete = async () => {
    if (!deleteConfirmId) return
    const name = items.find((i) => i.id === deleteConfirmId)?.name || 'Položka'
    const res = await deleteInventoryItem(deleteConfirmId)
    setDeleteConfirmId(null)
    if (!res.ok) {
      setToast(res.error || 'Smazání selhalo')
      return
    }
    if (edit?.id === deleteConfirmId) setEdit(null)
    setToast(`Smazáno: ${name}`)
  }

  const saveForm = async (form: EditForm, closeAfter: boolean) => {
    if (!form.name.trim()) {
      setToast('Zadejte název položky')
      return
    }
    const category = form.category || 'raw'
    const subcategory =
      form.subcategory || inferInventorySubcategory(form.name, category)
    const res = await upsertInventoryItem({
      id: form.id,
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      category,
      subcategory,
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
    setToast(
      form.id
        ? 'Změny uloženy · AI dohledává produktové foto…'
        : 'Položka naskladněna · AI dohledává produktové foto…',
    )
    if (closeAfter) setEdit(null)
    else setQuick(emptyQuickForm())
  }

  const onManualPhoto = async (file: File | null) => {
    if (!file || !edit?.id) {
      setToast('Nejprve uložte položku, poté nahrajte fotku')
      return
    }
    const item = items.find((i) => i.id === edit.id)
    if (!item) {
      setToast('Položka nenalezena')
      return
    }
    setPhotoBusy(true)
    try {
      const url = await saveManualImage(item, file)
      if (!url) {
        setToast('Nahrání fotky selhalo')
        return
      }
      const res = await setItemImageUrl(item.id, url)
      if (!res.ok) {
        setToast(res.error || 'Uložení fotky selhalo')
        return
      }
      setToast('Produktová fotka uložena · Kasa aktualizována')
    } finally {
      setPhotoBusy(false)
    }
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
    setImportSuccess(null)
    setImportPreview([])
    setImportProgress({
      phase: 'reading',
      detail: 'AI analyzuje strukturu souboru a třídí položky do kategorií...',
      percent: 5,
    })
    try {
      const res = await importGastroSpreadsheet(file, (p) => setImportProgress(p))
      setImportMsg(res.message)
      setImportPreview(res.items)
      if (!res.ok) {
        setToast(res.message)
        setImportProgress({ phase: 'error', detail: res.message, percent: 100 })
        return
      }
      setImportProgress({
        phase: 'done',
        detail: 'Náhled připraven — potvrďte zápis do skladu',
        percent: 100,
      })
    } finally {
      setImportBusy(false)
      window.setTimeout(() => {
        setImportProgress((prev) => (prev?.phase === 'done' || prev?.phase === 'error' ? null : prev))
      }, 600)
    }
  }

  const commitImport = async () => {
    if (!importPreview.length) return
    setImportBusy(true)
    setImportSuccess(null)
    setImportProgress({
      phase: 'classifying',
      detail: 'Zapisuji položky do skladu jako neprodejné (mimo Kasu)…',
      percent: 40,
    })
    try {
      const count = importPreview.length
      const res = await importGastroDrafts(importPreview)
      if (!res.ok) {
        setToast(res.error || 'Import selhal')
        setImportProgress({
          phase: 'error',
          detail: res.error || 'Import selhal',
          percent: 100,
        })
        return
      }
      const badge = `✨ Úspěšně naimportováno ${count} položek. Kategorie a podkategorie byly automaticky přiřazeny pomocí AI.`
      setImportSuccess(badge)
      setToast(badge)
      setImportPreview([])
      setImportProgress({ phase: 'done', detail: badge, percent: 100 })
    } finally {
      setImportBusy(false)
      window.setTimeout(() => setImportProgress(null), 900)
    }
  }

  const subsForForm = (categoryId: string) => {
    const def = categories.find((c) => c.id === categoryId)
    return (def?.subs || [{ id: 'ostatni', label: 'Ostatní' }]).map((s) => ({
      value: s.id,
      label: s.label,
    }))
  }

  if (loading && !items.length) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader2 className="spin" size={22} color={GOLD} />
        <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>Načítám sklad…</div>
      </div>
    )
  }

  const editItem = edit?.id ? items.find((i) => i.id === edit.id) : null
  const editImage = editItem ? resolveItemImage(editItem) : null
  const editFetching = editItem ? isItemFetching(editItem) : false

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        className="panel"
        style={{
          borderColor: `${GOLD}66`,
          background: 'linear-gradient(135deg, rgba(212,175,55,0.08), #0f172a 55%)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <Sparkles size={18} color={GOLD} />
          <strong style={{ color: GOLD, fontSize: '1.05rem' }}>🤖 AI Skladový Asistent</strong>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40, borderColor: GOLD, color: GOLD, marginLeft: 'auto' }}
            onClick={() => openNewCategory('filter')}
          >
            <Plus size={14} /> ➕ Přidat novou kategorii
          </button>
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
            placeholder="Příkaz: 'Zvedni cenu u kategorie Pití o 15%' · 'Přidej kategorii Tabákové výrobky' · 'Přepiš názvy jídel…'"
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
          <div style={{ display: 'grid', gap: 6 }}>
            <Field
              label="Kategorie"
              as="select"
              value={quick.category}
              onChange={(v) =>
                setQuick({
                  ...quick,
                  category: v,
                  subcategory: subsForForm(v)[0]?.value || 'ostatni',
                })
              }
              options={categoryOptions}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 40, borderColor: `${GOLD}88`, color: GOLD, fontWeight: 800 }}
              onClick={() => openNewCategory('quick')}
            >
              <Plus size={14} /> ➕ Přidat novou kategorii
            </button>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <Field
              label="Podkategorie"
              as="select"
              value={quick.subcategory}
              onChange={(v) => setQuick({ ...quick, subcategory: v })}
              options={subsForForm(quick.category)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 40, borderColor: `${GOLD}88`, color: GOLD, fontWeight: 800 }}
              onClick={() => openNewSubcategory('quick', quick.category)}
            >
              <Plus size={14} /> ➕ Přidat novou podkategorii
            </button>
          </div>
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
          <Save size={15} /> Uložit · AI dohledá foto
        </button>
      </div>

      <AnimatePresence>
        {importOpen && (
          <motion.div
            className="panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{ borderColor: `${GOLD}66`, position: 'relative' }}
          >
            <strong style={{ color: GOLD, fontSize: '1.08rem' }}>
              Universal Data Importer · Excel & CSV
            </strong>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '8px 0 12px' }}>
              Nahrajte export z cizího pokladního systému (.csv / .xlsx). AI rozklíčuje sloupce,
              přiřadí kategorie (Jídlo, Pití, Inventář, Technika) i české podkategorie a zapíše
              položky do skladu jako neprodejné — do Kasy je dostanete až tlačítkem Do kasy.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setImportDragOver(true)
              }}
              onDragLeave={() => setImportDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setImportDragOver(false)
                void onFile(e.dataTransfer.files?.[0] || null)
              }}
              onClick={() => !importBusy && fileRef.current?.click()}
              style={{
                border: `2px dashed ${GOLD}`,
                borderRadius: 16,
                padding: '2.4rem 1.25rem',
                textAlign: 'center',
                cursor: importBusy ? 'wait' : 'pointer',
                background: importDragOver
                  ? 'rgba(212,175,55,0.16)'
                  : 'linear-gradient(160deg, rgba(212,175,55,0.1), #020617 65%)',
                touchAction: 'manipulation',
                minHeight: 168,
                boxShadow: importDragOver
                  ? '0 0 28px rgba(212,175,55,0.25)'
                  : '0 0 0 1px rgba(212,175,55,0.12) inset',
                transition: 'background 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <Upload size={36} color={GOLD} />
              <div style={{ marginTop: 12, fontWeight: 900, color: '#fef3c7', fontSize: '1.05rem' }}>
                Přetáhněte Excel / CSV nebo klepněte pro výběr
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: 6, fontWeight: 600 }}>
                Podporováno: .csv · .xlsx · .xls · SheetJS parsing · AI třídění
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  e.target.value = ''
                  void onFile(f)
                }}
              />
            </div>

            <AnimatePresence>
              {importProgress && importBusy && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 5,
                    borderRadius: 12,
                    background: 'rgba(2,6,23,0.88)',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 14,
                    padding: 24,
                    border: `1px solid ${GOLD}`,
                  }}
                >
                  <Loader2 className="spin" size={28} color={GOLD} />
                  <div
                    style={{
                      color: '#fef3c7',
                      fontWeight: 800,
                      textAlign: 'center',
                      maxWidth: 420,
                      lineHeight: 1.4,
                    }}
                  >
                    {importProgress.detail ||
                      'AI analyzuje strukturu souboru a třídí položky do kategorií...'}
                  </div>
                  <div
                    style={{
                      width: 'min(320px, 80%)',
                      height: 8,
                      borderRadius: 999,
                      background: '#0b1220',
                      border: '1px solid rgba(212,175,55,0.35)',
                      overflow: 'hidden',
                    }}
                  >
                    <motion.div
                      animate={{ width: `${Math.max(8, importProgress.percent)}%` }}
                      transition={{ ease: 'easeOut', duration: 0.35 }}
                      style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, #b8860b, #D4AF37, #f5e6a3)',
                        boxShadow: '0 0 12px rgba(212,175,55,0.55)',
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {importSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginTop: 12,
                  padding: '0.85rem 1rem',
                  borderRadius: 12,
                  border: `1.5px solid ${GOLD}`,
                  background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(15,23,42,0.95))',
                  color: '#fef3c7',
                  fontWeight: 800,
                  boxShadow: '0 0 22px rgba(212,175,55,0.2)',
                }}
              >
                {importSuccess}
                <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Položky jsou ve skladu jako neprodejné. Aktivujte prodej zeleným tlačítkem Do kasy.
                </div>
              </motion.div>
            )}

            {importMsg && !importSuccess && (
              <div style={{ marginTop: 10, color: '#cbd5e1', fontWeight: 600 }}>{importMsg}</div>
            )}

            {importPreview.length > 0 && (
              <>
                <div
                  style={{
                    marginTop: 12,
                    maxHeight: 260,
                    overflow: 'auto',
                    border: `1px solid ${GOLD}44`,
                    borderRadius: 12,
                    background: 'rgba(2,6,23,0.55)',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: 8 }}>Název</th>
                        <th style={{ padding: 8 }}>Kategorie</th>
                        <th style={{ padding: 8 }}>Podkategorie</th>
                        <th style={{ padding: 8 }}>MJ</th>
                        <th style={{ padding: 8 }}>Qty</th>
                        <th style={{ padding: 8 }}>EAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 60).map((row, i) => (
                        <tr key={`${row.name}-${i}`} style={{ borderTop: '1px solid #1e293b' }}>
                          <td style={{ padding: 8, fontWeight: 700 }}>{row.name}</td>
                          <td style={{ padding: 8, color: GOLD }}>{row.category}</td>
                          <td style={{ padding: 8 }}>{row.subcategory}</td>
                          <td style={{ padding: 8 }}>{row.unit}</td>
                          <td style={{ padding: 8 }}>{row.quantity}</td>
                          <td style={{ padding: 8, color: '#94a3b8' }}>{row.barcode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ marginTop: 12, minHeight: 52, fontWeight: 900, width: '100%' }}
                  disabled={importBusy}
                  onClick={() => void commitImport()}
                >
                  Zapsat do skladu ({importPreview.length}) · mimo Kasu · AI fotky
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
            Katalog skladu · receptury: {(recipes ?? []).length}
          </h3>
          <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 700 }}>
            Zobrazeno {filtered.length} / {sorted.length} položek
            {filterCat !== ALL_CATEGORY_ID
              ? ` · ${categoryLabel(filterCat, categories)}`
              : ' · Vše'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className={`inventory-filter-tab${filterCat === ALL_CATEGORY_ID ? ' is-active' : ''}`}
            onClick={() => {
              setFilterCat(ALL_CATEGORY_ID)
              setFilterSub(ALL_SUBCATEGORY_ID)
            }}
          >
            Vše
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`inventory-filter-tab${filterCat === cat.id ? ' is-active' : ''}`}
              onClick={() => {
                setFilterCat(cat.id)
                setFilterSub(ALL_SUBCATEGORY_ID)
              }}
            >
              {cat.label}
              {!cat.builtin ? ' ★' : ''}
            </button>
          ))}
        </div>

        {filterCat !== ALL_CATEGORY_ID && activeCategoryDef && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
              padding: '0.65rem 0.75rem',
              borderRadius: 12,
              border: `1px solid ${GOLD}44`,
              background: 'rgba(15, 23, 42, 0.85)',
            }}
          >
            <span
              style={{
                color: GOLD,
                fontWeight: 800,
                fontSize: '0.78rem',
                alignSelf: 'center',
                marginRight: 4,
              }}
            >
              Podkategorie
            </span>
            <button
              type="button"
              className={`inventory-filter-tab${filterSub === ALL_SUBCATEGORY_ID ? ' is-active' : ''}`}
              style={{ minHeight: 40, padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
              onClick={() => setFilterSub(ALL_SUBCATEGORY_ID)}
            >
              Vše
            </button>
            {activeCategoryDef.subs.map((sub) => (
              <button
                key={sub.id}
                type="button"
                className={`inventory-filter-tab${filterSub === sub.id ? ' is-active' : ''}`}
                style={{ minHeight: 40, padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                onClick={() => setFilterSub(sub.id)}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        <div className="inventory-catalog-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                background: '#0b1220',
              }}
            >
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '0.65rem 0.5rem' }}>Foto</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Název</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>EAN</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Stav</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Min.</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Nákup</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Prodej</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>DPH</th>
                <th style={{ padding: '0.65rem 0.5rem' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const low = i.current_quantity <= i.minimum_quantity
                const img = resolveItemImage(i)
                const fetching = isItemFetching(i)
                return (
                  <tr
                    key={i.id}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                    onDoubleClick={() => setEdit(itemToForm(i))}
                  >
                    <td style={{ padding: '0.55rem' }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: `1px solid ${GOLD}55`,
                          background: '#020617',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        {img ? (
                          <img
                            src={img}
                            alt={i.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <ImagePlus size={18} color={GOLD} />
                        )}
                        {fetching && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(2,6,23,0.55)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Loader2 className="spin" size={14} color={GOLD} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.55rem' }}>
                      <div
                        style={{
                          fontWeight: 700,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        <span>{i.name}</span>
                        {i.pos_visible && !i.is_raw_material && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              letterSpacing: '0.04em',
                              color: '#052e16',
                              background: '#34d399',
                              borderRadius: 999,
                              padding: '0.15rem 0.5rem',
                            }}
                            title="Přímý prodej 1:1 — odepíše 1 jednotku ze skladu"
                          >
                            V kase
                          </span>
                        )}
                        {i.is_raw_material && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              letterSpacing: '0.04em',
                              color: '#fef3c7',
                              background: 'rgba(212,175,55,0.2)',
                              border: `1px solid ${GOLD}66`,
                              borderRadius: 999,
                              padding: '0.15rem 0.5rem',
                            }}
                            title="Surovina — skrytá v Kase; odepisuje se přes receptury / polední menu (kg/g)"
                          >
                            Surovina
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {categoryLabel(i.category, categories)}
                        {' · '}
                        {subcategoryLabel(i.category, i.subcategory, categories)}
                        {' · '}
                        {i.warehouse_section}
                        {fetching ? ' · AI vyhledává produktové foto...' : ''}
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
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          type="button"
                          title={
                            i.is_raw_material
                              ? 'Surovina — nelze Do kasy (použijte recepturu / polední menu)'
                              : i.pos_visible
                                ? 'Odebrat z Kasy (zpět jen sklad)'
                                : 'Do kasy — přímý prodej 1:1'
                          }
                          disabled={i.is_raw_material && !i.pos_visible}
                          onClick={() => void onTogglePos(i)}
                          style={{
                            minHeight: 44,
                            minWidth: 44,
                            borderRadius: 12,
                            border: `1.5px solid ${
                              i.is_raw_material
                                ? '#475569'
                                : i.pos_visible
                                  ? '#34d399'
                                  : '#065f46'
                            }`,
                            background: i.is_raw_material
                              ? 'rgba(51,65,85,0.45)'
                              : i.pos_visible
                                ? 'rgba(52,211,153,0.22)'
                                : 'rgba(6,78,59,0.45)',
                            color: i.is_raw_material
                              ? '#64748b'
                              : i.pos_visible
                                ? '#6ee7b7'
                                : '#34d399',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor:
                              i.is_raw_material && !i.pos_visible
                                ? 'not-allowed'
                                : 'pointer',
                            touchAction: 'manipulation',
                            opacity: i.is_raw_material && !i.pos_visible ? 0.55 : 1,
                            boxShadow:
                              i.pos_visible && !i.is_raw_material
                                ? '0 0 14px rgba(52,211,153,0.35)'
                                : 'none',
                          }}
                        >
                          <ShoppingCart size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{
                            minHeight: 44,
                            minWidth: 44,
                            padding: 8,
                            borderColor: GOLD,
                            borderRadius: 12,
                          }}
                          title="Upravit položku"
                          onClick={() => setEdit(itemToForm(i))}
                        >
                          <Pencil size={15} color={GOLD} />
                        </button>
                        <button
                          type="button"
                          title="Smazat položku"
                          onClick={() => setDeleteConfirmId(i.id)}
                          style={{
                            minHeight: 44,
                            minWidth: 44,
                            borderRadius: 12,
                            border: '1.5px solid #ef4444',
                            background: 'rgba(127,29,29,0.35)',
                            color: '#fca5a5',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            touchAction: 'manipulation',
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: '2rem 1rem',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontWeight: 600,
                    }}
                  >
                    V tomto filtru nejsou žádné položky. Zvolte „Vše“ nebo přidejte zboží do
                    kategorie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, color: '#64748b', fontSize: '0.75rem' }}>
          Kompaktní rolovací tabulka (max. 600 px) · klepněte na ✏️ nebo dvojklik řádku
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 10, fontSize: '1.1rem' }}>Poslední pohyby (inventory_logs)</h3>
        <div
          className="inventory-catalog-scroll"
          style={{ maxHeight: 280 }}
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
                  padding: '0.45rem 0.55rem',
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
            <div style={{ color: 'var(--text-dim)', padding: '0.75rem' }}>
              Zatím bez pohybů — proveďte naskladnění nebo POS prodej (např. Mojito / Panák).
            </div>
          )}
        </div>
      </div>

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

              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={photoBusy || !edit.id}
                title="Klepněte pro focení / nahrání fotky"
                style={{
                  width: '100%',
                  minHeight: 180,
                  marginBottom: 14,
                  borderRadius: 14,
                  border: `2px dashed ${GOLD}`,
                  background: 'radial-gradient(circle at 40% 30%, #1e293b, #020617 75%)',
                  cursor: edit.id ? 'pointer' : 'not-allowed',
                  position: 'relative',
                  overflow: 'hidden',
                  touchAction: 'manipulation',
                  padding: 0,
                }}
              >
                {editImage ? (
                  <img
                    src={editImage}
                    alt={edit.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      position: 'absolute',
                      inset: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      color: '#e2e8f0',
                      fontWeight: 700,
                      padding: 16,
                    }}
                  >
                    <Camera size={36} color={GOLD} />
                    <span>Klepněte pro fotku z mobilu / nahrání souboru</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                      {edit.id
                        ? 'Kamera tabletu · accept image/* · capture environment'
                        : 'Nejprve uložte položku, poté přidejte fotku'}
                    </span>
                  </div>
                )}
                {(photoBusy || editFetching) && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(2,6,23,0.62)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      color: '#fef3c7',
                      fontWeight: 800,
                      zIndex: 2,
                    }}
                  >
                    <Loader2 className="spin" size={18} color={GOLD} />
                    AI vyhledává produktové foto...
                  </div>
                )}
                {editImage && !photoBusy && !editFetching && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      padding: '0.55rem 0.75rem',
                      background: 'rgba(2,6,23,0.7)',
                      backdropFilter: 'blur(6px)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      zIndex: 1,
                    }}
                  >
                    <Camera size={14} color={GOLD} /> Změnit fotku (galerie / fotoaparát)
                  </div>
                )}
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  e.target.value = ''
                  void onManualPhoto(file)
                }}
              />

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
                <div style={{ display: 'grid', gap: 6 }}>
                  <Field
                    label="Kategorie"
                    as="select"
                    value={edit.category}
                    onChange={(v) =>
                      setEdit({
                        ...edit,
                        category: v,
                        subcategory: subsForForm(v)[0]?.value || 'ostatni',
                      })
                    }
                    options={categoryOptions}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 40, borderColor: `${GOLD}88`, color: GOLD, fontWeight: 800 }}
                    onClick={() => openNewCategory('edit')}
                  >
                    <Plus size={14} /> ➕ Přidat novou kategorii
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <Field
                    label="Podkategorie"
                    as="select"
                    value={edit.subcategory}
                    onChange={(v) => setEdit({ ...edit, subcategory: v })}
                    options={subsForForm(edit.category)}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 40, borderColor: `${GOLD}88`, color: GOLD, fontWeight: 800 }}
                    onClick={() => openNewSubcategory('edit', edit.category)}
                  >
                    <Plus size={14} /> ➕ Přidat novou podkategorii
                  </button>
                </div>
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

      <AnimatePresence>
        {newCatOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 8100,
              background: 'rgba(2,6,23,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setNewCatOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(96vw, 420px)',
                background: '#0f172a',
                border: `2px solid ${GOLD}`,
                borderRadius: 16,
                padding: '1.2rem 1.25rem',
                boxShadow: '0 0 28px rgba(212,175,55,0.2)',
              }}
            >
              <strong style={{ color: GOLD, fontSize: '1.05rem' }}>
                ➕ Přidat novou kategorii
              </strong>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '8px 0 12px' }}>
                Zadejte vlastní kategorii (např. Tabákové výrobky, VIP Merch). Bude dostupná ve
                filtrech skladu, ručním zápisu i AI importu.
              </p>
              <input
                className="input"
                autoFocus
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                placeholder="Název nové kategorie…"
                style={{ minHeight: 48, background: '#020617', borderColor: GOLD }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNewCategory()
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 48, flex: 1 }}
                  onClick={() => setNewCatOpen(false)}
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ minHeight: 48, flex: 1, fontWeight: 900 }}
                  disabled={!newCatLabel.trim()}
                  onClick={commitNewCategory}
                >
                  <Save size={15} /> Registrovat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newSubOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 8200,
              background: 'rgba(2,6,23,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setNewSubOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(96vw, 420px)',
                background: '#0f172a',
                border: `2px solid ${GOLD}`,
                borderRadius: 16,
                padding: '1.2rem 1.25rem',
                boxShadow: '0 0 28px rgba(212,175,55,0.2)',
              }}
            >
              <strong style={{ color: GOLD, fontSize: '1.05rem' }}>
                ➕ Přidat novou podkategorii
              </strong>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '8px 0 12px' }}>
                Podkategorie pro{' '}
                <span style={{ color: '#fef3c7', fontWeight: 800 }}>
                  {categoryLabel(newSubParentId, categories)}
                </span>
                {' '}
                (např. IPA Piva, Bezlepkové chody).
              </p>
              <input
                className="input"
                autoFocus
                value={newSubLabel}
                onChange={(e) => setNewSubLabel(e.target.value)}
                placeholder="Název nové podkategorie…"
                style={{ minHeight: 48, background: '#020617', borderColor: GOLD }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNewSubcategory()
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 48, flex: 1 }}
                  onClick={() => setNewSubOpen(false)}
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ minHeight: 48, flex: 1, fontWeight: 900 }}
                  disabled={!newSubLabel.trim()}
                  onClick={commitNewSubcategory}
                >
                  <Save size={15} /> Registrovat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 8300,
              background: 'rgba(2,6,23,0.82)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setDeleteConfirmId(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(96vw, 380px)',
                background: '#0f172a',
                border: '2px solid #ef4444',
                borderRadius: 16,
                padding: '1.2rem 1.25rem',
                boxShadow: '0 0 28px rgba(239,68,68,0.25)',
              }}
            >
              <strong style={{ color: '#fca5a5', fontSize: '1.1rem' }}>Smazat?</strong>
              <p style={{ color: '#cbd5e1', margin: '10px 0 16px', fontWeight: 600 }}>
                Opravdu smazat „
                {items.find((x) => x.id === deleteConfirmId)?.name || 'položku'}“ ze skladu
                (Supabase / lokální úložiště)?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 48, flex: 1 }}
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  style={{
                    minHeight: 48,
                    flex: 1,
                    fontWeight: 900,
                    borderRadius: 12,
                    border: '1px solid #ef4444',
                    background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
                    color: '#fff',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  onClick={() => void onConfirmDelete()}
                >
                  <Trash2 size={15} /> Smazat
                </button>
              </div>
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
