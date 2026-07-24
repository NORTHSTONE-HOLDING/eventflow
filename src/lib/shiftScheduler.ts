import type { BudgetLine, EventProject, ShiftBooking, StaffMember } from '../types'
import { uid } from './documentIds'
import { VAT_RATES } from './budgetEngine'
import { toDateKey } from './czechHolidays'

/** Parse HH:mm → minutes from midnight. */
export function parseTimeMinutes(value: string | undefined | null): number {
  const m = String(value || '00:00').match(/^(\d{1,2}):(\d{2})/)
  if (!m) return 0
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return h * 60 + min
}

/** Hours between shiftStart and shiftEnd (supports overnight). */
export function calcShiftHours(shiftStart: string, shiftEnd: string): number {
  let start = parseTimeMinutes(shiftStart)
  let end = parseTimeMinutes(shiftEnd)
  if (end <= start) end += 24 * 60
  const hours = (end - start) / 60
  return Math.round(hours * 100) / 100
}

export function calcShiftLaborCost(
  shiftStart: string,
  shiftEnd: string,
  hourlyWage: number
): number {
  const hours = calcShiftHours(shiftStart, shiftEnd)
  return Math.round(hours * (Number(hourlyWage) || 0))
}

/** Book staff shifts onto the event date for calendar + budget. */
export function bookShiftsFromStaff(
  project: Pick<EventProject, 'id' | 'date' | 'staff'>,
  source: ShiftBooking['source'] = 'ai'
): ShiftBooking[] {
  const dateKey = toDateKey(project.date)
  if (!dateKey) return []
  const staff = Array.isArray(project.staff) ? project.staff : []
  return staff.map((member) => {
    const hours = calcShiftHours(member.shiftStart, member.shiftEnd)
    const laborCost = calcShiftLaborCost(
      member.shiftStart,
      member.shiftEnd,
      member.hourlyWage
    )
    return {
      id: uid('shift'),
      projectId: project.id,
      staffId: member.id,
      staffName: member.name,
      role: member.role,
      date: dateKey,
      shiftStart: member.shiftStart || '08:00',
      shiftEnd: member.shiftEnd || '23:00',
      hourlyWage: Number(member.hourlyWage) || 0,
      hours,
      laborCost,
      attendance: member.attendance || 'pending',
      tasks: Array.isArray(member.tasks) ? member.tasks : [],
      source,
    }
  })
}

export function sumShiftLaborCost(bookings: ShiftBooking[] | null | undefined): number {
  return Math.round(
    (bookings ?? []).reduce((s, b) => s + (Number(b.laborCost) || 0), 0)
  )
}

export function sumShiftHours(bookings: ShiftBooking[] | null | undefined): number {
  return Math.round(
    (bookings ?? []).reduce((s, b) => s + (Number(b.hours) || 0), 0) * 100
  ) / 100
}

/**
 * Replace the Personál budget line with actual scheduled labor and
 * recompute totalCost / netProfit / margin for accurate analytics.
 */
export function applyLaborToProjectFinancials(
  project: EventProject
): EventProject {
  const bookings =
    Array.isArray(project.shiftBookings) && project.shiftBookings.length > 0
      ? project.shiftBookings
      : bookShiftsFromStaff(project, 'ai')

  const staffWages = sumShiftLaborCost(bookings)
  const staffCount = bookings.length
  const totalHours = sumShiftHours(bookings)

  const existingLines = Array.isArray(project.budgetLines)
    ? [...project.budgetLines]
    : []

  const nonStaffCosts = existingLines.filter(
    (l) => l.isCost && l.category !== 'Personál'
  )
  const revenueLines = existingLines.filter((l) => !l.isCost)

  const staffLine: BudgetLine = {
    id:
      existingLines.find((l) => l.category === 'Personál')?.id || uid('bl'),
    category: 'Personál',
    description:
      staffCount > 0
        ? `${staffCount}× směna · ${totalHours} h · plánovaný náklad ${staffWages.toLocaleString('cs-CZ')} Kč`
        : 'Personál — zatím bez naplánovaných směn',
    amount: staffWages,
    vatRate: VAT_RATES.standard,
    isCost: true,
  }

  const budgetLines = [
    ...nonStaffCosts.filter((l) => l.category !== 'Personál'),
    staffLine,
    ...revenueLines,
  ]

  // Ensure Personál line exists even when old projects had no budget lines
  if (!nonStaffCosts.length && !revenueLines.length) {
    // keep only staff line + synthetic revenue
    budgetLines.length = 0
    budgetLines.push(staffLine, {
      id: uid('bl'),
      category: 'Výnos',
      description: 'Celková cena zakázky',
      amount: Number(project.totalRevenue) || Number(project.budget) || 0,
      vatRate: VAT_RATES.standard,
      isCost: false,
    })
  }

  const totalCost = budgetLines
    .filter((l) => l.isCost)
    .reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const totalRevenue =
    Number(project.totalRevenue) ||
    Number(project.budget) ||
    budgetLines.filter((l) => !l.isCost).reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const netProfit = totalRevenue - totalCost
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  return {
    ...project,
    shiftBookings: bookings,
    budgetLines,
    totalCost: Math.round(totalCost),
    totalRevenue: Math.round(totalRevenue),
    netProfit: Math.round(netProfit),
    margin: Math.round(margin * 10) / 10,
  }
}

/** Ensure bookings exist and financials reflect actual labor. */
export function syncProjectShiftsAndBudget(project: EventProject): EventProject {
  const dateKey = toDateKey(project.date)
  let bookings = Array.isArray(project.shiftBookings)
    ? project.shiftBookings
    : []

  // Rebuild from staff when missing or date drifted
  const needsRebuild =
    !bookings.length ||
    (dateKey && bookings.some((b) => b.date !== dateKey)) ||
    (project.staff?.length || 0) !== bookings.length

  if (needsRebuild && (project.staff?.length || 0) > 0) {
    bookings = bookShiftsFromStaff(project, bookings.length ? 'manual' : 'ai')
  }

  return applyLaborToProjectFinancials({
    ...project,
    shiftBookings: bookings,
  })
}

export function laborCostForDate(
  projects: EventProject[],
  dateKey: string
): number {
  return (projects ?? []).reduce((sum, p) => {
    const day = (p.shiftBookings ?? []).filter((b) => b.date === dateKey)
    return sum + sumShiftLaborCost(day)
  }, 0)
}

export function shiftsForDate(
  projects: EventProject[],
  dateKey: string
): Array<ShiftBooking & { projectName: string }> {
  const out: Array<ShiftBooking & { projectName: string }> = []
  for (const p of projects ?? []) {
    for (const b of p.shiftBookings ?? []) {
      if (b.date === dateKey) {
        out.push({ ...b, projectName: p.name })
      }
    }
  }
  return out.sort((a, b) => a.shiftStart.localeCompare(b.shiftStart))
}

/** Keep staff roster times in sync when rebuilding from bookings (optional). */
export function staffFromBookings(
  staff: StaffMember[],
  bookings: ShiftBooking[]
): StaffMember[] {
  return (staff ?? []).map((s) => {
    const b = bookings.find((x) => x.staffId === s.id)
    if (!b) return s
    return {
      ...s,
      shiftStart: b.shiftStart,
      shiftEnd: b.shiftEnd,
      hourlyWage: b.hourlyWage,
      role: b.role || s.role,
      attendance: b.attendance || s.attendance,
    }
  })
}
