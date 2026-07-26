/**
 * Simulated Apple Pay / Google Pay biometric token handshake for mobile POS.
 * Resolves to an approved wallet payment after a short Face ID / fingerprint delay.
 */

export type WalletPayProvider = 'apple_pay' | 'google_pay'

export interface WalletPaySession {
  provider: WalletPayProvider
  status: 'idle' | 'biometric' | 'tokenizing' | 'approved' | 'declined'
  message: string
  amountCzK: number
}

export interface WalletPayResult {
  approved: boolean
  provider: WalletPayProvider
  amountCzK: number
  tokenRef: string
  declineReason?: string
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Run a mocked biometric wallet authorization (Face ID / otisk). */
export async function runMobileWalletHandshake(opts: {
  provider: WalletPayProvider
  amountCzK: number
  onStatus?: (session: WalletPaySession) => void
}): Promise<WalletPayResult> {
  const amount = Math.max(0, Math.round(Number(opts.amountCzK) || 0))
  const provider = opts.provider
  const brand = provider === 'apple_pay' ? 'Apple Pay' : 'Google Pay'
  const biometric =
    provider === 'apple_pay' ? 'Face ID / Touch ID' : 'Otisk prstu / biometrie'

  const emit = (status: WalletPaySession['status'], message: string) => {
    opts.onStatus?.({ provider, status, message, amountCzK: amount })
  }

  emit('biometric', `${brand}: ověřte ${biometric}…`)
  await sleep(700)
  emit('tokenizing', `${brand}: tokenizace platby ${amount.toLocaleString('cs-CZ')} Kč…`)
  await sleep(650)
  emit('approved', `${brand}: ZAPLACENO`)

  return {
    approved: true,
    provider,
    amountCzK: amount,
    tokenRef: `WALLET-${provider === 'apple_pay' ? 'AP' : 'GP'}-${Date.now().toString(36).toUpperCase()}`,
  }
}
