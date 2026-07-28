import { useMemo, useState } from 'react'
import { useInventoryStore } from '../../store/useInventoryStore'
import { formatCZK } from '../../lib/format'
import { tap } from '../../lib/feedback'
import type { InventoryItem, ProductCategory } from '../../lib/types'

interface ProductGridProps {
  onPick: (product: InventoryItem) => void
}

const CAT_TO_INV: Record<ProductCategory, 'jidlo' | 'piti'> = { jidlo: 'jidlo', piti: 'piti' }

export function ProductGrid({ onPick }: ProductGridProps) {
  const items = useInventoryStore((s) => s.items)
  const [cat, setCat] = useState<ProductCategory>('jidlo')
  const [sub, setSub] = useState<string>('')

  const posItems = useMemo(
    () => items.filter((i) => i.isPosVisible && i.category === CAT_TO_INV[cat]),
    [items, cat],
  )

  const subcategories = useMemo(() => {
    const set = new Set(posItems.map((i) => i.subcategory))
    return Array.from(set)
  }, [posItems])

  const activeSub = sub && subcategories.includes(sub) ? sub : subcategories[0] ?? ''
  const tiles = posItems.filter((i) => i.subcategory === activeSub)

  const chooseCat = (c: ProductCategory) => {
    tap(700)
    setCat(c)
    setSub('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 grid grid-cols-2 gap-3">
        {(['jidlo', 'piti'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => chooseCat(c)}
            className={`btn ${cat === c ? 'btn-gold' : 'btn-ghost'} text-base`}
          >
            {c === 'jidlo' ? '🍽️ Jídlo' : '🍷 Pití'}
          </button>
        ))}
      </div>

      {/* spacious vertical margin separating parent tabs from subcategory layer */}
      <div className="mb-5 flex flex-wrap gap-2">
        {subcategories.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              tap(620)
              setSub(s)
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeSub === s ? 'bg-gold/20 text-gold' : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto pr-1 sm:grid-cols-3">
        {tiles.map((p) => {
          const soldOut = p.stockQty <= 0
          return (
            <button
              key={p.id}
              type="button"
              disabled={soldOut}
              onClick={() => {
                tap(880)
                onPick(p)
              }}
              className="group relative flex min-h-[8.5rem] flex-col overflow-hidden rounded-2xl border border-slate-800 transition hover:border-gold/60 hover:shadow-gold active:scale-[0.97] disabled:opacity-40"
            >
              {/* product photo background layer (emoji stand-in on a gradient) */}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-700/70 via-slate-800 to-slate-950" />
              <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-70 transition group-hover:scale-110">
                {p.photo}
              </div>
              {soldOut && (
                <div className="absolute right-2 top-2 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  VYPRODÁNO
                </div>
              )}
              {/* solid semi-transparent bottom bar with name + price */}
              <div className="relative mt-auto w-full bg-slate-950/85 px-3 py-2 backdrop-blur-sm">
                <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg text-gold">{formatCZK(p.sellPrice)}</span>
                  <span className="text-[10px] text-slate-400">{p.servingLabel}</span>
                </div>
              </div>
            </button>
          )
        })}
        {tiles.length === 0 && (
          <p className="col-span-full pt-8 text-center text-sm text-slate-500">
            Žádné prodejní položky v této kategorii. Zapněte je 🟢 ve Skladu.
          </p>
        )}
      </div>
    </div>
  )
}
