import { useState } from 'react'
import { CATALOG, SUBCATEGORIES } from '../../lib/constants'
import { formatCZK } from '../../lib/format'
import { tap } from '../../lib/feedback'
import type { Product, ProductCategory } from '../../lib/types'

interface ProductGridProps {
  onPick: (product: Product) => void
}

export function ProductGrid({ onPick }: ProductGridProps) {
  const [cat, setCat] = useState<ProductCategory>('jidlo')
  const [sub, setSub] = useState<string>('predkrmy')

  const chooseCat = (c: ProductCategory) => {
    tap(700)
    setCat(c)
    setSub(SUBCATEGORIES[c][0].id)
  }

  const items = CATALOG.filter((p) => p.category === cat && p.subcategory === sub)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['jidlo', 'piti'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => chooseCat(c)}
            className={`btn ${cat === c ? 'btn-gold' : 'btn-ghost'}`}
          >
            {c === 'jidlo' ? '🍽️ Jídlo' : '🍷 Pití'}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SUBCATEGORIES[cat].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              tap(620)
              setSub(s.id)
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              sub === s.id
                ? 'bg-gold/20 text-gold'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              tap(880)
              onPick(p)
            }}
            className="group relative flex min-h-[7rem] flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-800/80 to-slate-900 p-3 text-left transition hover:border-gold/60 hover:shadow-gold active:scale-[0.97]"
          >
            <div className="absolute -right-2 -top-3 text-5xl opacity-30 transition group-hover:opacity-60">
              {p.photo}
            </div>
            <div className="relative text-2xl">{p.photo}</div>
            <div className="relative">
              <div className="text-sm font-semibold leading-tight text-white">{p.name}</div>
              <div className="mt-1 font-display text-lg text-gold">{formatCZK(p.price)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
