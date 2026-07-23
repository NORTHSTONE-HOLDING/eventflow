import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { HeroScreen } from './components/HeroScreen'
import { AppShell } from './components/AppShell'
import { StaffCheckinPage } from './components/StaffPanel'
import { ClientPortalRoute } from './components/ClientPortalRoute'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  const showHero = useAppStore((s) => s.showHero)

  return (
    <ErrorBoundary fallbackTitle="EventFlow se nepodařilo načíst">
      <BrowserRouter>
        <Routes>
          <Route path="/staff-checkin" element={<StaffCheckinPage />} />
          <Route path="/portal" element={<ClientPortalRoute />} />
          <Route
            path="/*"
            element={
              showHero ? (
                <HeroScreen />
              ) : (
                <ErrorBoundary fallbackTitle="Chyba v hlavním rozhraní">
                  <AppShell />
                </ErrorBoundary>
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
