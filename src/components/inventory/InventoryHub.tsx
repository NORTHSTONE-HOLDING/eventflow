import { useMemo, useRef, useState } from 'react'
import { useInventoryStore } from '../../store/useInventoryStore'
import {
  CATEGORY_LABEL,
  INVENTORY_TABS,
  generateEan,
  parseImport,
  unitLabel,
} from '../../lib/inventory'
import { formatCZK, uid } from '../../lib/format'
import { tap } from '../../lib/feedback'
import { Modal } from '../common/Modal'
import type { InventoryCategory, InventoryItem, StockUnit } from '../../lib/types'

function EditModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const updateItem = useInventoryStore((s) => s.updateItem)
  const [draft, setDraft] = useState<InventoryItem>(item)

  const set = (patch: Partial<InventoryItem>) => setDraft({ ...draft, ...patch })

  const save = () => {
    tap(880)
    updateItem(item.id, {
      name: draft.name,
      category: draft.category,
      subcategory: draft.subcategory,
      sellPrice: Number(draft.sellPrice) || 0,
      purchasePrice: Number(draft.purchasePrice) || 0,
      stockQty: Number(draft.stockQty) || 0,
      minQty: Number(draft.minQty) || 0,
      vatRate: Number(draft.vatRate) || 0,
      unit: draft.unit,
      servingSize: Number(draft.servingSize) || 0,
      servingLabel: draft.servingLabel,
      photo: draft.photo,
    })
    onClose()
  }

  return (
    <Modal open title="✏️ Úprava položky" onClose={onClose} maxWidth="max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Název</label>
          <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <label className="label">Kategorie</label>
          <select
            className="input"
            value={draft.category}
            onChange={(e) => set({ category: e.target.value as InventoryCategory })}
          >
            {(['jidlo', 'piti', 'inventar', 'technika'] as const).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Podkategorie (vlastní)</label>
          <input
            className="input"
            value={draft.subcategory}
            onChange={(e) => set({ subcategory: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Prodejní cena (Kč)</label>
          <input
            className="input"
            inputMode="numeric"
            value={draft.sellPrice}
            onChange={(e) => set({ sellPrice: Number(e.target.value.replace(/\D/g, '')) })}
          />
        </div>
        <div>
          <label className="label">Nákupní cena (Kč)</label>
          <input
            className="input"
            inputMode="numeric"
            value={draft.purchasePrice}
            onChange={(e) => set({ purchasePrice: Number(e.target.value.replace(/\D/g, '')) })}
          />
        </div>
        <div>
          <label className="label">Sklad ({unitLabel(draft.unit)})</label>
          <input
            className="input"
            inputMode="decimal"
            value={draft.stockQty}
            onChange={(e) => set({ stockQty: Number(e.target.value.replace(/[^\d.]/g, '')) })}
          />
        </div>
        <div>
          <label className="label">Minimum ({unitLabel(draft.unit)})</label>
          <input
            className="input"
            inputMode="decimal"
            value={draft.minQty}
            onChange={(e) => set({ minQty: Number(e.target.value.replace(/[^\d.]/g, '')) })}
          />
        </div>
        <div>
          <label className="label">Jednotka</label>
          <select
            className="input"
            value={draft.unit}
            onChange={(e) => set({ unit: e.target.value as StockUnit })}
          >
            <option value="l">litr (l)</option>
            <option value="kg">kilogram (kg)</option>
            <option value="ks">kus (ks)</option>
          </select>
        </div>
        <div>
          <label className="label">DPH %</label>
          <select
            className="input"
            value={draft.vatRate}
            onChange={(e) => set({ vatRate: Number(e.target.value) })}
          >
            <option value={21}>21 %</option>
            <option value={12}>12 %</option>
            <option value={0}>0 % (přenesená)</option>
          </select>
        </div>
        <div>
          <label className="label">Odpis / porce</label>
          <input
            className="input"
            inputMode="decimal"
            value={draft.servingSize}
            onChange={(e) => set({ servingSize: Number(e.target.value.replace(/[^\d.]/g, '')) })}
          />
        </div>
        <div>
          <label className="label">Popis porce</label>
          <input
            className="input"
            value={draft.servingLabel}
            onChange={(e) => set({ servingLabel: e.target.value })}
          />
        </div>
      </div>
      <button type="button" onClick={save} className="btn btn-gold mt-5 w-full">
        Uložit změny
      </button>
    </Modal>
  )
}

function ImporterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importItems = useInventoryStore((s) => s.importItems)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<InventoryItem[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const analyze = (raw: string) => {
    setText(raw)
    setPreview(parseImport(raw))
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    file.text().then(analyze)
  }

  const confirm = () => {
    tap(880)
    importItems(preview)
    setText('')
    setPreview([])
    onClose()
  }

  return (
    <Modal open={open} title="📥 Import konkurenčních dat (CSV/Excel)" onClose={onClose} maxWidth="max-w-2xl">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          onFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => fileRef.current?.click()}
        className="mb-3 cursor-pointer rounded-xl border-2 border-dashed border-slate-700 p-6 text-center text-slate-400 hover:border-gold/60"
      >
        📄 Přetáhněte sem CSV/Excel, nebo klikněte pro výběr souboru
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.xls,.xlsx"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? undefined)}
        />
      </div>
      <textarea
        className="input min-h-[110px] font-mono text-xs"
        placeholder={'Nebo vložte data:\nNázev;Cena\nPlzeň 12°;65\nŘízek vepřový;180'}
        value={text}
        onChange={(e) => analyze(e.target.value)}
      />
      {preview.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-sm text-slate-300">
            🤖 AI klasifikovala {preview.length} položek (skryté z POS, doplněné EAN):
          </div>
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {preview.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-1.5 text-sm">
                <span className="text-white">{p.name}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="badge badge-gold">{CATEGORY_LABEL[p.category]}</span>
                  {p.subcategory} · {formatCZK(p.sellPrice)} · EAN {p.ean}
                </span>
              </div>
            ))}
          </div>
          <button type="button" onClick={confirm} className="btn btn-gold mt-4 w-full">
            Importovat {preview.length} položek
          </button>
        </div>
      )}
    </Modal>
  )
}

