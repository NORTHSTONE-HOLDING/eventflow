import { useMemo, useState } from 'react'
import { ALLERGENS, MENU_FORMATS, MENU_THEMES, allergenCodesFor } from '../../lib/constants'
import { formatCZK } from '../../lib/format'
import { exportToWord } from '../../lib/docx'
import { tap } from '../../lib/feedback'
import { useAuthStore } from '../../store/useAuthStore'
import { useInventoryStore } from '../../store/useInventoryStore'
import type { InventoryItem, MenuFormat, MenuTheme } from '../../lib/types'

const FORMAT_WIDTH: Record<MenuFormat, number> = { A4: 460, A5: 360, DL: 260 }

export function PrintMenu() {
  const company = useAuthStore((s) => s.company)
  const items = useInventoryStore((s) => s.items)
  const [theme, setTheme] = useState<MenuTheme>('elegant-gold')
  const [format, setFormat] = useState<MenuFormat>('A4')
  const [kind, setKind] = useState<'jidlo' | 'piti'>('jidlo')

  const themeDef = MENU_THEMES.find((t) => t.id === theme)!
  const menuItems = useMemo(
    () => items.filter((i) => i.isPosVisible && i.category === kind),
    [items, kind],
  )
  const subcategories = useMemo(
    () => Array.from(new Set(menuItems.map((i) => i.subcategory))),
    [menuItems],
  )
  const usedAllergenCodes = useMemo(() => {
    const set = new Set<number>()
    menuItems.forEach((p) => allergenCodesFor(p.id).forEach((c) => set.add(c)))
    return Array.from(set).sort((a, b) => a - b)
  }, [menuItems])

  const title = kind === 'jidlo' ? 'Jídelní lístek' : 'Nápojový lístek'

  const buildHtml = (): string => {
    let html = `<h1 style="text-align:center">${company.companyName || 'EventFlow'}</h1><h2 style="text-align:center;border:none">${title}</h2>`
    subcategories.forEach((s) => {
      const group = menuItems.filter((p) => p.subcategory === s)
      if (group.length === 0) return
      html += `<h2>${s}</h2>`
      group.forEach((p: InventoryItem) => {
        const a = allergenCodesFor(p.id)
        html += `<div class="item"><span>${p.name} <sup>${a.join(',')}</sup> <em style="color:#777">(${p.servingLabel})</em></span><span class="price">${formatCZK(p.sellPrice)}</span></div>`
      })
    })
    html += `<div class="allergen-index"><strong>Index alergenů:</strong> ${usedAllergenCodes
      .map((c) => `${c} – ${ALLERGENS.find((a) => a.code === c)?.name}`)
      .join(' · ')}</div>`
    return html
  }

  const exportWord = () => {
    tap(760)
    exportToWord(`${title.replace(/\s/g, '_')}_${format}`, buildHtml())
  }

  const printMenu = () => {
    tap(760)
    const win = window.open('', '_blank', 'width=760,height=900')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${title}</title>
      <style>
        @page { size: ${format === 'A4' ? 'A4' : format === 'A5' ? 'A5' : '99mm 210mm'}; margin: 14mm; }
        body { font-family: Georgia, serif; color:#111; }
        h1 { font-size: 26px; letter-spacing: 1px; }
        h2 { font-size: 15px; border-bottom: 1px solid #999; padding-bottom: 3px; margin-top: 16px; }
        .item { display:flex; justify-content:space-between; margin:6px 0; }
        .price { font-weight:bold; }
        .allergen-index { font-size: 9px; color:#555; margin-top: 20px; border-top:1px solid #ccc; padding-top:8px; }
      </style></head><body>${buildHtml()}
      <script>window.onload=function(){window.focus();window.print();}</script>
      </body></html>`)
    win.document.close()
  }

  return (
    <div className="animate-fadeUp space-y-6">
      <div>
        <h1 className="font-display text-4xl text-white">Tiskový engine lístků</h1>
        <p className="mt-1 text-slate-400">
          Lístek se skládá z živého skladu (pouze prodejní položky). Interní tagy jsou skryté.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <div className="card p-4">
            <div className="label">Typ lístku</div>
            <div className="grid grid-cols-2 gap-2">
              {(['jidlo', 'piti'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`btn ${kind === k ? 'btn-gold' : 'btn-ghost'}`}>
                  {k === 'jidlo' ? '🍽️ Jídelní' : '🍷 Nápojový'}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="label">Téma (6 profesionálních)</div>
            <div className="grid grid-cols-2 gap-2">
              {MENU_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs transition ${
                    theme === t.id ? 'border-gold text-white' : 'border-slate-700 text-slate-400'
                  }`}
                >
                  <span className={`h-4 w-4 rounded-full bg-gradient-to-br ${t.swatch}`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="label">Formát</div>
            <div className="grid grid-cols-3 gap-2">
              {MENU_FORMATS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormat(f.id)} className={`btn ${format === f.id ? 'btn-gold' : 'btn-ghost'} px-2 text-xs`}>
                  {f.id}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button type="button" onClick={printMenu} className="btn btn-gold w-full">
              🖨️ Vytisknout (window.print)
            </button>
            <button type="button" onClick={exportWord} className="btn btn-ghost w-full">
              📥 Exportovat do Wordu (.docx)
            </button>
          </div>
        </div>

        <div className="flex justify-center overflow-x-auto">
          <div className={`rounded-lg border-2 p-6 shadow-2xl ${themeDef.body}`} style={{ width: FORMAT_WIDTH[format], minHeight: 560 }}>
            <div className="mb-4 text-center">
              <div className="font-display text-3xl font-bold">{company.companyName || 'EventFlow'}</div>
              <div className="text-sm uppercase tracking-[0.25em] opacity-70">{title}</div>
            </div>

            {subcategories.map((s) => {
              const group = menuItems.filter((p) => p.subcategory === s)
              if (group.length === 0) return null
              return (
                <div key={s} className="mb-4">
                  <div className="mb-2 border-b border-current pb-1 font-display text-xl font-semibold opacity-90">{s}</div>
                  <div className="space-y-1.5">
                    {group.map((p) => {
                      const a = allergenCodesFor(p.id)
                      return (
                        <div key={p.id} className="flex items-baseline justify-between gap-3">
                          <span className="text-sm">
                            {p.name}
                            <sup className="ml-1 opacity-60">{a.join(',')}</sup>
                            <span className="ml-1 text-xs opacity-50">({p.servingLabel})</span>
                          </span>
                          <span className="font-semibold">{formatCZK(p.sellPrice)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="mt-6 border-t border-current pt-2 text-[10px] leading-relaxed opacity-70">
              <strong>Index alergenů:</strong>{' '}
              {usedAllergenCodes.map((c) => `${c} – ${ALLERGENS.find((a) => a.code === c)?.name}`).join(' · ')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
