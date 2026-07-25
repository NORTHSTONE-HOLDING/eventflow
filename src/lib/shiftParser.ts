/**
 * POS Express Shift Input — Czech natural-language shift parsing.
 * Examples: "Martina 07:00 - 19:00", "Petr 8:00–16:30", "Jana Nováková 12:00-20:00"
 */

import type { StaffMember, StaffShiftRecord } from '../types'
import { uid } from './documentIds'
import { calcShiftHours, calcShiftLaborCost } from './shiftScheduler'
import { toDateKey } from './czechHolidays'
import { normalizeName } from './inventoryModels'

export interface ParsedShiftInput {
  rawName: string
  shiftStart: string
  shiftEnd: string
  hours: number
}

export interface ResolvedShiftInput extends ParsedShiftInput {
  staff: StaffMember
  laborCost: number
  hourlyWage: number
}

const SHIFT_RE =
  /^(.+?)\s+(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*$/u

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function normalizeClock(h: number, m: number): string | null {
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${pad2(h)}:${pad2(m)}`
}

/** Parse free-text shift line → name + times. */
export function parseShiftInput(raw: string): ParsedShiftInput | null {
  const text = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  const m = text.match(SHIFT_RE)
  if (!m) return null
  const rawName = m[1].trim()
  const start = normalizeClock(Number(m[2]), Number(m[3]))
  const end = normalizeClock(Number(m[4]), Number(m[5]))
  if (!rawName || !start || !end) return null
  const hours = calcShiftHours(start, end)
  if (hours <= 0) return null
  return { rawName, shiftStart: start, shiftEnd: end, hours }
}

/** Fuzzy match employee by first/last/full name. */
export function matchStaffByName(
  roster: StaffMember[],
  rawName: string,
): StaffMember | null {
  const key = normalizeName(rawName)
  if (!key) return null
  const list = Array.isArray(roster) ? roster : []

  const exact = list.find((s) => normalizeName(s.name) === key)
  if (exact) return exact

  const firstExact = list.find((s) => normalizeName(s.name.split(/\s+/)[0] || '') === key)
  if (firstExact) return firstExact

  const includes = list.find((s) => {
    const n = normalizeName(s.name)
    return n.includes(key) || key.includes(n)
  })
  if (includes) return includes

  return null
}

export function resolveShiftInput(
  raw: string,
  roster: StaffMember[],
): { ok: true; data: ResolvedShiftInput } | { ok: false; error: string } {
  const parsed = parseShiftInput(raw)
  if (!parsed) {
    return {
      ok: false,
      error: 'Neplatný formát. Zadejte např. „Martina 07:00 - 19:00“.',
    }
  }
  const staff = matchStaffByName(roster, parsed.rawName)
  if (!staff) {
    return {
      ok: false,
      error: `Zaměstnanec „${parsed.rawName}“ nebyl nalezen v evidenci personálu.`,
    }
  }
  const hourlyWage = Number(staff.hourlyWage) || 0
  const laborCost = calcShiftLaborCost(parsed.shiftStart, parsed.shiftEnd, hourlyWage)
  return {
    ok: true,
    data: {
      ...parsed,
      staff,
      hourlyWage,
      laborCost,
    },
  }
}

export function buildStaffShiftRecord(opts: {
  resolved: ResolvedShiftInput
  date?: string | Date
  source?: StaffShiftRecord['source']
  projectId?: string | null
  note?: string
  userId?: string
}): StaffShiftRecord {
  const now = new Date().toISOString()
  const date = toDateKey(opts.date || new Date())
  return {
    id: uid('sshift'),
    user_id: opts.userId || 'local',
    staff_id: opts.resolved.staff.id,
    staff_name: opts.resolved.staff.name,
    role: opts.resolved.staff.role || 'Personál',
    date,
    shift_start: opts.resolved.shiftStart,
    shift_end: opts.resolved.shiftEnd,
    hours: opts.resolved.hours,
    hourly_wage: opts.resolved.hourlyWage,
    labor_cost: opts.resolved.laborCost,
    source: opts.source || 'pos',
    project_id: opts.projectId ?? null,
    note: opts.note || '',
    created_at: now,
    updated_at: now,
  }
}

/** Aggregate unique staff across all project rosters. */
export function collectGlobalStaffRoster(
  projectStaffLists: StaffMember[][],
): StaffMember[] {
  const byId = new Map<string, StaffMember>()
  const byName = new Map<string, StaffMember>()
  for (const list of projectStaffLists) {
    for (const s of list ?? []) {
      if (!s?.id || !s?.name) continue
      byId.set(s.id, s)
      byName.set(normalizeName(s.name), s)
    }
  }
  // Prefer id map; names already covered
  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'cs'),
  )
}

export function monthKeyFromDate(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return `${y}-${pad2(m)}`
}

export function czechMonthLabel(monthKey: string): string {
  const [ys, ms] = monthKey.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!y || !m) return monthKey
  const names = [
    'Leden',
    'Únor',
    'Březen',
    'Duben',
    'Květen',
    'Červen',
    'Červenec',
    'Srpen',
    'Září',
    'Říjen',
    'Listopad',
    'Prosinec',
  ]
  return `${names[m - 1] || ms} ${y}`
}
