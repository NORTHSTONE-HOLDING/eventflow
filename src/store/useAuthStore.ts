import { create } from 'zustand'
import type {
  CompanyProfile,
  Consents,
  OnboardingStep,
  SubscriptionTier,
} from '../lib/types'

interface AuthState {
  loggedIn: boolean
  email: string
  step: OnboardingStep
  consents: Consents
  tier: SubscriptionTier | null
  company: CompanyProfile
  aiKey: string
  keyLocked: boolean

  signIn: (email: string) => void
  setConsent: (key: keyof Consents, value: boolean) => void
  choosePlan: (tier: SubscriptionTier) => void
  setCompany: (patch: Partial<CompanyProfile>) => void
  confirmCompany: () => void
  setAiKey: (value: string) => void
  lockKey: () => void
  unlockKey: () => void
  finishOnboarding: () => void
  goToStep: (step: OnboardingStep) => void
  logout: () => void
  reset: () => void
}

const emptyCompany: CompanyProfile = {
  companyName: '',
  ico: '',
  dic: '',
  address: '',
  city: '',
  zip: '',
  vatPayer: true,
}

export const useAuthStore = create<AuthState>((set) => ({
  loggedIn: false,
  email: '',
  step: 'auth',
  consents: { gdpr: false, vop: false, llm: false },
  tier: null,
  company: { ...emptyCompany },
  aiKey: '',
  keyLocked: false,

  signIn: (email) => set({ email, loggedIn: true, step: 'paywall' }),
  setConsent: (key, value) =>
    set((s) => ({ consents: { ...s.consents, [key]: value } })),
  choosePlan: (tier) => set({ tier, step: 'company' }),
  setCompany: (patch) => set((s) => ({ company: { ...s.company, ...patch } })),
  confirmCompany: () => set({ step: 'aikey' }),
  setAiKey: (value) => set({ aiKey: value }),
  lockKey: () => set((s) => (s.aiKey.trim() ? { keyLocked: true } : {})),
  unlockKey: () => set({ keyLocked: false }),
  finishOnboarding: () => set({ step: 'done' }),
  goToStep: (step) => set({ step }),
  logout: () => set({ loggedIn: false, step: 'auth' }),
  reset: () =>
    set({
      loggedIn: false,
      email: '',
      step: 'auth',
      consents: { gdpr: false, vop: false, llm: false },
      tier: null,
      company: { ...emptyCompany },
      aiKey: '',
      keyLocked: false,
    }),
}))
