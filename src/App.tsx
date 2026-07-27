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
 * Main ERP shell. Explicitly refuses to render when path is /cctv-wall
 * (belt-and-suspenders — primary wall route is a top-level sibling).
 */
function MainAppRoute() {
  const location = useLocation()
  const hydrated = useAppStore((s) => s.hydrated)
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

  if (!hydrated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#070a0e',
          color: '#D4AF37',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
        }}
      >
        EventFlow OS se načítá…
      </div>
    )
  }

  // SaaS onboarding gate — first launch / fresh profile (never during staff lock)
  if (profileNeedsOnboarding(profile) && !staffTerminalLocked) {
    return (
      <ErrorBoundary fallbackTitle="Chyba SaaS onboarding">
        <SaaSOnboarding />
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
