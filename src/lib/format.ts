export function formatCZK(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('cs-CZ').format(value)
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateCZ(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export function elapsed(fromTs: number, nowTs: number): string {
  const totalSec = Math.max(0, Math.floor((nowTs - fromTs) / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

let docCounter = 1
export function nextDocNumber(): string {
  const seq = String(docCounter).padStart(4, '0')
  docCounter += 1
  return `F2026${seq}`
}

export function vatBase(gross: number, ratePercent: number): { base: number; vat: number } {
  const base = gross / (1 + ratePercent / 100)
  return { base, vat: gross - base }
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
