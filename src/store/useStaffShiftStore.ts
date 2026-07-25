import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  EventProject,
  StaffAdvance,
  StaffMember,
  StaffPayrollLock,
  StaffShiftRecord,
  ShiftBooking,
} from '../types'
import { uid } from '../lib/documentIds'
import { persistOrQueue } from '../lib/offlineQueue'
import {
  collectGlobalStaffRoster,
  monthKeyFromDate,
  resolveShiftInput,
  buildStaffShiftRecord,
} from '../lib/shiftParser'
import {
  fetchStaffAdvancesRemote,
  fetchStaffPayrollRemote,
  fetchStaffShiftsRemote,
  staffShiftToRow,
} from '../lib/staffShiftCloud'
import { toDateKey } from '../lib/czechHolidays'

type StaffShiftState = {
  shifts: StaffShiftRecord[]
  advances: StaffAdvance[]
  payrollLocks: StaffPayrollLock[]
  hydrated: boolean

  bootstrap: () => Promise<void>
  syncRosterHint: (projects: EventProject[]) => StaffMember[]

  addShiftFromText: (opts: {
    text: string
    roster: StaffMember[]
    date?: string | Date
    projectId?: string | null
    source?: StaffShiftRecord['source']
  }) => Promise<{ ok: boolean; shift?: StaffShiftRecord; error?: string }>

  addManualShift: (
    shift: StaffShiftRecord,
  ) => Promise<{ ok: boolean; shift?: StaffShiftRecord; error?: string }>

  removeShift: (id: string) => Promise<{ ok: boolean; error?: string }>

  addAdvance: (opts: {
    staff: StaffMember
    amount: number
    monthKey: string
    note?: string
  }) => Promise<{ ok: boolean; advance?: StaffAdvance; error?: string }>

  markPayrollPaid: (opts: {
    staff: StaffMember
    monthKey: string
    hours: number
    grossWage: number
    advances: number
  }) => Promise<{ ok: boolean; lock?: StaffPayrollLock; error?: string }>

  isPayrollPaid: (staffId: string, monthKey: string) => boolean
  advancesFor: (staffId: string, monthKey: string) => number
  shiftsForMonth: (monthKey: string) => StaffShiftRecord[]
  shiftsForDateKey: (dateKey: string) => StaffShiftRecord[]
}

async function persistShift(shift: StaffShiftRecord) {
  await persistOrQueue('staff_shift_upsert', staffShiftToRow(shift))
}

async function persistAdvance(advance: StaffAdvance) {
  await persistOrQueue('staff_advance_upsert', advance)
}

async function persistPayroll(lock: StaffPayrollLock) {
  await persistOrQueue('staff_payroll_upsert', lock)
}

