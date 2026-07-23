import { useState } from 'react'
import { Lock, MessageCircle, UserCheck, Clock } from 'lucide-react'
import { useAppStore, selectActiveProject } from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import { buildStaffWhatsAppMessage, openWhatsApp } from '../lib/whatsapp'
import { formatCurrency } from '../lib/documentIds'

export function StaffPanel() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const project = useAppStore(selectActiveProject)
  const updateStaff = useAppStore((s) => s.updateStaff)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)

  const unlocked = hasFeature(subscription, 'TEAM')

  if (!unlocked) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">Staff Management</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 300 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Personál & WhatsApp koordinátor vyžaduje tarif TEAM+</div>
          <button className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat na TEAM
          </button>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
        Vytvořte nejdřív akci v AI Planneru — personál se vygeneruje automaticky.
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-gold" onClick={() => setView('planner')}>
            AI Planner
          </button>
        </div>
      </div>
    )
  }

  const sendWhatsApp = (staffId: string) => {
    const roster = project.staff ?? []
    const member = roster.find((s) => s.id === staffId)
    if (!member) return
    const msg = buildStaffWhatsAppMessage({
      staffName: member.name,
      eventName: project.name,
      shiftStart: member.shiftStart,
      tasks: member.tasks ?? [],
      checkinUrl: `${window.location.origin}/staff-checkin?staff=${encodeURIComponent(member.id)}&event=${encodeURIComponent(project.id)}`,
    })
    openWhatsApp(member.phone, msg)
    setToast(`WhatsApp zpráva připravena pro ${member.name}`)
  }

  const setAttendance = (id: string, attendance: 'confirmed' | 'pending' | 'absent') => {
    updateStaff(
      project.id,
      (project.staff ?? []).map((s) => (s.id === id ? { ...s, attendance } : s))
    )
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="section-title gold-text">👥 Staff Management</h1>
      <p className="section-sub">
        Docházka, hodinové sazby, role a denní úkoly · {project.name}
      </p>

      <div
        className="panel"
        style={{
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'linear-gradient(135deg, rgba(37,211,102,0.1), transparent)',
          borderColor: 'rgba(37,211,102,0.3)',
        }}
      >
        <MessageCircle size={22} color="#25d366" />
        <div>
          <div style={{ fontWeight: 600 }}>📱 WhatsApp Koordinátor personálu</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Instantně odešlete směnu, úkoly a check-in odkaz každému členovi týmu.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {(project.staff ?? []).map((member) => (
          <div key={member.id} className="panel glass-glow">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 16,
                alignItems: 'start',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>
                    {member.name}
                  </span>
                  <span className="badge badge-gold">{member.role}</span>
                  <AttendanceBadge status={member.attendance} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    marginTop: 8,
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {member.shiftStart} – {member.shiftEnd}
                  </span>
                  <span>{formatCurrency(member.hourlyWage)} / h</span>
                  <span>{member.phone}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div className="label">Úkoly</div>
                  <ul style={{ paddingLeft: 18, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {(member.tasks ?? []).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="button" className="btn btn-wa" onClick={() => sendWhatsApp(member.id)}>
                  <MessageCircle size={15} /> WhatsApp
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => setAttendance(member.id, 'confirmed')}
                    title="Potvrdit"
                  >
                    <UserCheck size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => setAttendance(member.id, 'pending')}
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => setAttendance(member.id, 'absent')}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {(project.staff ?? []).length === 0 && (
          <div className="panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            Žádný personál — vygenerujte akci v AI Planneru.
          </div>
        )}
      </div>
    </div>
  )
}

function AttendanceBadge({ status }: { status: string }) {
  if (status === 'confirmed') return <span className="badge badge-success">Potvrzeno</span>
  if (status === 'absent') return <span className="badge badge-danger">Nepřítomen</span>
  return <span className="badge badge-warning">Čeká</span>
}

export function StaffCheckinPage() {
  const [done, setDone] = useState(false)
  const params = new URLSearchParams(window.location.search)
  const staffId = params.get('staff')
  const eventId = params.get('event')
  const projects = useAppStore((s) => s.projects)
  const updateStaff = useAppStore((s) => s.updateStaff)

  const project = projects.find((p) => p.id === eventId) ?? projects[0]
  const member = project?.staff.find((s) => s.id === staffId) ?? project?.staff[0]

  const confirm = () => {
    if (project && member) {
      updateStaff(
        project.id,
        project.staff.map((s) =>
          s.id === member.id ? { ...s, attendance: 'confirmed' } : s
        )
      )
    }
    setDone(true)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
      }}
    >
      <div className="gradient-mesh" />
      <div className="panel" style={{ maxWidth: 420, width: '100%', position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <h1 className="gold-text" style={{ fontSize: '1.8rem', marginBottom: 8 }}>
          Staff Check-in
        </h1>
        {done ? (
          <div>
            <div className="badge badge-success" style={{ marginBottom: 12 }}>
              Příjezd potvrzen
            </div>
            <p style={{ color: 'var(--text-muted)' }}>
              Díky{member ? `, ${member.name.split(' ')[0]}` : ''}! Vedoucí směny byl notifikován.
            </p>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
              {project?.name ?? 'Akce'}
            </p>
            <p style={{ marginBottom: 20 }}>
              {member?.name ?? 'Člen týmu'} · směna {member?.shiftStart ?? '—'}
            </p>
            <button className="btn btn-gold" onClick={confirm} style={{ width: '100%' }}>
              Potvrdit příjezd
            </button>
          </>
        )}
      </div>
    </div>
  )
}
