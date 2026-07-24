/** Státní svátky České republiky — rok 2026. */
export const CZECH_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': 'Nový rok',
  '2026-04-06': 'Velikonoční pondělí',
  '2026-05-01': 'Svátek práce',
  '2026-05-08': 'Den vítězství',
  '2026-07-05': 'Den slovanských věrozvěstů Cyrila a Metoděje',
  '2026-07-06': 'Den upálení mistra Jana Husa',
  '2026-09-28': 'Den české státnosti',
  '2026-10-28': 'Den vzniku samostatného československého státu',
  '2026-11-17': 'Den boje za svobodu a demokracii',
  '2026-12-24': 'Štědrý den',
  '2026-12-25': '1. svátek vánoční',
  '2026-12-26': '2. svátek vánoční',
}

/** Extendable map — current operational year + neighbors for month spillover. */
export const CZECH_HOLIDAYS: Record<string, string> = {
  ...CZECH_HOLIDAYS_2026,
  '2025-01-01': 'Nový rok',
  '2025-04-21': 'Velikonoční pondělí',
  '2025-05-01': 'Svátek práce',
  '2025-05-08': 'Den vítězství',
  '2025-07-05': 'Den slovanských věrozvěstů Cyrila a Metoděje',
  '2025-07-06': 'Den upálení mistra Jana Husa',
  '2025-09-28': 'Den české státnosti',
  '2025-10-28': 'Den vzniku samostatného československého státu',
  '2025-11-17': 'Den boje za svobodu a demokracii',
  '2025-12-24': 'Štědrý den',
  '2025-12-25': '1. svátek vánoční',
  '2025-12-26': '2. svátek vánoční',
  '2027-01-01': 'Nový rok',
  '2027-03-29': 'Velikonoční pondělí',
  '2027-05-01': 'Svátek práce',
  '2027-05-08': 'Den vítězství',
  '2027-07-05': 'Den slovanských věrozvěstů Cyrila a Metoděje',
  '2027-07-06': 'Den upálení mistra Jana Husa',
  '2027-09-28': 'Den české státnosti',
  '2027-10-28': 'Den vzniku samostatného československého státu',
  '2027-11-17': 'Den boje za svobodu a demokracii',
  '2027-12-24': 'Štědrý den',
  '2027-12-25': '1. svátek vánoční',
  '2027-12-26': '2. svátek vánoční',
}

export function toDateKey(date: Date | string): string {
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10)
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    return toDateKey(d)
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getCzechHolidayName(date: Date | string): string | null {
  const key = toDateKey(date)
  return key ? CZECH_HOLIDAYS[key] || null : null
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}
