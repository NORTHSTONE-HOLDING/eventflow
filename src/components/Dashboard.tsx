import { useMemo, useState } from 'react'
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
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns'
import { cs } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Sparkles, TrendingUp } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { formatCurrency, formatPercent } from '../lib/documentIds'

export function Dashboard() {
  const metrics = useAppStore((s) => s.getMetrics())
  const projects = useAppStore((s) => s.projects)
  const setView = useAppStore((s) => s.setView)
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const [month, setMonth] = useState(new Date(2026, 6, 1))

  const chartData = useMemo(() => {
    if (projects.length === 0) {
      return [
        { name: 'Led', revenue: 120000, cost: 85000 },
        { name: 'Úno', revenue: 180000, cost: 120000 },
        { name: 'Bře', revenue: 210000, cost: 145000 },
        { name: 'Dub', revenue: 160000, cost: 110000 },
        { name: 'Kvě', revenue: 290000, cost: 190000 },
        { name: 'Čer', revenue: 340000, cost: 220000 },
        { name: 'Čvc', revenue: metrics.revenue || 450000, cost: metrics.revenue ? metrics.revenue * 0.72 : 310000 },
      ]
    }
    return projects.slice(0, 6).reverse().map((p) => ({
      name: p.name.slice(0, 12),
      revenue: p.totalRevenue,
      cost: p.totalCost,
    }))
  }, [projects, metrics.revenue])

  const marginData = useMemo(
    () =>
      projects.length
        ? projects.slice(0, 5).map((p) => ({ name: p.documents.nabidka, margin: Number(p.margin.toFixed(1)) }))
        : [
            { name: 'CN001', margin: 24 },
            { name: 'CN002', margin: 18 },
            { name: 'CN003', margin: 31 },
            { name: 'CN004', margin: 22 },
          ],
    [projects]
  )

  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  })

  const eventDates = projects.map((p) => p.date)

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <div>
          <h1 className="section-title gold-text">Dashboard</h1>
          <p className="section-sub">Přehled agentury · reálný čas</p>
        </div>
        <button className="btn btn-gold" onClick={() => setView('planner')}>
          <Sparkles size={16} /> Nová akce přes AI
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          { label: 'Počet akcí', value: String(metrics.eventCount), sub: 'aktivní projekty' },
          { label: 'Obrat v Kč', value: formatCurrency(metrics.revenue), sub: 'celkové výnosy' },
          { label: 'Průměrná marže v %', value: formatPercent(metrics.avgMargin || 24.5), sub: 'netto po nákladech' },
          { label: 'AI Doporučení', value: String(metrics.aiRecommendations.length), sub: 'pro optimalizaci nákladů' },
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

      <div className="responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="panel" style={{ minHeight: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={18} color="var(--gold)" />
            <h3 style={{ fontSize: '1.2rem' }}>Obrat vs. náklady</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#5c6675" fontSize={11} />
              <YAxis stroke="#5c6675" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: '#161d26', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8 }}
                formatter={(v) => formatCurrency(Number(v ?? 0))}
              />
              <Area type="monotone" dataKey="revenue" stroke="#D4AF37" fill="url(#goldGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="cost" stroke="#5c6675" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3 style={{ fontSize: '1.2rem', marginBottom: 16 }}>Marže projektů</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={marginData}>
              <XAxis dataKey="name" stroke="#5c6675" fontSize={11} />
              <YAxis stroke="#5c6675" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#161d26', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8 }}
                formatter={(v) => `${v} %`}
              />
              <Bar dataKey="margin" fill="#D4AF37" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.2rem' }}>Kalendář</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setMonth(subMonths(month, 1))}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '6px 8px' }}>
                {format(month, 'LLLL yyyy', { locale: cs })}
              </span>
              <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 8 }}>
            {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((d) => (
              <div key={d} style={{ textAlign: 'center' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: (days[0].getDay() + 6) % 7 }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {days.map((day) => {
              const hasEvent = eventDates.some((d) => isSameDay(new Date(d), day))
              return (
                <div
                  key={day.toISOString()}
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    background: hasEvent ? 'var(--gold-subtle)' : 'transparent',
                    color: hasEvent ? 'var(--gold)' : 'var(--text-muted)',
                    border: hasEvent ? '1px solid var(--border-strong)' : '1px solid transparent',
                    fontWeight: hasEvent ? 600 : 400,
                  }}
                >
                  {format(day, 'd')}
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <h3 style={{ fontSize: '1.2rem', marginBottom: 12 }}>AI Doporučení pro optimalizaci nákladů</h3>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {metrics.aiRecommendations.map((rec, i) => (
              <li
                key={i}
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

          {projects.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontSize: '1rem', marginBottom: 10, color: 'var(--text-muted)' }}>Nedávné projekty</h4>
              {projects.slice(0, 4).map((p) => (
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
                  }}
                >
                  <span>{p.name}</span>
                  <span className="badge badge-gold">{p.documents.nabidka}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .dash-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
