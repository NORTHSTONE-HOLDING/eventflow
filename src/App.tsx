import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { useStaffLockStore } from './store/useStaffLockStore'
import { HeroScreen } from './components/HeroScreen'
import { AppShell } from './components/AppShell'
import { StaffCheckinPage } from './components/StaffPanel'
import { ClientPortalRoute } from './components/ClientPortalRoute'
import { CustomerDisplayPage } from './components/CustomerDisplay'
import { KitchenDisplayPage } from './components/KitchenDisplay'
import { PosTerminalPage } from './components/PosTerminalPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function RootLayout() {
  return <Outlet />
}

function MainAppRoute() {
  const showHero = useAppStore((s) => s.showHero)
  const staffTerminalLocked = useStaffLockStore((s) => s.staffTerminalLocked)
  // Staff RBAC: never show hero while terminal lock is active — force PIN gate via AppShell
  if (showHero && !staffTerminalLocked) return <HeroScreen />
  return (
    <ErrorBoundary fallbackTitle="Chyba v hlavním rozhraní">
      <AppShell />
    </ErrorBoundary>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        path: 'staff-checkin',
        element: <StaffCheckinPage />,
      },
      {
        path: 'portal',
        element: <ClientPortalRoute />,
      },
      {
        path: 'pos-terminal',
        element: (
          <ErrorBoundary fallbackTitle="Chyba personálního terminálu">
            <PosTerminalPage />
          </ErrorBoundary>
        ),
      },
      {
        path: 'pos/customer',
        element: (
          <ErrorBoundary fallbackTitle="Chyba zákaznického displaye">
            <CustomerDisplayPage />
          </ErrorBoundary>
        ),
      },
      {
        path: 'pos/kds',
        element: (
          <ErrorBoundary fallbackTitle="Chyba KDS">
            <KitchenDisplayPage />
          </ErrorBoundary>
        ),
      },
      {
        path: 'pos/kds/kitchen',
        element: (
          <ErrorBoundary fallbackTitle="Chyba KDS Kuchyň">
            <KitchenDisplayPage />
          </ErrorBoundary>
        ),
      },
      {
        path: 'pos/kds/bar',
        element: (
          <ErrorBoundary fallbackTitle="Chyba KDS Bar">
            <KitchenDisplayPage />
          </ErrorBoundary>
        ),
      },
      {
        path: '*',
        element: <MainAppRoute />,
      },
      {
        index: true,
        element: <MainAppRoute />,
      },
    ],
  },
])

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="EventFlow se nepodařilo načíst">
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
