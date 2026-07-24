/**
 * EventFlow — global Czech date/time formatting
 * Canonical display format: DD.MM.YYYY (e.g. 24.07.2026)
 */

const WEEKDAYS_CS = [
  'Neděle',
  'Pondělí',
  'Úterý',
  'Středa',
  'Čtvrtek',
  'Pátek',
  'Sobota',
] as const

const WEEKDAYS_CS_SHORT = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'] as const

function toValidDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null || input === '') return null
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input
  }
  if (typeof input === 'number') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const raw = String(input).trim()
  if (!raw) return null

  // Already DD.MM.YYYY or DD.MM.YYYY HH:mm
  const cz = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (cz) {
    const d = new Date(
      Number(cz[3]),
      Number(cz[2]) - 1,
      Number(cz[1]),
      cz[4] ? Number(cz[4]) : 12,
      cz[5] ? Number(cz[5]) : 0,
      cz[6] ? Number(cz[6]) : 0,
    )
    return Number.isNaN(d.getTime()) ? null : d
  }

  // YYYY-MM-DD (optional time)
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDay && raw.length <= 10) {
    const d = new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]), 12, 0, 0)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** DD.MM.YYYY — primary Czech business date format */
export function formatCzechDate(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** DD.MM.YYYY HH:mm */
export function formatCzechDateTime(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return `${formatCzechDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** DD.MM.YYYY HH:mm:ss */
export function formatCzechDateTimeFull(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return `${formatCzechDateTime(d)}:${pad2(d.getSeconds())}`
}

/** HH:mm */
export function formatCzechTime(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** DD.MM.YYYY (Pondělí) — archive day rows, calendar detail */
export function formatCzechDateWithWeekday(
  input: Date | string | number | null | undefined,
): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return `${formatCzechDate(d)} (${WEEKDAYS_CS[d.getDay()]})`
}

/** MM.YYYY for month headers */
export function formatCzechMonthYear(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return `${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Long Czech month name + year for calendar chrome: „červenec 2026“ */
export function formatCzechMonthNameYear(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return d.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })
}

export function czechWeekdayName(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return WEEKDAYS_CS[d.getDay()]
}

export function czechWeekdayShort(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input)
  if (!d) return '—'
  return WEEKDAYS_CS_SHORT[d.getDay()]
}

/** Hourly clip window label: 08:00 – 09:00 */
export function formatCzechHourRange(hourKey: string): string {
  const h = Number.parseInt(hourKey, 10)
  if (Number.isNaN(h) || h < 0 || h > 23) return hourKey
  const next = (h + 1) % 24
  return `${pad2(h)}:00 – ${pad2(next)}:00`
}

export { WEEKDAYS_CS, WEEKDAYS_CS_SHORT }
