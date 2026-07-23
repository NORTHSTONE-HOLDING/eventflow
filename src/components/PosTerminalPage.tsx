import { useEffect, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { Lock, LogOut } from 'lucide-react'
import { EventPOS } from './EventPOS'
import { ManagerPinGate } from './ManagerPinGate'
import { useAppStore } from '../store/useAppStore'
import { useStaffLockStore } from '../store/useStaffLockStore'

/**
 * Isolated staff POS terminal at /pos-terminal.
 * No sidebar, no analytics, no admin navigation — Manager PIN required to leave.
 */
export function PosTerminalPage() {
  const navigate = useNavigate()
  const dismissHero = useAppStore((s) => s.dismissHero)
  const setView = useAppStore((s) => s.setView)
  const profilePin = useAppStore((s) => s.profile.managerPin)
  const lockStaffTerminal = useStaffLockStore((s) => s.lockStaffTerminal)
  const staffTerminalLocked = useStaffLockStore((s) => s.staffTerminalLocked)
  const setManagerPin = useStaffLockStore((s) => s.setManagerPin)
  const setPendingPath = useStaffLockStore((s) => s.setPendingPath)

  const [pinOpen, setPinOpen] = useState(false)
  const [exitTarget, setExitTarget] = useState('/')

  useEffect(() => {
    dismissHero()
    setView('pos')
    lockStaffTerminal()
    if (profilePin) setManagerPin(profilePin)
  }, [dismissHero, setView, lockStaffTerminal, profilePin, setManagerPin])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      staffTerminalLocked &&
      currentLocation.pathname === '/pos-terminal' &&
      nextLocation.pathname !== '/pos-terminal' &&
      !nextLocation.pathname.startsWith('/pos/kds') &&
      nextLocation.pathname !== '/pos/customer'
  )

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setExitTarget(blocker.location.pathname + blocker.location.search)
      setPendingPath(blocker.location.pathname + blocker.location.search)
      setPinOpen(true)
    }
  }, [blocker, setPendingPath])

  // Hard guard: address-bar / history jumps to admin shell
  useEffect(() => {
    const onPop = () => {
      if (!useStaffLockStore.getState().staffTerminalLocked) return
      if (window.location.pathname !== '/pos-terminal') {
        setExitTarget(window.location.pathname + window.location.search)
        setPinOpen(true)
        navigate('/pos-terminal', { replace: true })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [navigate])

  const requestAdminExit = () => {
    setExitTarget('/')
    setPendingPath('/')
    setPinOpen(true)
  }

  const handlePinSuccess = () => {
    setPinOpen(false)
    if (blocker.state === 'blocked') {
      blocker.proceed?.()
    }
    const target = exitTarget || '/'
    setView('dashboard')
    navigate(target.startsWith('/') ? target : '/', { replace: true })
  }

  const handlePinCancel = () => {
    setPinOpen(false)
    if (blocker.state === 'blocked') {
      blocker.reset?.()
    }
    navigate('/pos-terminal', { replace: true })
  }

  return (
    <div
      className="pos-terminal-shell"
      style={{
        minHeight: '100vh',
        background: '#070a0e',
        color: '#e8ecf1',
        touchAction: 'manipulation',
      }}
    >
      <div className="gradient-mesh" style={{ opacity: 0.28 }} />
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '0.75rem 1rem',
          background: 'rgba(15, 23, 42, 0.94)',
          borderBottom: '1px solid #334155',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div>
          <div
            style={{
              color: '#D4AF37',
              fontWeight: 900,
              fontSize: '1.05rem',
              letterSpacing: '0.04em',
            }}
          >
            EVENTFLOW · PERSONÁLNÍ TERMINÁL
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>
            Izolovaná kasa · RBAC staff · KDS notifikace aktivní
          </div>
        </div>
        <button
          type="button"
          onClick={requestAdminExit}
          style={{
            minHeight: 48,
            minWidth: 48,
            padding: '0.65rem 1rem',
            borderRadius: 12,
            border: '1px solid #475569',
            background: '#1e293b',
            color: '#e2e8f0',
            fontWeight: 800,
            touchAction: 'manipulation',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Lock size={16} color="#D4AF37" />
          <LogOut size={16} />
          Admin (PIN)
        </button>
      </div>

      <div style={{ position: 'relative', zIndex: 2, padding: '1rem', maxWidth: 1600, margin: '0 auto' }}>
        <EventPOS mode="staff" />
      </div>

      <ManagerPinGate
        open={pinOpen}
        expectedPin={profilePin}
        onSuccess={handlePinSuccess}
        onCancel={handlePinCancel}
      />
    </div>
  )
}
