import type { StaffAdvance, StaffPayrollLock, StaffShiftRecord } from '../types'
import { getSupabase } from './supabase'

export function rowToStaffShift(row: Record<string, unknown>): StaffShiftRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id || 'local'),
    staff_id: String(row.staff_id || ''),
    staff_name: String(row.staff_name || ''),
    role: String(row.role || 'Personál'),
    date: String(row.date || '').slice(0, 10),
    shift_start: String(row.shift_start || '08:00'),
    shift_end: String(row.shift_end || '16:00'),
    hours: Number(row.hours) || 0,
    hourly_wage: Number(row.hourly_wage) || 0,
    labor_cost: Number(row.labor_cost) || 0,
    source: (String(row.source || 'pos') as StaffShiftRecord['source']) || 'pos',
    project_id: row.project_id != null ? String(row.project_id) : null,
    note: String(row.note || ''),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  }
}

export async function fetchStaffShiftsRemote(): Promise<StaffShiftRecord[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from('staff_shifts')
    .select('*')
    .order('date', { ascending: false })
    .limit(2000)
  if (error || !data) return []
  return data.map((r) => rowToStaffShift(r as Record<string, unknown>))
}

export async function fetchStaffAdvancesRemote(): Promise<StaffAdvance[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from('staff_advances')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error || !data) return []
  return data.map((r) => ({
    id: String(r.id),
    user_id: String(r.user_id || 'local'),
    staff_id: String(r.staff_id || ''),
    staff_name: String(r.staff_name || ''),
    amount: Number(r.amount) || 0,
    month_key: String(r.month_key || ''),
    note: String(r.note || ''),
    created_at: String(r.created_at || new Date().toISOString()),
  }))
}

export async function fetchStaffPayrollRemote(): Promise<StaffPayrollLock[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.from('staff_payroll').select('*').limit(2000)
  if (error || !data) return []
  return data.map((r) => ({
    id: String(r.id),
    user_id: String(r.user_id || 'local'),
    staff_id: String(r.staff_id || ''),
    staff_name: String(r.staff_name || ''),
    role: String(r.role || 'Personál'),
    month_key: String(r.month_key || ''),
    hours: Number(r.hours) || 0,
    gross_wage: Number(r.gross_wage) || 0,
    advances: Number(r.advances) || 0,
    payout: Number(r.payout) || 0,
    paid: Boolean(r.paid),
    paid_at: r.paid_at ? String(r.paid_at) : null,
    updated_at: String(r.updated_at || new Date().toISOString()),
  }))
}

export function staffShiftToRow(s: StaffShiftRecord) {
  return {
    id: s.id,
    user_id: s.user_id,
    staff_id: s.staff_id,
    staff_name: s.staff_name,
    role: s.role,
    date: s.date,
    shift_start: s.shift_start,
    shift_end: s.shift_end,
    hours: s.hours,
    hourly_wage: s.hourly_wage,
    labor_cost: s.labor_cost,
    source: s.source,
    project_id: s.project_id,
    note: s.note,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }
}
