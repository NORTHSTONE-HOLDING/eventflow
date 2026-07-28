import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useInventoryStore } from '../../store/useInventoryStore'
import { usePosStore } from '../../store/usePosStore'
import { ALLERGENS, allergenCodesFor } from '../../lib/constants'
import { formatCZK } from '../../lib/format'
import { tap } from '../../lib/feedback'
import { Logo } from '../layout/Logo'
import type { InventoryItem } from '../../lib/types'

interface CartLine {
  item: InventoryItem
  qty: number
}

export function CustomerOrder() {
  const params = useParams<{ tableId: string }>()
  const rawId = params.tableId ?? ''
  const tableId = rawId.replace(/^stul-/, '')

  const items = useInventoryStore((s) => s.items)
  const tableById = usePosStore((s) => s.tableById)
  const submitOnlineOrder = usePosStore((s) => s.submitOnlineOrder)
  const table = tableById(tableId)

  const posItems = useMemo(() => items.filter((i) => i.isPosVisible && i.stockQty > 0), [items])
  const grouped = useMemo(() => {
    const map = new Map<string, InventoryItem[]>()
    for (const it of posItems) {
      const key = it.category === 'jidlo' ? 'Jídlo' : 'Pití'
      const arr = map.get(key) ?? []
      arr.push(it)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [posItems])

  const [cart, setCart] = useState<CartLine[]>([])
  const [phase, setPhase] = useState<'menu' | 'verifying' | 'done'>('menu')
  const [method, setMethod] = useState<'apple' | 'google'>('apple')

  const total = cart.reduce((s, l) => s + l.item.sellPrice * l.qty, 0)

  const add = (item: InventoryItem) => {
    tap(820)
    setCart((prev) => {
      const found = prev.find((l) => l.item.id === item.id)
      if (found) return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l))
      return [...prev, { item, qty: 1 }]
    })
  }
  const dec = (id: string) =>
    setCart((prev) =>
      prev
        .map((l) => (l.item.id === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    )

  const pay = (m: 'apple' | 'google') => {
    if (cart.length === 0) return
    setMethod(m)
    tap(990)
    setPhase('verifying')
    // Simulated biometric handshake verification.
    setTimeout(() => {
      const lines = cart.flatMap((l) =>
        Array.from({ length: l.qty }, () => ({
          inventoryId: l.item.id,
          name: l.item.name,
          price: l.item.sellPrice,
          station: l.item.station,
          servingSize: l.item.servingSize,
        })),
      )
      submitOnlineOrder(tableId, lines)
      setPhase('done')
    }, 1800)
  }

  if (phase === 'done') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 text-6xl">✅</div>
        <h1 className="font-display text-3xl text-white">Objednávka odeslána!</h1>
        <p className="mt-2 max-w-sm text-slate-400">
          Vaše objednávka byla zaplacena přes {method === 'apple' ? 'Apple Pay' : 'Google Pay'} a byla
          okamžitě odeslána do kuchyně a na bar. Děkujeme!
        </p>
        <div className="mt-4 rounded-xl border border-gold bg-gold/10 px-4 py-2 text-sm text-gold">
          📥 ONLINE OBJEDNÁVKA · {table ? table.name : `Stůl ${tableId.slice(-4)}`} · {formatCZK(total)}
        </div>
        <button
          type="button"
          onClick={() => {
            setCart([])
            setPhase('menu')
          }}
          className="btn btn-ghost mt-6"
        >
          Objednat znovu
        </button>
      </div>
    )
  }

  const usedAllergens = Array.from(
    new Set(posItems.flatMap((i) => allergenCodesFor(i.id))),
  ).sort((a, b) => a - b)

  return (
    <div className="min-h-screen pb-40">
      {phase === 'verifying' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur">
          <div className="animate-pulse text-6xl">{method === 'apple' ? '' : '🅶'}</div>
          <div className="mt-4 text-lg font-semibold text-white">
            Ověřuji biometrii ({method === 'apple' ? 'Face ID' : 'Google'})…
          </div>
          <div className="mt-2 text-sm text-slate-400">Bezpečný handshake platby {formatCZK(total)}</div>
        </div>
      )}

      <header className="border-b border-slate-800 bg-slate-950/90 px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo size="sm" />
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-gold">Samoobslužná objednávka</div>
            <div className="text-sm font-semibold text-white">{table ? table.name : `Stůl ${tableId.slice(-4)}`}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-4">
        {grouped.map(([label, list]) => (
          <div key={label} className="mb-6">
            <h2 className="mb-3 font-display text-2xl text-white">{label}</h2>
            <div className="space-y-2">
              {list.map((it) => {
                const a = allergenCodesFor(it.id)
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => add(it)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-left transition hover:border-gold/60 active:scale-[0.99]"
                  >
                    <span className="text-4xl">{it.photo}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{it.name}</div>
                      <div className="text-xs text-slate-400">
                        Porce {it.servingLabel} · alergeny: {a.join(', ') || '—'}
                      </div>
                    </div>
                    <div className="font-display text-lg text-gold">{formatCZK(it.sellPrice)}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[11px] leading-relaxed text-slate-500">
          <strong className="text-slate-400">Index alergenů:</strong>{' '}
          {usedAllergens
            .map((c) => `${c} – ${ALLERGENS.find((x) => x.code === c)?.name}`)
            .join(' · ')}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 max-h-32 space-y-1 overflow-y-auto">
              {cart.map((l) => (
                <div key={l.item.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{l.item.name}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => dec(l.item.id)} className="h-6 w-6 rounded bg-slate-800 text-white">
                      −
                    </button>
                    <span className="w-6 text-center text-white">{l.qty}</span>
                    <button type="button" onClick={() => add(l.item)} className="h-6 w-6 rounded bg-slate-800 text-white">
                      +
                    </button>
                    <span className="w-16 text-right font-semibold text-gold">
                      {formatCZK(l.item.sellPrice * l.qty)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-slate-400">Celkem</span>
              <span className="font-display text-2xl text-gold">{formatCZK(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => pay('apple')}
                className="btn flex items-center justify-center gap-2 rounded-xl bg-white py-3 font-semibold text-black"
              >
                 Apple Pay
              </button>
              <button
                type="button"
                onClick={() => pay('google')}
                className="btn flex items-center justify-center gap-2 rounded-xl bg-white py-3 font-semibold text-black"
              >
                🅶 Google Pay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