export const useStaffShiftStore = create<StaffShiftState>()(
  persist(
    (set, get) => ({
      shifts: [],
      advances: [],
      payrollLocks: [],
      hydrated: false,

      bootstrap: async () => {
        try {
          const [remoteShifts, remoteAdvances, remotePayroll] = await Promise.all([
            fetchStaffShiftsRemote(),
            fetchStaffAdvancesRemote(),
            fetchStaffPayrollRemote(),
          ])
          set((state) => {
            const byId = new Map<string, StaffShiftRecord>()
            for (const s of state.shifts) byId.set(s.id, s)
            for (const s of remoteShifts) byId.set(s.id, s)
            const adv = new Map<string, StaffAdvance>()
            for (const a of state.advances) adv.set(a.id, a)
            for (const a of remoteAdvances) adv.set(a.id, a)
            const pay = new Map<string, StaffPayrollLock>()
            for (const p of state.payrollLocks) pay.set(`${p.staff_id}|${p.month_key}`, p)
            for (const p of remotePayroll) pay.set(`${p.staff_id}|${p.month_key}`, p)
            return {
              shifts: Array.from(byId.values()).sort((a, b) =>
                b.date.localeCompare(a.date),
              ),
              advances: Array.from(adv.values()),
              payrollLocks: Array.from(pay.values()),
              hydrated: true,
            }
          })
        } catch {
          set({ hydrated: true })
        }
      },

      syncRosterHint: (projects) =>
        collectGlobalStaffRoster((projects ?? []).map((p) => p.staff ?? [])),

      addShiftFromText: async ({ text, roster, date, projectId, source }) => {
        const resolved = resolveShiftInput(text, roster)
        if (!resolved.ok) return { ok: false, error: resolved.error }
        const shift = buildStaffShiftRecord({
          resolved: resolved.data,
          date,
          projectId,
          source: source || 'pos',
        })
        set({ shifts: [shift, ...get().shifts].slice(0, 3000) })
        await persistShift(shift)
        return { ok: true, shift }
      },

      addManualShift: async (shift) => {
        set({ shifts: [shift, ...get().shifts.filter((s) => s.id !== shift.id)].slice(0, 3000) })
        await persistShift(shift)
        return { ok: true, shift }
      },

      removeShift: async (id) => {
        set({ shifts: get().shifts.filter((s) => s.id !== id) })
        await persistOrQueue('staff_shift_delete', { id })
        return { ok: true }
      },

      addAdvance: async ({ staff, amount, monthKey, note }) => {
        const amt = Math.round(Number(amount) || 0)
        if (amt <= 0) return { ok: false, error: 'Zadejte kladnou částku zálohy.' }
        if (get().isPayrollPaid(staff.id, monthKey)) {
          return { ok: false, error: 'Mzda za tento měsíc je již vyplacena — zálohu nelze přidat.' }
        }
        const advance: StaffAdvance = {
          id: uid('adv'),
          user_id: 'local',
          staff_id: staff.id,
          staff_name: staff.name,
          amount: amt,
          month_key: monthKey,
          note: note || 'Záloha na mzdu',
          created_at: new Date().toISOString(),
        }
        set({ advances: [advance, ...get().advances] })
        await persistAdvance(advance)
        return { ok: true, advance }
      },

      markPayrollPaid: async ({ staff, monthKey, hours, grossWage, advances }) => {
        const payout = Math.max(0, Math.round(grossWage - advances))
        const lock: StaffPayrollLock = {
          id: `pay_${staff.id}_${monthKey}`,
          user_id: 'local',
          staff_id: staff.id,
          staff_name: staff.name,
          role: staff.role || 'Personál',
          month_key: monthKey,
          hours,
          gross_wage: Math.round(grossWage),
          advances: Math.round(advances),
          payout,
          paid: true,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set({
          payrollLocks: [
            lock,
            ...get().payrollLocks.filter(
              (p) => !(p.staff_id === staff.id && p.month_key === monthKey),
            ),
          ],
        })
        await persistPayroll(lock)
        return { ok: true, lock }
      },

      isPayrollPaid: (staffId, monthKey) =>
        get().payrollLocks.some(
          (p) => p.staff_id === staffId && p.month_key === monthKey && p.paid,
        ),

      advancesFor: (staffId, monthKey) =>
        get()
          .advances.filter((a) => a.staff_id === staffId && a.month_key === monthKey)
          .reduce((s, a) => s + (Number(a.amount) || 0), 0),

      shiftsForMonth: (monthKey) =>
        get().shifts.filter((s) => s.date.startsWith(monthKey)),

      shiftsForDateKey: (dateKey) =>
        get().shifts.filter((s) => s.date === dateKey),
    }),
    {
      name: 'eventflow-staff-shifts-v1',
      partialize: (state) => ({
        shifts: state.shifts,
        advances: state.advances,
        payrollLocks: state.payrollLocks,
      }),
    },
  ),
)

/** Map operational shifts → calendar ShiftBooking shape. */
export function staffShiftsToCalendarBookings(
  shifts: StaffShiftRecord[],
): Array<ShiftBooking & { projectName: string }> {
  return (shifts ?? []).map((s) => ({
    id: s.id,
    projectId: s.project_id || 'ops',
    staffId: s.staff_id,
    staffName: s.staff_name,
    role: s.role,
    date: s.date,
    shiftStart: s.shift_start,
    shiftEnd: s.shift_end,
    hourlyWage: s.hourly_wage,
    hours: s.hours,
    laborCost: s.labor_cost,
    attendance: 'confirmed' as const,
    tasks: [],
    source: s.source === 'ai' ? 'ai' : s.source === 'manual' ? 'manual' : 'pos',
    projectName:
      s.source === 'pos'
        ? 'POS směna'
        : s.source === 'manual'
          ? 'Ruční směna'
          : 'Plánovaná směna',
  }))
}

export function mergeShiftsForDate(
  projectShifts: Array<ShiftBooking & { projectName: string }>,
  opsShifts: StaffShiftRecord[],
  dateKey: string,
): Array<ShiftBooking & { projectName: string }> {
  const ops = staffShiftsToCalendarBookings(
    opsShifts.filter((s) => s.date === dateKey),
  )
  const seen = new Set(ops.map((s) => s.id))
  const merged = [...ops]
  for (const p of projectShifts) {
    if (!seen.has(p.id)) merged.push(p)
  }
  return merged.sort((a, b) => a.shiftStart.localeCompare(b.shiftStart))
}

export { monthKeyFromDate, toDateKey }
