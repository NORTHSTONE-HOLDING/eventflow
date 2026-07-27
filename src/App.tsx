import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { useStaffLockStore } from './store/useStaffLockStore'
import { HeroScreen } from './components/HeroScreen'
import { AppShell } from './components/AppShell'
import { SaaSOnboarding } from './components/onboarding/SaaSOnboarding'
import { StaffCheckinPage } from './components/StaffPanel'
import { ClientPortalRoute } from './components/ClientPortalRoute'
import { CustomerDisplayPage } from './components/CustomerDisplay'
import { CustomerOrderPage } from './components/CustomerOrderPage'
import { KitchenDisplayPage } from './components/KitchenDisplay'
import { PosTerminalPage } from './components/PosTerminalPage'
import { CctvWallPage } from './components/CctvWallPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function RootLayout() {
  return <Outlet />
}

/** Fresh / incomplete SaaS profile must complete onboarding before ERP. */
export function profileNeedsOnboarding(profile: {
  onboardingCompleted?: boolean
  registeredAt?: string | null
  subscriptionPaid?: boolean
} | null | undefined): boolean {
  if (!profile) return true
  return !(
    Boolean(profile.onboardingCompleted) &&
    Boolean(profile.registeredAt) &&
    Boolean(profile.subscriptionPaid)
  )
}

/**
 * Main ERP shell — web SaaS first. No native desktop / Tauri wait on the render path.
 */
function MainAppRoute() {
  const location = useLocation()
  const showHero = useAppStore((s) => s.showHero)
  const profile = useAppStore((s) => s.profile)
  const staffTerminalLocked = useStaffLockStore((s) => s.staffTerminalLocked)

  if (location.pathname === '/cctv-wall') {
    return (
      <ErrorBoundary fallbackTitle="Chyba CCTV TV režimu">
        <CctvWallPage />
      </ErrorBoundary>
    )
  }

  // SaaS onboarding gate — first launch / fresh profile (instant, no hydrate spinner)
  if (profileNeedsOnboarding(profile) && !staffTerminalLocked) {
    return (
      <ErrorBoundary fallbackTitle="Chyba SaaS onboarding">
        <SaaSOnboarding />
      </ErrorBoundary>
    )
  }

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
        path: 'customer-order/:tableId',
        element: (
          <ErrorBoundary fallbackTitle="Chyba QR objednávky">
            <CustomerOrderPage />
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
        path: 'kds-kitchen',
        element: (
          <ErrorBoundary fallbackTitle="Chyba KDS Kuchyň">
            <KitchenDisplayPage />
          </ErrorBoundary>
        ),
      },
      {
        path: 'kds-bar',
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
