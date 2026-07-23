import { Sidebar } from './Sidebar'
import { LegalFooter } from './LegalFooter'
import { useAppStore } from '../store/useAppStore'
import { Dashboard } from './Dashboard'
import { AIPlanner } from './AIPlanner'
import { AIVisionScanner, PrintLayoutEngine } from './AIVisionScanner'
import { StaffPanel } from './StaffPanel'
import { ClientPortal } from './ClientPortal'
import { LegalAudit } from './LegalAudit'
import { ProfileSettings } from './ProfileSettings'
import { AnimatePresence, motion } from 'framer-motion'

export function AppShell() {
  const view = useAppStore((s) => s.view)
  const toast = useAppStore((s) => s.toast)

  const content = (() => {
    switch (view) {
      case 'dashboard':
        return <Dashboard />
      case 'planner':
        return <AIPlanner />
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
      default:
        return <Dashboard />
    }
  })()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
          <div style={{ position: 'relative', zIndex: 1 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                {content}
              </motion.div>
            </AnimatePresence>
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
