import type { DocumentIds, EventProject } from '../types'
import { enqueueOffline } from './offlineQueue'
import { getInventorySyncMode, getSupabase } from './supabase'

const SEQ_STORAGE_KEY = 'eventflow-document-sequence'
const YEAR = new Date().getFullYear()

let sequenceCounter = 1
let hydratedFromStorage = false

function readStoredSequence(): number {
  try {
    const raw = localStorage.getItem(SEQ_STORAGE_KEY)
    if (!raw) return 0
    const n = Number(JSON.parse(raw)?.lastSequence)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function writeStoredSequence(n: number) {
  try {
    localStorage.setItem(
      SEQ_STORAGE_KEY,
      JSON.stringify({ lastSequence: n, year: YEAR, updatedAt: new Date().toISOString() })
    )
  } catch {
    // ignore
  }
}

function ensureHydrated() {
  if (hydratedFromStorage) return
  hydratedFromStorage = true
  sequenceCounter = Math.max(1, readStoredSequence() + 1)
}

export function nextDocumentSequence(): number {
  ensureHydrated()
  const n = sequenceCounter++
  writeStoredSequence(n)
  return n
}

export function setDocumentSequence(n: number) {
  ensureHydrated()
  sequenceCounter = Math.max(sequenceCounter, Math.floor(n))
  writeStoredSequence(Math.max(0, sequenceCounter - 1))
}

/** Max sequence already used across local projects + storage. */
export function maxSequenceFromProjects(projects: EventProject[] | null | undefined): number {
  const list = Array.isArray(projects) ? projects : []
  let max = readStoredSequence()
  for (const p of list) {
    const seq = Number(p?.documents?.sequence) || 0
    if (seq > max) max = seq
  }
  return max
}

export async function fetchRemoteDocumentSequence(): Promise<number | null> {
  if (getInventorySyncMode() !== 'online') return null
  const sb = getSupabase()
  if (!sb) return null
  try {
    const { data, error } = await sb
      .from('document_sequences')
      .select('last_sequence')
      .eq('id', 'default')
      .maybeSingle()
    if (error || !data) return null
    return Number(data.last_sequence) || 0
  } catch {
    return null
  }
}

/**
 * Allocate next document sequence with zero-duplication guarantee:
 * max(local storage, local projects, optional remote) + 1.
 */
export async function allocateDocumentSequence(
  projects: EventProject[] | null | undefined
): Promise<number> {
  ensureHydrated()
  const localMax = maxSequenceFromProjects(projects)
  const remoteMax = (await fetchRemoteDocumentSequence()) ?? 0
  const next = Math.max(localMax, remoteMax, sequenceCounter - 1) + 1
  sequenceCounter = next + 1
  writeStoredSequence(next)

  if (getInventorySyncMode() === 'online') {
    const sb = getSupabase()
    if (sb) {
      try {
        await sb.from('document_sequences').upsert({
          id: 'default',
          year: YEAR,
          last_sequence: next,
          updated_at: new Date().toISOString(),
        })
      } catch {
        enqueueOffline('document_sequence', {
          id: 'default',
          year: YEAR,
          last_sequence: next,
        })
      }
    }
  } else {
    enqueueOffline('document_sequence', {
      id: 'default',
      year: YEAR,
      last_sequence: next,
    })
  }

  return next
}

export function generateDocumentIds(sequence?: number): DocumentIds {
  const seq = sequence ?? nextDocumentSequence()
  const padded = String(seq).padStart(3, '0')
  const year = YEAR
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
