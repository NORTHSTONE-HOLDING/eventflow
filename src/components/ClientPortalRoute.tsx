import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { ClientPortal } from './ClientPortal'

/** Standalone client portal entry via /portal?event=... */
export function ClientPortalRoute() {
  const [params] = useSearchParams()
  const eventId = params.get('event')
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const setView = useAppStore((s) => s.setView)
  const dismissHero = useAppStore((s) => s.dismissHero)

  useEffect(() => {
    dismissHero()
    setView('portal')
    if (eventId) setActiveProject(eventId)
  }, [eventId, setActiveProject, setView, dismissHero])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <ClientPortal />
      </div>
    </div>
  )
}
