import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isValid,
  parseISO,
  isToday,
} from 'date-fns'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import { Modal } from './Modal'
import { getCzechHolidayName, isWeekend, toDateKey } from '../lib/czechHolidays'
import {
  formatCzechDateWithWeekday,
  formatCzechMonthNameYear,
} from '../lib/czechDate'
import {
  shiftsForDate,
  sumShiftLaborCost,
  sumShiftHours,
} from '../lib/shiftScheduler'
import { formatCurrency } from '../lib/documentIds'
import type { EventProject } from '../types'
import { migrateProject } from '../store/useAppStore'
import {
  mergeShiftsForDate,
  useStaffShiftStore,
} from '../store/useStaffShiftStore'

function safeParseDate(value: string | undefined | null): Date | null {
  if (!value) return null
  try {
    const d = value.includes('T') ? parseISO(value) : new Date(value)
    return isValid(d) ? d : null
  } catch {
    return null
  }
}

interface Props {
  projects: EventProject[]
  onOpenPlanner: () => void
  onOpenProject: (projectId: string) => void
}

export function EventCalendarScheduler({
  projects,
  onOpenPlanner,
  onOpenProject,
}: Props) {
  const [month, setMonth] = useState(() => new Date(2026, 6, 1))
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const opsShifts = useStaffShiftStore((s) => s.shifts)
  const bootstrapShifts = useStaffShiftStore((s) => s.bootstrap)

  useEffect(() => {
    void bootstrapShifts()
  }, [bootstrapShifts])

  const safeProjects = useMemo(
    () =>
      (Array.isArray(projects) ? projects : [])
        .map((p) => migrateProject(p))
        .filter((p): p is EventProject => Boolean(p)),
    [projects]
  )

  const days = useMemo(() => {
    try {
      const start = startOfMonth(month)
      const end = endOfMonth(month)
      if (!isValid(start) || !isValid(end)) return []
      return eachDayOfInterval({ start, end })
    } catch {
      return []
    }
  }, [month])

  const leadingBlanks = days.length ? (days[0].getDay() + 6) % 7 : 0

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventProject[]>()
    for (const p of safeProjects) {
      const d = safeParseDate(p.date)
      if (!d) continue
      const key = toDateKey(d)
      const list = map.get(key) ?? []
      list.push(p)
      map.set(key, list)
    }
    return map
  }, [safeProjects])

  const selectedKey = selectedDay ? toDateKey(selectedDay) : ''
  const selectedEvents = selectedKey ? eventsByDay.get(selectedKey) ?? [] : []
  const selectedShifts = selectedKey
    ? mergeShiftsForDate(
        shiftsForDate(safeProjects, selectedKey),
        opsShifts,
        selectedKey,
      )
    : []
  const selectedLabor = sumShiftLaborCost(selectedShifts)
  const selectedHours = sumShiftHours(selectedShifts)
  const selectedHoliday = selectedDay ? getCzechHolidayName(selectedDay) : null

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of safeProjects) {
      for (const b of p.shiftBookings ?? []) {
        map.set(b.date, (map.get(b.date) || 0) + 1)
      }
    }
    for (const s of opsShifts) {
      map.set(s.date, (map.get(s.date) || 0) + 1)
    }
    return map
  }, [safeProjects, opsShifts])

  return (
    <>
      <div className="panel" style={{ touchAction: 'manipulation' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3
              style={{
                fontSize: '1.2rem',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              <CalendarDays size={18} color="#D4AF37" />
              Kalendář akcí & směn
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginTop: 4 }}>
              Víkendy · státní svátky · zlaté badge aktivních akcí
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: 8, minHeight: 44, minWidth: 44 }}
              onClick={() => setMonth((m) => subMonths(m, 1))}
              aria-label="Předchozí měsíc"
            >
              <ChevronLeft size={16} />
            </button>
            <span
              style={{
                fontSize: '0.9rem',
                color: '#D4AF37',
                padding: '6px 10px',
                fontWeight: 800,
                minWidth: 140,
                textAlign: 'center',
                textTransform: 'capitalize',
              }}
            >
              {isValid(month) ? formatCzechMonthNameYear(month) : '—'}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: 8, minHeight: 44, minWidth: 44 }}
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Další měsíc"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 4,
            fontSize: '0.72rem',
            color: '#94a3b8',
            marginBottom: 8,
            fontWeight: 800,
          }}
        >
          {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((d) => (
            <div key={d} style={{ textAlign: 'center', padding: '4px 0' }}>
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 5,
          }}
        >
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {days.map((day) => {
            const key = toDateKey(day)
            const dayEvents = eventsByDay.get(key) ?? []
            const hasEvent = dayEvents.length > 0
            const shiftCount = shiftsByDay.get(key) || 0
            const hasShifts = shiftCount > 0
            const holiday = getCzechHolidayName(day)
            const weekend = isWeekend(day)
            const today = isToday(day)
            const eventName = dayEvents[0]?.name

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(day)}
                style={{
                  minHeight: 72,
                  padding: '0.4rem 0.3rem',
                  borderRadius: 10,
                  border: today
                    ? '2px solid #D4AF37'
                    : hasEvent || hasShifts
                      ? '1px solid rgba(212,175,55,0.55)'
                      : '1px solid #1e293b',
                  background: hasEvent
                    ? 'rgba(212,175,55,0.14)'
                    : hasShifts
                      ? 'rgba(16,185,129,0.12)'
                      : weekend
                        ? 'rgba(30, 41, 59, 0.55)'
                        : holiday
                          ? 'rgba(212,175,55,0.06)'
                          : '#0f172a',
                  boxShadow: hasEvent
                    ? '0 0 14px rgba(212,175,55,0.22)'
                    : weekend
                      ? 'inset 0 0 0 1px rgba(212,175,55,0.06)'
                      : 'none',
                  color: hasEvent || hasShifts ? '#D4AF37' : '#e2e8f0',
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      color: weekend || holiday ? '#D4AF37' : '#fff',
                    }}
                  >
                    {format(day, 'd')}
                  </span>
                  {holiday && (
                    <span
                      title={holiday}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: '#D4AF37',
                        boxShadow: '0 0 6px rgba(212,175,55,0.8)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                {holiday && (
                  <div
                    style={{
                      fontSize: '0.55rem',
                      lineHeight: 1.2,
                      color: '#cbd5e1',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={holiday}
                  >
                    {holiday}
                  </div>
                )}
                {hasEvent && (
                  <div
                    style={{
                      marginTop: 'auto',
                      fontSize: '0.58rem',
                      fontWeight: 900,
                      color: '#0b0f14',
                      background: '#D4AF37',
                      borderRadius: 6,
                      padding: '2px 4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 0 10px rgba(212,175,55,0.45)',
                    }}
                    title={eventName}
                  >
                    {eventName?.slice(0, 14) || 'Akce'}
                    {dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ''}
                  </div>
                )}
                {hasShifts && (
                  <div
                    style={{
                      marginTop: hasEvent ? 2 : 'auto',
                      fontSize: '0.55rem',
                      fontWeight: 800,
                      color: '#04140e',
                      background: '#10b981',
                      borderRadius: 6,
                      padding: '2px 4px',
                    }}
                    title={`${shiftCount} směn`}
                  >
                    {shiftCount} směn
                  </div>
                )}
              </button>
            )
          })}
          {!days.length && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                color: '#64748b',
                padding: 16,
              }}
            >
              Kalendář není k dispozici
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#94a3b8',
          }}
        >
          <span style={{ color: '#D4AF37' }}>● Aktivní akce</span>
          <span style={{ color: '#34d399' }}>● Směny personálu</span>
          <span>● Víkend</span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: 999,
                background: '#D4AF37',
                marginRight: 4,
              }}
            />
            Státní svátek
          </span>
        </div>
      </div>

      <Modal
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={
          selectedDay
            ? formatCzechDateWithWeekday(selectedDay)
            : 'Detail dne'
        }
        wide
      >
        {selectedHoliday && (
          <div
            style={{
              marginBottom: 14,
              padding: '0.65rem 0.85rem',
              borderRadius: 10,
              background: 'rgba(212,175,55,0.12)',
              border: '1px solid rgba(212,175,55,0.35)',
              color: '#D4AF37',
              fontWeight: 800,
              fontSize: '0.9rem',
            }}
          >
            Státní svátek: {selectedHoliday}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedEvents.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '1.5rem 1rem',
                background: '#0f172a',
                borderRadius: 14,
                border: '1px dashed #334155',
              }}
            >
              <p
                style={{
                  color: '#94a3b8',
                  fontWeight: 700,
                  marginBottom: 16,
                  fontSize: '1rem',
                }}
              >
                Žádné plánované akce na tento den.
              </p>
              <button
                type="button"
                className="btn btn-gold"
                style={{ minHeight: 48, fontWeight: 900 }}
                onClick={() => {
                  setSelectedDay(null)
                  onOpenPlanner()
                }}
              >
                <Sparkles size={16} /> ➕ Vytvořit novou akci
              </button>
            </div>
          )}

          {selectedEvents.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '1rem',
                  borderRadius: 14,
                  background: '#0f172a',
                  border: '1px solid rgba(212,175,55,0.35)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  <h4 style={{ color: '#D4AF37', fontSize: '1.15rem', fontWeight: 900, margin: 0 }}>
                    {event.name}
                  </h4>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 40 }}
                    onClick={() => {
                      setSelectedDay(null)
                      onOpenProject(event.id)
                    }}
                  >
                    Otevřít v AI Planneru
                  </button>
                </div>

                <div style={{ fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                  Název a detaily akce
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 8,
                    fontSize: '0.85rem',
                    color: '#cbd5e1',
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <span style={{ color: '#94a3b8' }}>Klient</span>
                    <div style={{ fontWeight: 700, color: '#fff' }}>
                      {event.clientName || '—'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <Wallet size={12} /> Rozpočet
                    </span>
                    <div style={{ fontWeight: 700, color: '#D4AF37' }}>
                      {formatCurrency(event.budget || event.totalRevenue || 0)}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <MapPin size={12} /> Lokalita
                    </span>
                    <div style={{ fontWeight: 700, color: '#fff' }}>
                      {event.location || '—'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Marže</span>
                    <div style={{ fontWeight: 700, color: '#fff' }}>
                      {(event.margin || 0).toFixed(1)} % · zisk{' '}
                      {formatCurrency(event.netProfit || 0)}
                    </div>
                  </div>
                </div>

                {(event.timeline ?? []).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                      Timeline dne
                    </div>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(event.timeline ?? [])
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .slice(0, 8)
                        .map((t) => (
                          <li
                            key={t.id}
                            style={{
                              fontSize: '0.82rem',
                              color: '#94a3b8',
                              display: 'flex',
                              gap: 8,
                            }}
                          >
                            <span style={{ color: '#D4AF37', fontWeight: 800, minWidth: 48 }}>
                              {t.time}
                            </span>
                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{t.title}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            ))}

            <div
              style={{
                padding: '1rem',
                borderRadius: 14,
                background: '#0f172a',
                border: '1px solid #334155',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontWeight: 900, color: '#fff', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Users size={16} color="#D4AF37" />
                  Plánované směny personálu
                </div>
                <div style={{ color: '#D4AF37', fontWeight: 900, fontSize: '0.95rem' }}>
                  {selectedHours} h · {formatCurrency(selectedLabor)}
                </div>
              </div>

              {selectedShifts.length === 0 ? (
                <p style={{ color: '#94a3b8', fontWeight: 600, margin: 0 }}>
                  Pro tento den zatím nejsou naplánované směny.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedShifts.map((shift) => (
                    <div
                      key={shift.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr',
                        gap: 8,
                        padding: '0.75rem',
                        borderRadius: 10,
                        background: '#1e293b',
                        border: '1px solid #334155',
                        alignItems: 'center',
                      }}
                      className="shift-row"
                    >
                      <div>
                        <div style={{ color: '#fff', fontWeight: 800 }}>{shift.staffName}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600 }}>
                          {shift.projectName}
                        </div>
                      </div>
                      <div>
                        <span className="badge badge-gold">{shift.role}</span>
                      </div>
                      <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>
                        <Clock size={12} style={{ marginRight: 4, display: 'inline' }} />
                        {shift.shiftStart} – {shift.shiftEnd}
                        <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                          {shift.hours} h
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', color: '#D4AF37', fontWeight: 900 }}>
                        {formatCurrency(shift.laborCost)}
                        <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>
                          {formatCurrency(shift.hourlyWage)}/h
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 900,
                  color: '#fff',
                }}
              >
                <span>Součet mzdových nákladů dne</span>
                <span style={{ color: '#D4AF37' }}>{formatCurrency(selectedLabor)}</span>
              </div>
              <p style={{ marginTop: 8, fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                Směny z POS / Personálu se synchronizují v reálném čase · jméno, role, hodiny a denní
                mzdový náklad.
              </p>
            </div>
        </div>

        <style>{`
          @media (max-width: 640px) {
            .shift-row {
              grid-template-columns: 1fr 1fr !important;
            }
          }
        `}</style>
      </Modal>
    </>
  )
}
