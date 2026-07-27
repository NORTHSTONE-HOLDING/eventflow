import { useMemo, useState } from 'react'
import { ALLERGENS, CATALOG, MENU_FORMATS, MENU_THEMES, SUBCATEGORIES } from '../../lib/constants'
import { formatCZK } from '../../lib/format'
import { exportToWord } from '../../lib/docx'
import { useAuthStore } from '../../store/useAuthStore'
import type { MenuFormat, MenuTheme, Product } from '../../lib/types'

// Deterministically assign allergen codes to products for the printed index.
function allergensFor(p: Product): number[] {
  const pool = ALLERGENS.map((a) => a.code)
  const seed = p.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const count = (seed % 3) + 1
  const codes: number[] = []
  for (let i = 0; i < count; i++) codes.push(pool[(seed + i * 3) % pool.length])
  return Array.from(new Set(codes)).sort((a, b) => a - b)
}

const FORMAT_WIDTH: Record<MenuFormat, number> = { A4: 460, A5: 360, DL: 260 }

export function PrintMenu() {
  const company = useAuthStore((s) => s.company)
  const [theme, setTheme] = useState<MenuTheme>('elegant-gold')
  const [format, setFormat] = useState<MenuFormat>('A4')
  const [kind, setKind] = useState<'jidlo' | 'piti'>('jidlo')

  const themeDef = MENU_THEMES.find((t) => t.id === theme)!
  const items = CATALOG.filter((p) => p.category === kind)
  const subs = SUBCATEGORIES[kind]

  const usedAllergenCodes = useMemo(() => {
    const set = new Set<number>()
    items.forEach((p) => allergensFor(p).forEach((c) => set.add(c)))
    return Array.from(set).sort((a, b) => a - b)
  }, [items])

  const exportWord = () => {
    const title = kind === 'jidlo' ? 'Jídelní lístek' : 'Nápojový lístek'
    let html = `<h1>${company.companyName || 'EventFlow'}</h1><h2>${title}</h2>`
    subs.forEach((s) => {
      const group = items.filter((p) => p.subcategory === s.id)
      if (group.length === 0) return
      html += `<h2>${s.label}</h2>`
      group.forEach((p) => {
        const a = allergensFor(p)
        html += `<div class="item"><span>${p.name} <sup>${a.join(',')}</sup></span><span class="price">${formatCZK(p.price)}</span></div>`
      })
    })
    html += `<div class="allergen-index"><strong>Index alergenů:</strong> ${usedAllergenCodes
      .map((c) => `${c} – ${ALLERGENS.find((a) => a.code === c)?.name}`)
      .join(' · ')}</div>`
    exportToWord(`${title.replace(/\s/g, '_')}_${format}`, html)
  }

  return (
    <div className="animate-fadeUp space-y-6">
      <div>
        <h1 className="font-display text-4xl text-white">Tiskový engine lístků</h1>
        <p className="mt-1 text-slate-400">
          Sestavte jídelní/nápojový lístek z živého skladu, zvolte téma a formát a exportujte do Wordu.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <div className="card p-4">
            <div className="label">Typ lístku</div>
            <div className="grid grid-cols-2 gap-2">
              {(['jidlo', 'piti'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`btn ${kind === k ? 'btn-gold' : 'btn-ghost'}`}
                >
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
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`btn ${format === f.id ? 'btn-gold' : 'btn-ghost'} px-2 text-xs`}
                >
                  {f.id}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={exportWord} className="btn btn-gold w-full">
            📥 Exportovat do Wordu (.docx)
          </button>
        </div>

        <div className="flex justify-center overflow-x-auto">
          <div
            className={`rounded-lg border-2 p-6 shadow-2xl ${themeDef.body}`}
            style={{ width: FORMAT_WIDTH[format], minHeight: 560 }}
          >
            <div className="mb-4 text-center">
              <div className="font-display text-3xl font-bold">{company.companyName || 'EventFlow'}</div>
              <div className="text-sm uppercase tracking-[0.25em] opacity-70">
                {kind === 'jidlo' ? 'Jídelní lístek' : 'Nápojový lístek'}
              </div>
            </div>

            {subs.map((s) => {
              const group = items.filter((p) => p.subcategory === s.id)
              if (group.length === 0) return null
              return (
                <div key={s.id} className="mb-4">
                  <div className="mb-2 border-b border-current pb-1 font-display text-xl font-semibold opacity-90">
                    {s.label}
                  </div>
                  <div className="space-y-1.5">
                    {group.map((p) => {
                      const a = allergensFor(p)
                      return (
                        <div key={p.id} className="flex items-baseline justify-between gap-3">
                          <span className="text-sm">
                            {p.name}
                            <sup className="ml-1 opacity-60">{a.join(',')}</sup>
                          </span>
                          <span className="font-semibold">{formatCZK(p.price)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="mt-6 border-t border-current pt-2 text-[10px] leading-relaxed opacity-70">
              <strong>Index alergenů:</strong>{' '}
              {usedAllergenCodes
                .map((c) => `${c} – ${ALLERGENS.find((a) => a.code === c)?.name}`)
                .join(' · ')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
