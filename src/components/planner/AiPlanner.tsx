import { useRef, useState } from 'react'
import { generatePlan } from '../../lib/planner'
import { formatCZK } from '../../lib/format'
import { ALLERGENS } from '../../lib/constants'
import { useAuthStore } from '../../store/useAuthStore'
import { tap } from '../../lib/feedback'
import type { EventPlan, TimelineBlock } from '../../lib/types'

type Tab = 'timeline' | 'budget' | 'catering' | 'checklist' | 'shopping' | 'recipes'

export function AiPlanner() {
  const keyLocked = useAuthStore((s) => s.keyLocked)
  const [prompt, setPrompt] = useState(
    'Firemní večírek pro 180 lidí v Praze s rozpočtem 450 000 Kč, raut a otevřený bar.',
  )
  const [plan, setPlan] = useState<EventPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('timeline')
  const [uploads, setUploads] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = () => {
    if (!prompt.trim()) return
    tap(880)
    setLoading(true)
    setTimeout(() => {
      setPlan(generatePlan(prompt.trim()))
      setTab('timeline')
      setLoading(false)
    }, 650)
  }

  const onFiles = (files: FileList | null) => {
    if (!files) return
    setUploads((prev) => [...prev, ...Array.from(files).map((f) => f.name)])
  }

  const reorderTimeline = (targetId: string) => {
    if (!plan || !dragId || dragId === targetId) return
    const list = [...plan.timeline]
    const from = list.findIndex((t) => t.id === dragId)
    const to = list.findIndex((t) => t.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    setPlan({ ...plan, timeline: list })
    setDragId(null)
  }

  const toggleCheck = (id: string) => {
    if (!plan) return
    setPlan({
      ...plan,
      checklist: plan.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    })
  }

  const TABS: [Tab, string][] = [
    ['timeline', '🕒 Harmonogram'],
    ['budget', '🧮 Rozpočet DPH'],
    ['catering', '🍽️ Catering'],
    ['checklist', '✅ Checklist'],
    ['shopping', '🛒 Nákup'],
    ['recipes', '📖 Receptury'],
  ]

  return (
    <div className="animate-fadeUp space-y-6">
      <div>
        <h1 className="font-display text-4xl text-white">Neurální AI Plánovač</h1>
        <p className="mt-1 text-slate-400">
          Český prompt → harmonogram, vícesazbový rozpočet DPH, catering a checklist.
          {keyLocked ? ' (OpenAI klíč aktivní)' : ' (offline simulace)'}
        </p>
      </div>

      <div className="card p-5">
        <label className="label">Popis akce</label>
        <textarea
          className="input min-h-[96px]"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='např. "Svatba pro 120 hostů v Brně s rozpočtem 350 000 Kč."'
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={run} disabled={loading} className="btn btn-gold disabled:opacity-50">
            {loading ? '⏳ Generuji…' : '✨ Spustit AI Engine'}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ghost">
            📎 Nahrát / Vyfotit podklady pro rozpočet
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.xls,.xlsx,.csv,image/*"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        {uploads.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {uploads.map((u, i) => (
              <span key={`${u}-${i}`} className="badge bg-slate-700 text-slate-200">
                📄 {u}
              </span>
            ))}
          </div>
        )}
      </div>

      {plan && (
        <div className="animate-fadeUp space-y-5">
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-white">{plan.title}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">{plan.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-gold">{plan.docs.nabidka}</span>
                <span className="badge badge-gold">{plan.docs.smlouva}</span>
                <span className="badge badge-gold">{plan.docs.faktura}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`btn ${tab === id ? 'btn-gold' : 'btn-ghost'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'timeline' && (
            <div className="card divide-y divide-slate-800">
              <p className="px-4 pt-4 text-xs text-slate-500">Přetáhněte bloky pro změnu pořadí (drag &amp; drop).</p>
              {plan.timeline.map((b: TimelineBlock) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={() => setDragId(b.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorderTimeline(b.id)}
                  className={`flex cursor-grab items-center gap-4 p-4 active:cursor-grabbing ${
                    dragId === b.id ? 'opacity-50' : ''
                  }`}
                >
                  <span className="text-slate-600">⠿</span>
                  <div className="w-16 shrink-0 font-mono text-lg font-bold text-gold">{b.time}</div>
                  <div>
                    <div className="font-semibold text-white">{b.title}</div>
                    <div className="text-sm text-slate-400">{b.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'budget' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Náklady', formatCZK(plan.totals.cost)],
                  ['Výnos', formatCZK(plan.totals.revenue)],
                  ['Zisk', formatCZK(plan.totals.profit)],
                  ['Marže', `${plan.totals.margin.toFixed(1)} %`],
                ].map(([l, v]) => (
                  <div key={l} className="card p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-400">{l}</div>
                    <div className="mt-1 font-display text-xl text-gold">{v}</div>
                  </div>
                ))}
              </div>

              <div className="card p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2">Kategorie</th>
                      <th className="py-2">Popis</th>
                      <th className="py-2">DPH</th>
                      <th className="py-2 text-right">Částka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.budgetLines.map((l) => (
                      <tr key={l.id} className="border-t border-slate-800">
                        <td className="py-2.5">
                          <span className="badge badge-gold">{l.category}</span>
                        </td>
                        <td className="py-2.5 text-slate-400">{l.description}</td>
                        <td className="py-2.5">{l.vatRate === 0 ? '0 % (přenesená)' : `${l.vatRate} %`}</td>
                        <td className={`py-2.5 text-right font-semibold ${l.isCost ? 'text-white' : 'text-gold'}`}>
                          {l.isCost ? '' : '+ '}
                          {formatCZK(l.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card p-4">
                <h3 className="mb-3 font-semibold text-white">Vícesazbová matice DPH</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-1.5">Sazba</th>
                      <th className="py-1.5 text-right">Základ</th>
                      <th className="py-1.5 text-right">Daň</th>
                      <th className="py-1.5 text-right">Celkem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.totals.vatByRate.map((v) => (
                      <tr key={v.rate} className="border-t border-slate-800">
                        <td className="py-1.5">{v.rate === 0 ? '0 % přenesená' : `${v.rate} %`}</td>
                        <td className="py-1.5 text-right">{formatCZK(v.base)}</td>
                        <td className="py-1.5 text-right">{formatCZK(v.vat)}</td>
                        <td className="py-1.5 text-right font-semibold text-gold">{formatCZK(v.base + v.vat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'catering' && (
            <div className="card p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-2">Položka</th>
                    <th className="py-2 text-right">Porce</th>
                    <th className="py-2 text-right">Cena/ks</th>
                    <th className="py-2">Alergeny</th>
                    <th className="py-2 text-right">Celkem</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.catering.map((c) => (
                    <tr key={c.id} className="border-t border-slate-800">
                      <td className="py-2.5 font-medium text-white">{c.name}</td>
                      <td className="py-2.5 text-right text-slate-300">{c.portions}</td>
                      <td className="py-2.5 text-right text-slate-300">{formatCZK(c.unitPrice)}</td>
                      <td className="py-2.5 text-slate-400">{c.allergens.join(', ')}</td>
                      <td className="py-2.5 text-right font-semibold text-gold">
                        {formatCZK(c.unitPrice * c.portions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 text-[11px] text-slate-500">
                {Array.from(new Set(plan.catering.flatMap((c) => c.allergens)))
                  .sort((a, b) => a - b)
                  .map((code) => `${code} – ${ALLERGENS.find((x) => x.code === code)?.name}`)
                  .join(' · ')}
              </div>
            </div>
          )}

          {tab === 'checklist' && (
            <div className="card p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {plan.checklist.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCheck(c.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left ${
                      c.done ? 'border-gold bg-gold/10 text-gold' : 'border-slate-800 bg-slate-900/60 text-slate-300'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                        c.done ? 'border-gold bg-gold text-slate-950' : 'border-slate-600'
                      }`}
                    >
                      {c.done ? '✓' : ''}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'shopping' && (
            <div className="card p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-2">Položka</th>
                    <th className="py-2">Množství</th>
                    <th className="py-2">Poznámka</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.shopping.map((s) => (
                    <tr key={s.item} className="border-t border-slate-800">
                      <td className="py-2.5 font-medium text-white">{s.item}</td>
                      <td className="py-2.5 text-gold">{s.qty}</td>
                      <td className="py-2.5 text-slate-400">{s.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'recipes' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {plan.recipes.map((r) => (
                <div key={r.name} className="card p-4">
                  <h3 className="mb-2 font-display text-xl text-white">{r.name}</h3>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
                    {r.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
