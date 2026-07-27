/**
 * Stripe Billing SaaS paywall — Checkout session simulation + optional Payment Link.
 * Web-first: never imports Tauri plugins on the browser critical path.
 */

import type { SubscriptionTier } from '../types'
import { uid } from './documentIds'

export interface StripeCheckoutResult {
  ok: boolean
  sessionId: string
  tier: SubscriptionTier
  amountCzk: number
  mode: 'live_link' | 'simulated'
  message: string
}

const TIER_AMOUNTS: Record<SubscriptionTier, number> = {
  LITE: 490,
  TEAM: 1490,
  BUSINESS: 2890,
  ENTERPRISE: 5990,
}

function paymentLinkForTier(tier: SubscriptionTier): string {
  const specific = String(
    import.meta.env[`VITE_STRIPE_PAYMENT_LINK_${tier}`] || '',
  ).trim()
  if (specific) return specific
  return String(import.meta.env.VITE_STRIPE_PAYMENT_LINK || '').trim()
}

/**
 * Start Stripe Billing for the selected SaaS tier.
 * Opens live Payment Link when configured; otherwise simulates a secure session.
 */
export async function startStripeBillingSession(
  tier: SubscriptionTier,
): Promise<StripeCheckoutResult> {
  const amountCzk = TIER_AMOUNTS[tier] ?? 490
  const sessionId = `cs_test_${uid('stripe').replace(/[^a-z0-9]/gi, '')}`
  const link = paymentLinkForTier(tier)

  if (link) {
    window.open(link, '_blank', 'noopener,noreferrer')
    return {
      ok: true,
      sessionId,
      tier,
      amountCzk,
      mode: 'live_link',
      message: `Stripe Checkout otevřen pro tarif ${tier} (${amountCzk.toLocaleString('cs-CZ')} Kč/měsíc).`,
    }
  }

  await new Promise((r) => setTimeout(r, 600))
  return {
    ok: true,
    sessionId,
    tier,
    amountCzk,
    mode: 'simulated',
    message: `Platba SCHVÁLENA (simulace) — tarif ${tier} aktivován · ${amountCzk.toLocaleString('cs-CZ')} Kč/měsíc.`,
  }
}

export function tierAmountCzk(tier: SubscriptionTier): number {
  return TIER_AMOUNTS[tier] ?? 490
}
