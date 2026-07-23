import type { DocumentIds } from '../types'

let sequenceCounter = 1

export function nextDocumentSequence(): number {
  return sequenceCounter++
}

export function setDocumentSequence(n: number) {
  sequenceCounter = Math.max(sequenceCounter, n)
}

export function generateDocumentIds(sequence?: number): DocumentIds {
  const seq = sequence ?? nextDocumentSequence()
  const padded = String(seq).padStart(3, '0')
  const year = 2026
  return {
    nabidka: `CN${year}${padded}`,
    smlouva: `SOD${year}${padded}`,
    faktura: `F${year}${padded}`,
    protokol: `PP${year}${padded}`,
    sequence: seq,
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)} %`
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
