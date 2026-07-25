import { useEffect, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { Lock, LogOut } from 'lucide-react'
import { StaffTerminal } from './staff-terminal/StaffTerminal'
import { ManagerPinGate } from './ManagerPinGate'
import { CctvSecurityBanner } from './cctv/CctvSecurityBanner'
import { useAppStore } from '../store/useAppStore'
import { useStaffLockStore } from '../store/useStaffLockStore'
import { tapFeedback } from '../lib/touchFeedback'

function isKdsOrCustomerPath(pathname: string): boolean {
  return (
    pathname.startsWith('/pos/kds') ||
    pathname === '/kds-kitchen' ||
    pathname === '/kds-bar' ||
    pathname === '/pos/customer'
  )
}

/**
 * Isolated staff POS terminal at /pos-terminal.
 * Multi-zone StaffTerminal · Manager PIN required to leave (except KDS displays).
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
      !isKdsOrCustomerPath(nextLocation.pathname),
  )

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setExitTarget(blocker.location.pathname + blocker.location.search)
      setPendingPath(blocker.location.pathname + blocker.location.search)
      setPinOpen(true)
    }
  }, [blocker, setPendingPath])

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
    tapFeedback()
    setExitTarget('/')
    setPendingPath('/')
    setPinOpen(true)
  }

  const handlePinSuccess = () => {
    tapFeedback('success')
    setPinOpen(false)
    if (blocker.state === 'blocked') {
      blocker.proceed?.()
    }
    const target = exitTarget || '/'
    setView('dashboard')
    navigate(target.startsWith('/') ? target : '/', { replace: true })
  }

  const handlePinCancel = () => {
    tapFeedback()
    setPinOpen(false)
    if (blocker.state === 'blocked') {
      blocker.reset?.()
    }
    navigate('/pos-terminal', { replace: true })
  }

  return (
    <div className="pos-terminal-shell staff-terminal-page">
      <CctvSecurityBanner />
      <div className="gradient-mesh" style={{ opacity: 0.22 }} />
      <div className="st-page-header">
        <div>
          <div className="st-page-brand">EVENTFLOW · PERSONÁLNÍ TERMINÁL</div>
          <div className="st-page-sub">
            Multi-zónová kasa · prostory · KDS · dělení účtu · uzávěrka směny
          </div>
        </div>
        <button type="button" className="st-admin-exit" onClick={requestAdminExit}>
          <Lock size={16} color="#D4AF37" />
          <LogOut size={16} />
          Admin (PIN)
        </button>
      </div>

      <div className="st-page-body">
        <StaffTerminal />
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
