import { useState } from 'react'
import { motion, Reorder } from 'framer-motion'
import {
  Sparkles,
  GripVertical,
  Check,
  Calculator,
  Utensils,
  ListChecks,
  Loader2,
} from 'lucide-react'
import { useAppStore, selectActiveProject } from '../store/useAppStore'
import { formatCurrency } from '../lib/documentIds'
import type { AgencyProfile, CateringItem, ChecklistItem, EventProject, TimelineItem } from '../types'

export function AIPlanner() {
  const [prompt, setPrompt] = useState(
    'Firemní večírek pro 180 lidí v Praze s rozpočtem 450 000 Kč.'
  )
  const createFromPrompt = useAppStore((s) => s.createFromPrompt)
  const aiLoading = useAppStore((s) => s.aiLoading)
  const project = useAppStore(selectActiveProject)
  const updateTimeline = useAppStore((s) => s.updateTimeline)
  const updateChecklist = useAppStore((s) => s.updateChecklist)
  const profile = useAppStore((s) => s.profile)
  const [tab, setTab] = useState<'timeline' | 'budget' | 'catering' | 'checklist'>('timeline')

  const handleGenerate = async () => {
    if (!prompt.trim() || aiLoading) return
    await createFromPrompt(prompt.trim())
    setTab('timeline')
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="section-title gold-text">Neural AI Planner</h1>
      <p className="section-sub">
        Zadejte přirozený český prompt — AI vytvoří harmonogram, rozpočet, catering i checklist.
      </p>

      <div className="panel" style={{ marginBottom: 24 }}>
        <label className="label">AI Prompt</label>
        <textarea
          className="textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='např. "Svatba pro 80 lidí v Brně s rozpočtem 280 000 Kč."'
          style={{ minHeight: 90 }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-gold" onClick={handleGenerate} disabled={aiLoading}>
            {aiLoading ? (
              <>
                <Loader2 size={16} className="spin" /> Generuji akci…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Spustit AI Engine
              </>
            )}
          </button>
          {project && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge badge-gold">{project.documents.nabidka}</span>
              <span className="badge badge-gold">{project.documents.smlouva}</span>
              <span className="badge badge-gold">{project.documents.faktura}</span>
              <span className="badge badge-gold">{project.documents.protokol}</span>
            </div>
          )}
        </div>
      </div>

      {project && (
        <>
          <div
            className="panel"
            style={{
              marginBottom: 20,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              background: 'linear-gradient(135deg, rgba(212,175,55,0.08), transparent)',
            }}
          >
            <DocHeader profile={profile} project={project} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {(
              [
                ['timeline', 'Harmonogram', GripVertical],
                ['budget', 'Rozpočet', Calculator],
                ['catering', 'Catering', Utensils],
                ['checklist', 'Checklist', ListChecks],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                className={tab === id ? 'btn btn-gold' : 'btn btn-ghost'}
                onClick={() => setTab(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {tab === 'timeline' && (
            <TimelineBoard
              items={project.timeline ?? []}
              onChange={(timeline) => updateTimeline(project.id, timeline)}
            />
          )}
          {tab === 'budget' && <BudgetView project={project} />}
          {tab === 'catering' && <CateringView items={project.catering ?? []} />}
          {tab === 'checklist' && (
            <ChecklistView
              items={project.checklist ?? []}
              onToggle={(id) => {
                updateChecklist(
                  project.id,
                  (project.checklist ?? []).map((c) =>
                    c.id === id ? { ...c, done: !c.done } : c
                  )
                )
              }}
              onQuickAll={() => {
                updateChecklist(
                  project.id,
                  (project.checklist ?? []).map((c) => ({ ...c, done: true }))
                )
              }}
            />
          )}
        </>
      )}

      {!project && !aiLoading && (
        <div className="panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Zatím žádný projekt. Spusťte AI Engine výše.
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function DocHeader({
  profile,
  project,
}: {
  profile: AgencyProfile
  project: EventProject
}) {
  return (
    <>
      <div>
        <div className="label">Projekt</div>
        <div style={{ fontWeight: 600 }}>{project.name}</div>
      </div>
      <div>
        <div className="label">Hosté</div>
        <div>{project.guests}</div>
      </div>
      <div>
        <div className="label">Lokalita</div>
        <div>{project.location}</div>
      </div>
      <div>
        <div className="label">Marže</div>
        <div style={{ color: 'var(--gold)' }}>{project.margin.toFixed(1)} %</div>
      </div>
      <div>
        <div className="label">Agentura</div>
        <div>{profile.companyName || '—'}</div>
      </div>
      <div>
        <div className="label">IČO / DIČ</div>
        <div>
          {profile.ico || '—'} / {profile.dic || '—'}
        </div>
      </div>
    </>
  )
}

function TimelineBoard({
  items,
  onChange,
}: {
  items: TimelineItem[]
  onChange: (items: TimelineItem[]) => void
}) {
  const safeItems = Array.isArray(items) ? items : []

  if (!safeItems.length) {
    return (
      <div className="panel" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
        Harmonogram je prázdný — spusťte AI Engine pro výchozí milníky.
      </div>
    )
  }

  return (
    <div className="panel">
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
        Přetáhněte milníky pro změnu pořadí (drag & drop).
      </p>
      <Reorder.Group
        axis="y"
        values={safeItems}
        onReorder={(next) =>
          onChange(next.map((item, order) => ({ ...item, order })))
        }
        style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {safeItems.map((item) => (
          <Reorder.Item
            key={item.id}
            value={item}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '1rem',
              background: 'var(--bg-elevated)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              cursor: 'grab',
            }}
            whileDrag={{ scale: 1.02, boxShadow: '0 0 30px rgba(212,175,55,0.25)' }}
          >
            <GripVertical size={18} color="var(--gold)" />
            <input
              className="input"
              style={{ width: 80, padding: '0.4rem 0.6rem' }}
              value={item.time}
              onChange={(e) =>
                onChange(
                  safeItems.map((t) =>
                    t.id === item.id ? { ...t, time: e.target.value } : t
                  )
                )
              }
            />
            <div style={{ flex: 1 }}>
              <input
                className="input"
                style={{ marginBottom: 6, padding: '0.4rem 0.6rem' }}
                value={item.title}
                onChange={(e) =>
                  onChange(
                    safeItems.map((t) =>
                      t.id === item.id ? { ...t, title: e.target.value } : t
                    )
                  )
                }
              />
              <input
                className="input"
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}
                value={item.description}
                onChange={(e) =>
                  onChange(
                    safeItems.map((t) =>
                      t.id === item.id ? { ...t, description: e.target.value } : t
                    )
                  )
                }
              />
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  )
}

function BudgetView({ project }: { project: EventProject }) {
  return (
    <div className="panel">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          ['Celkové náklady', formatCurrency(project.totalCost)],
          ['Výnos', formatCurrency(project.totalRevenue)],
          ['Čistý zisk', formatCurrency(project.netProfit)],
          ['Marže', `${project.margin.toFixed(1)} %`],
        ].map(([l, v]) => (
          <div key={l} style={{ background: 'var(--bg-elevated)', padding: 14, borderRadius: 8 }}>
            <div className="label">{l}</div>
            <div style={{ fontSize: '1.25rem', color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>
              {v}
            </div>
          </div>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ color: 'var(--text-dim)', textAlign: 'left' }}>
            <th style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>Kategorie</th>
            <th style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>Popis</th>
            <th style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>DPH</th>
            <th style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Částka</th>
          </tr>
        </thead>
        <tbody>
          {(project.budgetLines ?? []).map((line) => (
            <tr key={line.id}>
              <td style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="badge badge-gold">{line.category}</span>
              </td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {line.description}
              </td>
              <td style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>{line.vatRate} %</td>
              <td
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'right',
                  color: line.isCost ? 'var(--text)' : 'var(--gold)',
                  fontWeight: 600,
                }}
              >
                {formatCurrency(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CateringView({ items }: { items: CateringItem[] }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) {
    return (
      <div className="panel" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
        Catering je prázdný — přidejte položky přes AI Vision Scan nebo AI Planner.
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {list.map((item) => (
        <motion.div
          key={item.id}
          className="panel glass-glow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>{item.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
                {item.recipe}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--gold)', fontWeight: 600 }}>{formatCurrency(item.sellPrice || 0)}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                food cost {formatCurrency(item.foodCost)}
              </div>
              <div className="badge badge-gold" style={{ marginTop: 4 }}>{item.category}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {(item.allergens ?? []).map((a) => (
              <span key={a} className="badge badge-warning">{a}</span>
            ))}
            {(item.allergens ?? []).length === 0 && <span className="badge badge-success">bez alergenů</span>}
          </div>
          <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'var(--text-dim)' }}>
            Inventář: {(item.inventory ?? []).join(' · ') || '—'}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function ChecklistView({
  items,
  onToggle,
  onQuickAll,
}: {
  items: ChecklistItem[]
  onToggle: (id: string) => void
  onQuickAll: () => void
}) {
  const list = Array.isArray(items) ? items : []
  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: '1.15rem' }}>Automatický task board</h3>
        <button type="button" className="btn btn-ghost" onClick={onQuickAll} disabled={!list.length}>
          ✔ Označit vše
        </button>
      </div>
      {!list.length ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>
          Checklist je prázdný.
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {list.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className="glass-glow"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '1rem',
              background: item.done ? 'var(--gold-subtle)' : 'var(--bg-elevated)',
              border: `1px solid ${item.done ? 'var(--border-strong)' : 'var(--border)'}`,
              borderRadius: 10,
              cursor: 'pointer',
              color: item.done ? 'var(--gold)' : 'var(--text)',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border: `2px solid ${item.done ? 'var(--gold)' : 'var(--text-dim)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: item.done ? 'var(--gold)' : 'transparent',
                color: '#0b0f14',
              }}
            >
              {item.done && <Check size={14} />}
            </span>
            ✔ {item.label}
          </button>
        ))}
      </div>
      )}
    </div>
  )
}
