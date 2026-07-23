import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import { HeroScreen } from './components/HeroScreen'
import { AppShell } from './components/AppShell'
import { StaffCheckinPage } from './components/StaffPanel'
import { ClientPortalRoute } from './components/ClientPortalRoute'

export default function App() {
  const showHero = useAppStore((s) => s.showHero)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/staff-checkin" element={<StaffCheckinPage />} />
        <Route path="/portal" element={<ClientPortalRoute />} />
        <Route
          path="/*"
          element={showHero ? <HeroScreen /> : <AppShell />}
        />
      </Routes>
    </BrowserRouter>
  )
}
