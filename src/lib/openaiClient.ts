/**
 * Per-venue OpenAI routing — each provozovna uses its own profile API key.
 * Never falls back to a shared global env key (account traffic isolation).
 */

import { useAppStore } from '../store/useAppStore'
import type { AgencyProfile } from '../types'

/** Czech UX copy when the venue has not been assigned an AI key. */
export const AI_KEY_MISSING_MESSAGE_CS =
  'AI funkce nejsou aktivní. Kontaktujte správu EventFlow pro přidělení klíče AI asistenta vaší provozovně.'

export const AI_KEY_MISSING_SHORT_CS =
  '🔒 Pro aktivaci AI kontaktujte správu EventFlow (chybí klíč AI asistenta provozovny).'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

export type VenueOpenAiProfile = Pick<AgencyProfile, 'openaiApiKey'> | null | undefined

/** Resolve the active venue OpenAI key from an explicit profile or current store. */
export function resolveVenueOpenAiKey(profile?: VenueOpenAiProfile): string {
  const fromArg = String(profile?.openaiApiKey ?? '').trim()
  if (fromArg) return fromArg
  try {
    return String(useAppStore.getState().profile?.openaiApiKey ?? '').trim()
  } catch {
    return ''
  }
}

export function hasVenueOpenAiKey(profile?: VenueOpenAiProfile): boolean {
  return Boolean(resolveVenueOpenAiKey(profile))
}

/** Mask key for UI display (•••• + last 4). */
export function maskOpenAiKey(raw: string | null | undefined): string {
  const key = String(raw || '').trim()
  if (!key) return ''
  if (key.length <= 8) return '••••••••'
  return `${'•'.repeat(Math.min(24, key.length - 4))}${key.slice(-4)}`
}

export type OpenAiChatResult =
  | { ok: true; data: OpenAiChatJson; model?: string }
  | {
      ok: false
      reason: 'missing_key' | 'http' | 'network' | 'empty'
      status?: number
      message: string
    }

export interface OpenAiChatJson {
  choices?: Array<{ message?: { content?: string } }>
  model?: string
}

/**
 * Chat Completions request authenticated with the venue's Bearer key.
 * Returns missing_key without network call when the profile key is empty.
 */
export async function openaiChatCompletions(
  body: Record<string, unknown>,
  opts?: { apiKey?: string; profile?: VenueOpenAiProfile },
): Promise<OpenAiChatResult> {
  const apiKey = String(opts?.apiKey || '').trim() || resolveVenueOpenAiKey(opts?.profile)
  if (!apiKey) {
    return {
      ok: false,
      reason: 'missing_key',
      message: AI_KEY_MISSING_MESSAGE_CS,
    }
  }

  try {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return {
        ok: false,
        reason: 'http',
        status: res.status,
        message: `OpenAI odpověděla chybou ${res.status}. Ověřte klíč AI asistenta v profilu provozovny.`,
      }
    }
    const data = (await res.json()) as OpenAiChatJson
    return { ok: true, data, model: data.model }
  } catch {
    return {
      ok: false,
      reason: 'network',
      message: 'Nepodařilo se spojit s OpenAI. Zkontrolujte připojení a zkuste to znovu.',
    }
  }
}

/** Extract assistant text content from a successful chat response. */
export function openAiMessageContent(data: OpenAiChatJson | unknown): string {
  const json = data as OpenAiChatJson
  return String(json?.choices?.[0]?.message?.content ?? '').trim()
}
