import { useState } from 'react'
import {
  LayoutDashboard,
  Sparkles,
  Camera,
  Users,
  FileSignature,
  Scale,
  Settings,
  Printer,
  Lock,
  Menu,
  X,
  MonitorSmartphone,
  Warehouse,
  Cctv,
} from 'lucide-react'
import { Logo } from './Logo'
import { useAppStore, normalizeAppView } from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import type { AppView } from '../types'
import { useNavigate } from 'react-router-dom'
import { useStaffLockStore } from '../store/useStaffLockStore'

const NAV: Array<{
  id: AppView
  label: string
  icon: typeof LayoutDashboard
  minTier?: 'LITE' | 'TEAM' | 'BUSINESS' | 'ENTERPRISE'
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'planner', label: 'AI Planner', icon: Sparkles },
  { id: 'pos', label: 'Event POS / Kasa', icon: MonitorSmartphone, minTier: 'BUSINESS' },
  { id: 'cctv', label: 'AI Kamerový dohled', icon: Cctv, minTier: 'BUSINESS' },
  { id: 'inventory', label: 'Sklad & Inventura', icon: Warehouse, minTier: 'BUSINESS' },
  { id: 'scanner', label: 'AI Vision Scan', icon: Camera, minTier: 'BUSINESS' },
  { id: 'print', label: 'Tisk menu', icon: Printer, minTier: 'ENTERPRISE' },
  { id: 'staff', label: 'Personál', icon: Users, minTier: 'TEAM' },
  { id: 'portal', label: 'Klientský portál', icon: FileSignature, minTier: 'BUSINESS' },
  { id: 'legal', label: 'Právní audit', icon: Scale, minTier: 'BUSINESS' },
  { id: 'profile', label: 'Profil & Tarif', icon: Settings },
]

export function Sidebar() {
  const rawView = useAppStore((s) => s.view)
  const view = normalizeAppView(rawView)
  const setView = useAppStore((s) => s.setView)
  const subscription = useAppStore((s) => s.profile.subscription)
  const companyName = useAppStore((s) => s.profile.companyName)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const lockStaffTerminal = useStaffLockStore((s) => s.lockStaffTerminal)

  const nav = (
    <>
      <div style={{ padding: '0.5rem 0.75rem 1.5rem' }}>
        <Logo size="sm" />
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map((item) => {
          const locked = item.minTier ? !hasFeature(subscription, item.minTier) : false
          const active = view === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (locked) {
                  setView('profile')
                  setOpen(false)
                  return
                }
                setView(item.id)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: 'none',
                background: active ? 'var(--gold-subtle)' : 'transparent',
                color: active ? 'var(--gold)' : locked ? 'var(--text-dim)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.88rem',
                fontWeight: active ? 600 : 400,
                textAlign: 'left',
                transition: 'all 0.25s',
                boxShadow: active ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
              }}
            >
              <Icon size={17} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {locked && <Lock size={12} opacity={0.6} />}
            </button>
          )
        })}
        {hasFeature(subscription, 'BUSINESS') && (
          <button
            type="button"
            onClick={() => {
              lockStaffTerminal()
              setOpen(false)
              navigate('/pos-terminal')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0.65rem 0.85rem',
              borderRadius: 8,
              border: '1px solid rgba(212,175,55,0.35)',
              background: 'rgba(212,175,55,0.08)',
              color: '#D4AF37',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 700,
              textAlign: 'left',
              marginTop: 6,
            }}
          >
            <MonitorSmartphone size={17} />
            <span style={{ flex: 1 }}>Terminál personálu</span>
            <Lock size={12} opacity={0.8} />
          </button>
        )}
      </nav>

      <div
        style={{
          padding: '0.85rem',
          borderTop: '1px solid var(--border)',
          marginTop: '0.5rem',
        }}
      >
        <div className="badge badge-gold" style={{ marginBottom: 8 }}>
          {subscription}
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {companyName || 'Nastavte profil agentury'}
        </div>
      </div>
    </>
  )

  return (
    <>
      <button
        type="button"
        className="no-print mobile-menu-btn"
        onClick={() => setOpen(true)}
        aria-label="Menu"
        style={{
          display: 'none',
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 100,
          padding: 10,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          color: 'var(--gold)',
          cursor: 'pointer',
        }}
      >
        <Menu size={20} />
      </button>

      <aside
        className="no-print desktop-sidebar"
        style={{
          width: 240,
          flexShrink: 0,
          background: 'var(--bg-base)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem 0.75rem',
          height: '100vh',
          position: 'sticky',
          top: 0,
        }}
      >
        {nav}
      </aside>

      {open && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(7,10,14,0.7)',
          }}
          onClick={() => setOpen(false)}
        >
          <aside
            style={{
              width: 260,
              height: '100%',
              background: 'var(--bg-base)',
              borderRight: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.25rem 0.75rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-ghost"
              style={{ alignSelf: 'flex-end', marginBottom: 8, padding: 6 }}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <style>{`
        @media (max-width: 860px) {
          .desktop-sidebar { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  )
}
