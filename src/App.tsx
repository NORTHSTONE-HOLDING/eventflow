import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { useStaffLockStore } from './store/useStaffLockStore'
import { HeroScreen } from './components/HeroScreen'
import { AppShell } from './components/AppShell'
import { StaffCheckinPage } from './components/StaffPanel'
import { ClientPortalRoute } from './components/ClientPortalRoute'
import { CustomerDisplayPage } from './components/CustomerDisplay'
import { KitchenDisplayPage } from './components/KitchenDisplay'
import { PosTerminalPage } from './components/PosTerminalPage'
import { CctvWallPage } from './components/CctvWallPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function RootLayout() {
  return <Outlet />
}

/**
 * Main ERP shell. Explicitly refuses to render when path is /cctv-wall
 * (belt-and-suspenders — primary wall route is a top-level sibling).
 */
function MainAppRoute() {
  const location = useLocation()
  const showHero = useAppStore((s) => s.showHero)
  const staffTerminalLocked = useStaffLockStore((s) => s.staffTerminalLocked)

  if (location.pathname === '/cctv-wall') {
    return (
      <ErrorBoundary fallbackTitle="Chyba CCTV TV režimu">
        <CctvWallPage />
      </ErrorBoundary>
    )
  }

  // Staff RBAC: never show hero while terminal lock is active — force PIN gate via AppShell
  if (showHero && !staffTerminalLocked) return <HeroScreen />
  return (
    <ErrorBoundary fallbackTitle="Chyba v hlavním rozhraní">
      <AppShell />
    </ErrorBoundary>
  )
}

const router = createBrowserRouter([
  // Top-level standalone TV wall — zero ERP chrome / sidebar / settings
  {
    path: '/cctv-wall',
    element: (
      <ErrorBoundary fallbackTitle="Chyba CCTV TV režimu">
        <CctvWallPage />
      </ErrorBoundary>
    ),
  },
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
      // Nested alias kept for older bookmarks; still renders clean wall (no shell)
      {
        path: 'cctv-wall',
        element: (
          <ErrorBoundary fallbackTitle="Chyba CCTV TV režimu">
            <CctvWallPage />
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
