import { Sidebar } from './Sidebar'
import { LegalFooter } from './LegalFooter'
import { useAppStore, normalizeAppView } from '../store/useAppStore'
import { Dashboard } from './Dashboard'
import { AIPlanner } from './AIPlanner'
import { AIVisionScanner } from './AIVisionScanner'
import { PrintLayoutEngine } from './PrintMenuEngine'
import { StaffPanel } from './StaffPanel'
import { ClientPortal } from './ClientPortal'
import { LegalAudit } from './LegalAudit'
import { ProfileSettings } from './ProfileSettings'
import { EventPOS } from './EventPOS'
import { HardwarePosCentrum } from './HardwarePosCentrum'
import { ShiftClosureHub } from './ShiftClosureHub'
import { InventoryHub } from './inventory/InventoryHub'
import { CloudSyncBadge } from './inventory/CloudSyncBadge'
import { CctvSurveillance } from './CctvSurveillance'
import { CctvSecurityBanner } from './cctv/CctvSecurityBanner'
import { ErrorBoundary } from './ErrorBoundary'
import { ManagerPinGate } from './ManagerPinGate'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppView } from '../types'
import { wireInventoryConnectivity } from '../store/useInventoryStore'
import { useStaffLockStore } from '../store/useStaffLockStore'

function renderView(view: AppView) {
  switch (view) {
    case 'dashboard':
      return <Dashboard />
    case 'planner':
      return <AIPlanner />
    case 'pos':
      return <EventPOS />
    case 'hardware':
      return <HardwarePosCentrum />
    case 'closure':
      return <ShiftClosureHub />
    case 'cctv':
      return <CctvSurveillance />
    case 'inventory':
      return <InventoryHub />
    case 'scanner':
      return <AIVisionScanner />
    case 'print':
      return <PrintLayoutEngine />
    case 'staff':
      return <StaffPanel />
    case 'portal':
      return <ClientPortal />
    case 'legal':
      return <LegalAudit />
    case 'profile':
      return <ProfileSettings />
    case 'hero':
    default:
      return <Dashboard />
  }
}

export function AppShell() {
  const rawView = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const toast = useAppStore((s) => s.toast)
  const profilePin = useAppStore((s) => s.profile.managerPin)
  const view = normalizeAppView(rawView)
  const navigate = useNavigate()
  const staffTerminalLocked = useStaffLockStore((s) => s.staffTerminalLocked)

  useEffect(() => {
    if (rawView !== view) {
      setView(view)
    }
  }, [rawView, view, setView])

  useEffect(() => {
    wireInventoryConnectivity()
  }, [])

  // RBAC: staff terminal lock blocks Admin Dashboard until Manager PIN
  if (staffTerminalLocked) {
    return (
      <div style={{ minHeight: '100vh', background: '#070a0e' }}>
        <ManagerPinGate
          open
          expectedPin={profilePin}
          onSuccess={() => {
            setView('dashboard')
          }}
          onCancel={() => navigate('/pos-terminal', { replace: true })}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-deep)',
      }}
    >
      <Sidebar />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <header
          className="no-print app-topbar"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 10,
            padding: '0.65rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(11,15,20,0.72)',
            backdropFilter: 'blur(10px)',
            position: 'sticky',
            top: 0,
            zIndex: 40,
          }}
        >
          <CloudSyncBadge />
        </header>
        <main
          className="app-main-pad"
          style={{
            flex: 1,
            padding: '1.75rem 2rem',
            position: 'relative',
            overflow: 'auto',
          }}
        >
          <div className="gradient-mesh" style={{ opacity: 0.35 }} />
          <div style={{ position: 'relative', zIndex: 1, minHeight: 320 }}>
            <ErrorBoundary fallbackTitle="Chyba při vykreslení obrazovky">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  {renderView(view)}
                </motion.div>
              </AnimatePresence>
            </ErrorBoundary>
          </div>
        </main>
        <LegalFooter />
      </div>

      <CctvSecurityBanner />

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
