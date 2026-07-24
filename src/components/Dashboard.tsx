import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, AlertTriangle, MonitorSmartphone } from 'lucide-react'
import { useAppStore, computeMetrics } from '../store/useAppStore'
import { formatCurrency, formatPercent } from '../lib/documentIds'
import type { EventProject } from '../types'
import { EventCalendarScheduler } from './EventCalendarScheduler'

const FALLBACK_CHART = [
  { name: 'Led', revenue: 120000, cost: 85000 },
  { name: 'Úno', revenue: 180000, cost: 120000 },
  { name: 'Bře', revenue: 210000, cost: 145000 },
  { name: 'Dub', revenue: 160000, cost: 110000 },
  { name: 'Kvě', revenue: 290000, cost: 190000 },
  { name: 'Čer', revenue: 340000, cost: 220000 },
  { name: 'Čvc', revenue: 450000, cost: 310000 },
]

const FALLBACK_MARGIN = [
  { name: 'CN001', margin: 24 },
  { name: 'CN002', margin: 18 },
  { name: 'CN003', margin: 31 },
  { name: 'CN004', margin: 22 },
]

export function Dashboard() {
  // Select stable primitives / arrays — never call getMetrics() inside a Zustand selector
  // (it allocates a new object every time → infinite re-render crash).
  const projects = useAppStore((s) => s.projects)
  const setView = useAppStore((s) => s.setView)
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const warehouseAlerts = useAppStore((s) => s.warehouseAlerts)
  const acknowledgeAlert = useAppStore((s) => s.acknowledgeAlert)

  const safeProjects: EventProject[] = useMemo(
    () => (Array.isArray(projects) ? projects.filter(Boolean) : []),
    [projects]
  )

  const metrics = useMemo(() => computeMetrics(safeProjects), [safeProjects])

  const activeAlerts = useMemo(
    () => (warehouseAlerts ?? []).filter((a) => !a.acknowledged).slice(0, 8),
    [warehouseAlerts]
  )

  const recommendations = metrics.aiRecommendations?.length
    ? metrics.aiRecommendations
    : ['Zatím žádná doporučení — vytvořte první akci v AI Planneru.']

  const chartData = useMemo(() => {
    if (!safeProjects.length) return FALLBACK_CHART
    return safeProjects
      .slice(0, 6)
      .reverse()
      .map((p) => ({
        name: (p.name || 'Projekt').slice(0, 12),
        revenue: Number(p.totalRevenue) || 0,
        cost: Number(p.totalCost) || 0,
      }))
  }, [safeProjects])

  const marginData = useMemo(() => {
    if (!safeProjects.length) return FALLBACK_MARGIN
    return safeProjects.slice(0, 5).map((p) => ({
      name: p.documents?.nabidka || '—',
      margin: Number((Number(p.margin) || 0).toFixed(1)),
    }))
  }, [safeProjects])

  const totalLaborBooked = useMemo(
    () =>
      safeProjects.reduce(
        (s, p) =>
          s +
          (p.shiftBookings ?? []).reduce((a, b) => a + (Number(b.laborCost) || 0), 0),
        0
      ),
    [safeProjects]
  )

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div>
          <h1 className="section-title gold-text">Dashboard</h1>
          <p className="section-sub">Přehled agentury · reálný čas</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => setView('planner')}
          >
            <Sparkles size={16} /> Nová akce přes AI
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setView('pos')}
          >
            <MonitorSmartphone size={16} /> Event POS / Kasa
          </button>
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <div
          className="panel"
          style={{
            marginBottom: 20,
            borderColor: 'rgba(239,68,68,0.45)',
            background: 'rgba(239,68,68,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <AlertTriangle size={18} color="#fca5a5" />
            <h3 style={{ fontSize: '1.1rem' }}>Skladové alerty z Event POS</h3>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeAlerts.map((a) => (
              <li
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-elevated)',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                }}
              >
                <span>
                  <strong style={{ color: '#fca5a5' }}>{a.itemName}</strong>
                  {' · '}
                  {a.projectName}
                  {' · zbývá '}
                  {a.percentLeft.toFixed(1)} %
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                  onClick={() => acknowledgeAlert(a.id)}
                >
                  OK
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: 'Počet akcí',
            value: String(metrics.eventCount ?? 0),
            sub: 'aktivní projekty',
          },
          {
            label: 'Obrat v Kč',
            value: formatCurrency(metrics.revenue ?? 0),
            sub: 'celkové výnosy',
          },
          {
            label: 'Průměrná marže v %',
            value: formatPercent(metrics.avgMargin || 0),
            sub: 'netto po nákladech včetně směn',
          },
          {
            label: 'Náklady na směny',
            value: formatCurrency(totalLaborBooked),
            sub: 'kalendář → rozpočet Personál',
          },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            className="panel glass-glow"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <div className="label">{m.label}</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.85rem',
                color: 'var(--gold)',
                margin: '0.35rem 0',
              }}
            >
              {m.value}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{m.sub}</div>
          </motion.div>
        ))}
      </div>

      <div
        className="responsive-2col"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div className="panel" style={{ minHeight: 300 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <TrendingUp size={18} color="var(--gold)" />
            <h3 style={{ fontSize: '1.2rem' }}>Obrat vs. náklady</h3>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#5c6675" fontSize={11} />
                <YAxis
                  stroke="#5c6675"
                  fontSize={11}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: '#161d26',
                    border: '1px solid rgba(212,175,55,0.3)',
                    borderRadius: 8,
                  }}
                  formatter={(v) => formatCurrency(Number(v ?? 0))}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#D4AF37"
                  fill="url(#goldGrad)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#5c6675"
                  fill="transparent"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <h3 style={{ fontSize: '1.2rem', marginBottom: 16 }}>Marže projektů</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={marginData}>
                <XAxis dataKey="name" stroke="#5c6675" fontSize={11} />
                <YAxis stroke="#5c6675" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: '#161d26',
                    border: '1px solid rgba(212,175,55,0.3)',
                    borderRadius: 8,
                  }}
                  formatter={(v) => `${v ?? 0} %`}
                />
                <Bar dataKey="margin" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <EventCalendarScheduler
          projects={safeProjects}
          onOpenPlanner={() => setView('planner')}
          onOpenProject={(id) => {
            setActiveProject(id)
            setView('planner')
          }}
        />
      </div>

      <div
        className="panel"
        style={{ marginBottom: 0 }}
      >
        <h3 style={{ fontSize: '1.2rem', marginBottom: 12 }}>
          AI Doporučení pro optimalizaci nákladů
        </h3>
          <ul
            style={{
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {recommendations.map((rec, i) => (
              <li
                key={`rec-${i}`}
                style={{
                  padding: '0.85rem 1rem',
                  background: 'var(--bg-elevated)',
                  borderRadius: 8,
                  borderLeft: '3px solid var(--gold)',
                  fontSize: '0.9rem',
                  color: 'var(--text-muted)',
                }}
              >
                {rec}
              </li>
            ))}
          </ul>

          {safeProjects.length > 0 ? (
            <div style={{ marginTop: 20 }}>
              <h4
                style={{
                  fontSize: '1rem',
                  marginBottom: 10,
                  color: 'var(--text-muted)',
                }}
              >
                Nedávné projekty
              </h4>
              {safeProjects.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActiveProject(p.id)
                    setView('planner')
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.7rem 0',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name || 'Bez názvu'}
                  </span>
                  <span className="badge badge-gold">
                    {p.documents?.nabidka || '—'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              style={{
                marginTop: 20,
                padding: '1rem',
                background: 'var(--bg-elevated)',
                borderRadius: 8,
                color: 'var(--text-dim)',
                fontSize: '0.9rem',
              }}
            >
              Zatím žádné projekty. Klikněte na „Nová akce přes AI".
            </div>
          )}
      </div>
    </div>
  )
}
