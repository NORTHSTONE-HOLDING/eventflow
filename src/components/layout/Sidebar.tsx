import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { useAuthStore } from '../../store/useAuthStore'
import { PRICING_PLANS } from '../../lib/constants'

export type MainView = 'dashboard' | 'planner' | 'menu' | 'audit'

interface SidebarProps {
  view: MainView
  onView: (v: MainView) => void
}

const NAV: { id: MainView; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Přehled', icon: '📊' },
  { id: 'planner', label: 'AI Plánovač', icon: '✨' },
  { id: 'menu', label: 'Tiskový lístek', icon: '📄' },
  { id: 'audit', label: 'Audit číšníků', icon: '🕵️' },
]

const TERMINALS: { to: string; label: string; icon: string }[] = [
  { to: '/pos-terminal', label: 'POS Terminál', icon: '🛒' },
  { to: '/kds-kitchen', label: 'KDS Kuchyně', icon: '🍳' },
  { to: '/kds-bar', label: 'KDS Bar', icon: '🍸' },
  { to: '/cctv-wall', label: 'CCTV Zeď', icon: '📹' },
]

export function Sidebar({ view, onView }: SidebarProps) {
  const company = useAuthStore((s) => s.company)
  const tier = useAuthStore((s) => s.tier)
  const logout = useAuthStore((s) => s.logout)
  const planName = PRICING_PLANS.find((p) => p.id === tier)?.name ?? 'Trial'

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80 p-4">
      <div className="mb-8 mt-1">
        <Logo size="md" />
      </div>

      <nav className="space-y-1">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onView(n.id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              view === n.id
                ? 'bg-gold/15 text-gold'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
        Izolované terminály
      </div>
      <nav className="space-y-1">
        {TERMINALS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800/60 hover:text-white"
          >
            <span>{t.icon}</span>
            {t.label}
            <span className="ml-auto text-slate-600">↗</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="text-sm font-semibold text-white">{company.companyName || 'Vaše agentura'}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
          <span className="badge badge-gold">{planName}</span>
          <span>{company.vatPayer ? 'plátce DPH' : 'neplátce DPH'}</span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-3 w-full rounded-lg border border-slate-700 py-1.5 text-xs text-slate-300 hover:border-red-500/60 hover:text-red-300"
        >
          Odhlásit se
        </button>
      </div>
    </aside>
  )
}
