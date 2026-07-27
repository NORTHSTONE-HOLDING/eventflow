import { useRef, useState } from 'react'
import { generatePlan } from '../../lib/planner'
import { formatCZK } from '../../lib/format'
import { useAuthStore } from '../../store/useAuthStore'
import type { EventPlan } from '../../lib/types'

export function AiPlanner() {
  const keyLocked = useAuthStore((s) => s.keyLocked)
  const [prompt, setPrompt] = useState(
    'Firemní večírek v Praze pro 180 lidí s rozpočtem 450 000 Kč, catering formou rautu a otevřený bar.',
  )
  const [plan, setPlan] = useState<EventPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'timeline' | 'shopping' | 'recipes'>('timeline')
  const [uploads, setUploads] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const run = () => {
    if (!prompt.trim()) return
    setLoading(true)
    // Simulated inference latency for the client-side engine.
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

  return (
    <div className="animate-fadeUp space-y-6">
      <div>
        <h1 className="font-display text-4xl text-white">Neurální AI Plánovač</h1>
        <p className="mt-1 text-slate-400">
          Zadejte český prompt — engine sestaví harmonogram, nákupní seznam i receptury.
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
            📎 Nahrát / Vyfotit podklady
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
              <div className="flex gap-2">
                <span className="badge badge-gold">{plan.guests} hostů</span>
                <span className="badge badge-gold">{plan.location}</span>
                <span className="badge badge-gold">{formatCZK(plan.budget)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              ['timeline', '🕒 Harmonogram'],
              ['shopping', '🛒 Nákupní seznam'],
              ['recipes', '📖 Receptury'],
            ] as const).map(([id, label]) => (
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
              {plan.timeline.map((b) => (
                <div key={b.time} className="flex gap-4 p-4">
                  <div className="w-16 shrink-0 font-mono text-lg font-bold text-gold">{b.time}</div>
                  <div>
                    <div className="font-semibold text-white">{b.title}</div>
                    <div className="text-sm text-slate-400">{b.detail}</div>
                  </div>
                </div>
              ))}
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
