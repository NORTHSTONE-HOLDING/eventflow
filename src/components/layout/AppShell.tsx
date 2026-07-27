import { useState } from 'react'
import { Sidebar } from './Sidebar'
import type { MainView } from './Sidebar'
import { Dashboard } from '../Dashboard'
import { AiPlanner } from '../planner/AiPlanner'
import { PrintMenu } from '../menu/PrintMenu'
import { AuditView } from '../AuditView'
import { RedAlertBanner } from '../common/RedAlertBanner'

export function AppShell() {
  const [view, setView] = useState<MainView>('dashboard')

  return (
    <div className="flex min-h-screen">
      <RedAlertBanner />
      <Sidebar view={view} onView={setView} />
      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        {view === 'dashboard' && <Dashboard />}
        {view === 'planner' && <AiPlanner />}
        {view === 'menu' && <PrintMenu />}
        {view === 'audit' && <AuditView />}
      </main>
    </div>
  )
}
