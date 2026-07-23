import type { SubscriptionPlan } from '../types'

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'LITE',
    name: 'LITE',
    price: 490,
    currency: 'CZK',
    period: 'měsíc',
    features: [
      'Základní plánování akcí',
      'Harmonogram & checklist',
      '1 aktivní projekt',
      'Email podpora',
    ],
  },
  {
    id: 'TEAM',
    name: 'TEAM',
    price: 1490,
    currency: 'CZK',
    period: 'měsíc',
    features: [
      'Vše z LITE',
      'WhatsApp koordinace personálu',
      'Automatizovaná fakturace',
      '5 aktivních projektů',
      'Staff management',
    ],
    highlight: true,
  },
  {
    id: 'BUSINESS',
    name: 'BUSINESS',
    price: 2890,
    currency: 'CZK',
    period: 'měsíc',
    features: [
      'Vše z TEAM',
      'AI Scanner (text)',
      'Multi-sazbový DPH rozpočet',
      'Plný tracking & analytika',
      'Klientský portál + podpis',
      'AI Právní audit',
      'Event POS / Mobilní Kasa',
    ],
  },
  {
    id: 'ENTERPRISE',
    name: 'ENTERPRISE',
    price: 5990,
    currency: 'CZK',
    period: 'měsíc',
    features: [
      'Vše odemčeno',
      'AI Vision Photo Menu Scan',
      'Print layout engine (PDF)',
      'Event POS + skladové alerty',
      'Doplatková faktura z kasy',
      'Full Supabase backup',
      'Neomezené projekty',
      'Priority support & SLA',
    ],
  },
]

export const TIER_RANK: Record<string, number> = {
  LITE: 0,
  TEAM: 1,
  BUSINESS: 2,
  ENTERPRISE: 3,
}

export function hasFeature(
  subscription: string,
  required: 'LITE' | 'TEAM' | 'BUSINESS' | 'ENTERPRISE'
): boolean {
  return (TIER_RANK[subscription] ?? 0) >= (TIER_RANK[required] ?? 0)
}
