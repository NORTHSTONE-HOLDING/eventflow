import type { TerminalSession } from '../types'
import { uid } from './documentIds'

export type TerminalProvider = 'stripe_terminal' | 'sumup'

export interface TerminalHandshakeResult {
  approved: boolean
  session: TerminalSession
  authCode?: string
  declineReason?: string
}

/**
 * Simulated Stripe Terminal / SumUp JS SDK handshake.
 * Passes the EXACT amount automatically — no manual terminal entry.
 */
export async function runTerminalHandshake(opts: {
  amountCzK: number
  provider?: TerminalProvider
  onStatus?: (session: TerminalSession) => void
  /** Force outcome for tests; default random with high approve rate */
  force?: 'approved' | 'rejected'
}): Promise<TerminalHandshakeResult> {
  const amount = Math.round(Number(opts.amountCzK) || 0)
  if (amount <= 0) {
    const session: TerminalSession = {
      id: uid('term'),
      amount: 0,
      currency: 'CZK',
      status: 'rejected',
      message: 'Neplatná částka pro terminál',
      provider: opts.provider || 'stripe_terminal',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    }
    opts.onStatus?.(session)
    return { approved: false, session, declineReason: session.message }
  }

  const provider = opts.provider || 'stripe_terminal'
  const id = uid('term')

  const emit = (partial: Partial<TerminalSession>) => {
    const session: TerminalSession = {
      id,
      amount,
      currency: 'CZK',
      status: 'idle',
      message: '',
      provider,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      ...partial,
    }
    opts.onStatus?.(session)
    return session
  }

  emit({
    status: 'sending',
    message: `Odesílám ${amount.toLocaleString('cs-CZ')} Kč do terminálu (${provider === 'sumup' ? 'SumUp' : 'Stripe Terminal'})…`,
  })
  await delay(700)

  emit({
    status: 'waiting_card',
    message: `Odesláno do terminálu. Částka: ${amount.toLocaleString('cs-CZ')} Kč. Čekání na přiložení karty…`,
  })
  await delay(1800)

  const approved =
    opts.force === 'approved'
      ? true
      : opts.force === 'rejected'
        ? false
        : Math.random() > 0.12

  if (approved) {
    const session = emit({
      status: 'approved',
      message: 'Platba SCHVÁLENA',
      finishedAt: new Date().toISOString(),
    })
    return {
      approved: true,
      session,
      authCode: `AUTH${Math.floor(100000 + Math.random() * 900000)}`,
    }
  }

  const session = emit({
    status: 'rejected',
    message: 'Platba ZAMÍTNUTA — karta odmítnuta nebo timeout',
    finishedAt: new Date().toISOString(),
  })
  return {
    approved: false,
    session,
    declineReason: 'Transakce zamítnuta terminálem. Košík zůstává aktivní.',
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