function printProcurement(items: InventoryItem[]): void {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) return
  const rows = items
    .map(
      (i) =>
        `<tr><td>${i.name}</td><td>${CATEGORY_LABEL[i.category]} / ${i.subcategory}</td><td>${i.stockQty} ${unitLabel(i.unit)}</td><td>${i.minQty} ${unitLabel(i.unit)}</td><td>${i.ean}</td></tr>`,
    )
    .join('')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Nákupní seznam</title>
    <style>
      body { font-family: Arial, sans-serif; color:#000; background:#fff; padding:24px; }
      h1 { font-size:20px; } p { color:#333; font-size:12px; }
      table { width:100%; border-collapse:collapse; margin-top:12px; font-size:12px; }
      th,td { border:1px solid #000; padding:6px 8px; text-align:left; }
      th { background:#eee; }
    </style></head><body>
    <h1>Nákupní seznam k vytištění</h1>
    <p>Položky pod minimální hladinou zásob — ${new Date().toLocaleDateString('cs-CZ')}</p>
    <table><thead><tr><th>Položka</th><th>Kategorie</th><th>Skladem</th><th>Minimum</th><th>EAN</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=function(){window.focus();window.print();}</script>
    </body></html>`)
  win.document.close()
}

export function InventoryHub() {
  const items = useInventoryStore((s) => s.items)
  const addItem = useInventoryStore((s) => s.addItem)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const togglePosVisible = useInventoryStore((s) => s.togglePosVisible)
  const runCommand = useInventoryStore((s) => s.runCommand)
  const lowStock = useMemo(
    () => items.filter((it) => it.minQty > 0 && it.stockQty <= it.minQty),
    [items],
  )

  const [tab, setTab] = useState<'vse' | InventoryCategory>('vse')
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null)
  const [command, setCommand] = useState('')
  const [commandMsg, setCommandMsg] = useState<string | null>(null)

  const filtered = useMemo(
    () => (tab === 'vse' ? items : items.filter((i) => i.category === tab)),
    [items, tab],
  )

  const runAi = () => {
    if (!command.trim()) return
    tap(760)
    setCommandMsg(runCommand(command.trim()))
    setCommand('')
  }

  const addBlank = () => {
    tap(760)
    const blank: InventoryItem = {
      id: uid('inv'),
      name: 'Nová položka',
      category: tab === 'vse' ? 'jidlo' : tab,
      subcategory: 'Ostatní',
      ean: generateEan(),
      unit: 'ks',
      stockQty: 0,
      minQty: 0,
      purchasePrice: 0,
      sellPrice: 0,
      vatRate: 21,
      isPosVisible: false,
      station: 'kitchen',
      photo: '📦',
      servingSize: 1,
      servingLabel: '1 ks',
    }
    addItem(blank)
    setEditItem(blank)
  }

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-white">Sklad & Inventura</h1>
          <p className="mt-1 text-slate-400">Enterprise skladová evidence s napojením na POS a odpisy zásob.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setImportOpen(true)} className="btn btn-ghost">
            📥 Import CSV/Excel
          </button>
          <button
            type="button"
            onClick={() => {
              tap(760)
              printProcurement(lowStock)
            }}
            disabled={lowStock.length === 0}
            className="btn btn-ghost disabled:opacity-40"
          >
            🖨️ Nákupní seznam ({lowStock.length})
          </button>
          <button type="button" onClick={addBlank} className="btn btn-gold">
            ➕ Nová položka
          </button>
        </div>
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <input
            className="input"
            placeholder='AI Skladový asistent — např. „Zvedni prodejní cenu u kategorie Pití o 10 %“'
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runAi()}
          />
          <button type="button" onClick={runAi} className="btn btn-gold shrink-0">
            Spustit
          </button>
        </div>
        {commandMsg && <div className="mt-2 text-sm text-gold">{commandMsg}</div>}
      </div>

      <div className="flex flex-wrap gap-2">
        {INVENTORY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              tap(600)
              setTab(t.id)
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.id ? 'bg-gold/20 text-gold' : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <div className="col-span-4">Položka</div>
          <div className="col-span-2">Kategorie</div>
          <div className="col-span-2 text-right">Sklad</div>
          <div className="col-span-1 text-right">Cena</div>
          <div className="col-span-3 text-right">Akce</div>
        </div>
        {/* fixed-height scroll: up to ~20 rows visible, gold scrollbar */}
        <div className="inv-scroll overflow-y-auto" style={{ maxHeight: 'min(70vh, 56rem)' }}>
          {filtered.map((it) => {
            const low = it.minQty > 0 && it.stockQty <= it.minQty
            return (
              <div key={it.id} className="grid grid-cols-12 items-center gap-2 border-b border-slate-900 px-4 py-2.5 text-sm">
                <div className="col-span-4 flex items-center gap-2">
                  <span className="text-xl">{it.photo}</span>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{it.name}</div>
                    <div className="text-[11px] text-slate-500">EAN {it.ean}</div>
                  </div>
                </div>
                <div className="col-span-2 text-slate-400">
                  <span className="badge badge-gold">{CATEGORY_LABEL[it.category]}</span>
                  <div className="mt-0.5 text-[11px]">{it.subcategory}</div>
                </div>
                <div className={`col-span-2 text-right ${low ? 'text-red-400' : 'text-slate-300'}`}>
                  {it.stockQty} {unitLabel(it.unit)}
                  {low && <div className="text-[10px]">pod minimem!</div>}
                </div>
                <div className="col-span-1 text-right text-gold">
                  {it.sellPrice > 0 ? formatCZK(it.sellPrice) : '—'}
                </div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      tap(700)
                      togglePosVisible(it.id)
                    }}
                    title={it.isPosVisible ? 'Skrýt z POS' : 'Zobrazit v POS'}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${
                      it.isPosVisible ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    🛒
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      tap(700)
                      setEditItem(it)
                    }}
                    title="Upravit"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold text-slate-950 text-lg"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      tap(440)
                      setConfirmDelete(it)
                    }}
                    title="Smazat"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white text-lg"
                  >
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500">Žádné položky v této kategorii.</p>
          )}
        </div>
      </div>

      {editItem && <EditModal key={editItem.id} item={editItem} onClose={() => setEditItem(null)} />}
      <ImporterModal open={importOpen} onClose={() => setImportOpen(false)} />

      <Modal open={!!confirmDelete} title="Smazat?" onClose={() => setConfirmDelete(null)} maxWidth="max-w-xs">
        <p className="mb-4 text-sm text-slate-300">
          Opravdu smazat položku <strong className="text-white">{confirmDelete?.name}</strong>?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirmDelete(null)} className="btn btn-ghost">
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmDelete) deleteItem(confirmDelete.id)
              setConfirmDelete(null)
            }}
            className="btn btn-danger"
          >
            Smazat
          </button>
        </div>
      </Modal>
    </div>
  )
}
