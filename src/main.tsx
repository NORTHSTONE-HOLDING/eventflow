import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installDesktopNavigationGuards } from './lib/desktopGuards'

function Root() {
  useEffect(() => installDesktopNavigationGuards(), [])
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
