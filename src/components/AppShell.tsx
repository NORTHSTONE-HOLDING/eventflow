import { Sidebar } from './Sidebar'
import { LegalFooter } from './LegalFooter'
import { useAppStore, normalizeAppView } from '../store/useAppStore'
import { Dashboard } from './Dashboard'
import { AIPlanner } from './AIPlanner'
import { AIVisionScanner, PrintLayoutEngine } from './AIVisionScanner'
import { StaffPanel } from './StaffPanel'
import { ClientPortal } from './ClientPortal'
import { LegalAudit } from './LegalAudit'
import { ProfileSettings } from './ProfileSettings'
import { EventPOS } from './EventPOS'
import { ErrorBoundary } from './ErrorBoundary'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import type { AppView } from '../types'

function renderView(view: AppView) {
  switch (view) {
    case 'dashboard':
      return <Dashboard />
    case 'planner':
      return <AIPlanner />
    case 'pos':
      return <EventPOS />
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
  const view = normalizeAppView(rawView)

  // Guarantee a valid active view whenever the shell mounts
  useEffect(() => {
    if (rawView !== view) {
      setView(view)
    }
  }, [rawView, view, setView])

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
