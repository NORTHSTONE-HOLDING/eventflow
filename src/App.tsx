import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { AppShell } from './components/layout/AppShell'
import { PosTerminal } from './components/pos/PosTerminal'
import { KdsScreen } from './components/kds/KdsScreen'
import { CctvWall } from './components/cctv/CctvWall'
import { ErrorBoundary } from './components/common/ErrorBoundary'

function RequireOnboarding({ children }: { children: ReactNode }) {
  const done = useAuthStore((s) => s.step === 'done')
  if (!done) return <Navigate to="/" replace />
  return <>{children}</>
}

function Home() {
  const done = useAuthStore((s) => s.step === 'done')
  return done ? <AppShell /> : <OnboardingWizard />
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  {
    path: '/pos-terminal',
    element: (
      <RequireOnboarding>
        <ErrorBoundary title="Chyba POS terminálu">
          <PosTerminal />
        </ErrorBoundary>
      </RequireOnboarding>
    ),
  },
  {
    path: '/kds-kitchen',
    element: (
      <RequireOnboarding>
        <ErrorBoundary title="Chyba KDS Kuchyně">
          <KdsScreen station="kitchen" />
        </ErrorBoundary>
      </RequireOnboarding>
    ),
  },
  {
    path: '/kds-bar',
    element: (
      <RequireOnboarding>
        <ErrorBoundary title="Chyba KDS Bar">
          <KdsScreen station="bar" />
        </ErrorBoundary>
      </RequireOnboarding>
    ),
  },
  {
    path: '/cctv-wall',
    element: (
      <RequireOnboarding>
        <ErrorBoundary title="Chyba CCTV">
          <CctvWall />
        </ErrorBoundary>
      </RequireOnboarding>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return (
    <ErrorBoundary title="EventFlow se nepodařilo načíst">
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
