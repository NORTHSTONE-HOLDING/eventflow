import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { HeroScreen } from './components/HeroScreen'
import { AppShell } from './components/AppShell'
import { StaffCheckinPage } from './components/StaffPanel'
import { ClientPortalRoute } from './components/ClientPortalRoute'
import { CustomerDisplayPage } from './components/CustomerDisplay'
import { KitchenDisplayPage } from './components/KitchenDisplay'
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
            path="/pos/customer"
            element={
              <ErrorBoundary fallbackTitle="Chyba zákaznického displaye">
                <CustomerDisplayPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/pos/kds"
            element={
              <ErrorBoundary fallbackTitle="Chyba KDS">
                <KitchenDisplayPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/pos/kds/kitchen"
            element={
              <ErrorBoundary fallbackTitle="Chyba KDS Kuchyň">
                <KitchenDisplayPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/pos/kds/bar"
            element={
              <ErrorBoundary fallbackTitle="Chyba KDS Bar">
                <KitchenDisplayPage />
              </ErrorBoundary>
            }
          />
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
