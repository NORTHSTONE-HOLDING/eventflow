import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AgencyProfile,
  AppView,
  CateringItem,
  ChecklistItem,
  EventProject,
  LegalRisk,
  StaffMember,
  SubscriptionTier,
  TimelineItem,
} from '../types'
import { generateEventFromPrompt, getAIRecommendations } from '../lib/aiParser'
import { setDocumentSequence } from '../lib/documentIds'
import { auditContractText } from '../lib/legalAudit'

const defaultProfile: AgencyProfile = {
  companyName: '',
  ico: '',
  dic: '',
  street: '',
  city: '',
  zip: '',
  bankAccount: '',
  bankCode: '',
  iban: '',
  email: '',
  phone: '',
  contactPerson: '',
  subscription: 'LITE',
  vopAccepted: false,
  gdprAccepted: false,
  registeredAt: null,
}

interface AppState {
  view: AppView
  showHero: boolean
  profile: AgencyProfile
  projects: EventProject[]
  activeProjectId: string | null
  aiLoading: boolean
  legalRisks: LegalRisk[]
  legalLoading: boolean
  toast: string | null

  setView: (view: AppView) => void
  dismissHero: () => void
  setToast: (msg: string | null) => void
  updateProfile: (patch: Partial<AgencyProfile>) => void
  registerAgency: (profile: AgencyProfile) => void
  setSubscription: (tier: SubscriptionTier) => void

  createFromPrompt: (prompt: string) => Promise<EventProject>
  setActiveProject: (id: string | null) => void
  updateProject: (id: string, patch: Partial<EventProject>) => void
  updateTimeline: (projectId: string, timeline: TimelineItem[]) => void
  updateChecklist: (projectId: string, checklist: ChecklistItem[]) => void
  updateCatering: (projectId: string, catering: CateringItem[]) => void
  addCateringItems: (projectId: string, items: CateringItem[]) => void
  updateStaff: (projectId: string, staff: StaffMember[]) => void
  setClientSignature: (projectId: string, signature: string) => void
  markDepositPaid: (projectId: string) => void

  runLegalAudit: (text: string) => Promise<void>
  getActiveProject: () => EventProject | null
  getMetrics: () => {
    eventCount: number
    revenue: number
    avgMargin: number
    aiRecommendations: string[]
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'hero',
      showHero: true,
      profile: defaultProfile,
      projects: [],
      activeProjectId: null,
      aiLoading: false,
      legalRisks: [],
      legalLoading: false,
      toast: null,

      setView: (view) => set({ view, showHero: view === 'hero' ? true : false }),
      dismissHero: () => set({ showHero: false, view: 'dashboard' }),
      setToast: (msg) => {
        set({ toast: msg })
        if (msg) setTimeout(() => set({ toast: null }), 3500)
      },

      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

      registerAgency: (profile) =>
        set({
          profile: {
            ...profile,
            registeredAt: new Date().toISOString(),
          },
          view: 'dashboard',
          showHero: false,
        }),

      setSubscription: (tier) =>
        set((s) => ({ profile: { ...s.profile, subscription: tier } })),

      createFromPrompt: async (prompt) => {
        set({ aiLoading: true })
        try {
          const project = await generateEventFromPrompt(prompt)
          set((s) => {
            const maxSeq = s.projects.reduce(
              (m, p) => Math.max(m, p.documents.sequence),
              0
            )
            setDocumentSequence(maxSeq + 1)
            return {
              projects: [project, ...s.projects],
              activeProjectId: project.id,
              aiLoading: false,
              view: 'planner',
              showHero: false,
            }
          })
          get().setToast(`Projekt vytvořen — ${project.documents.nabidka}`)
          return project
        } catch (e) {
          set({ aiLoading: false })
          throw e
        }
      },

      setActiveProject: (id) => set({ activeProjectId: id }),

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      updateTimeline: (projectId, timeline) =>
        get().updateProject(projectId, { timeline }),

      updateChecklist: (projectId, checklist) =>
        get().updateProject(projectId, { checklist }),

      updateCatering: (projectId, catering) =>
        get().updateProject(projectId, { catering }),

      addCateringItems: (projectId, items) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, catering: [...items, ...p.catering] }
              : p
          ),
        })),

      updateStaff: (projectId, staff) =>
        get().updateProject(projectId, { staff }),

      setClientSignature: (projectId, signature) =>
        get().updateProject(projectId, {
          clientSigned: true,
          clientSignature: signature,
        }),

      markDepositPaid: (projectId) =>
        get().updateProject(projectId, { depositPaid: true }),

      runLegalAudit: async (text) => {
        set({ legalLoading: true })
        const risks = await auditContractText(text)
        set({ legalRisks: risks, legalLoading: false })
      },

      getActiveProject: () => {
        const s = get()
        return s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0] ?? null
      },

      getMetrics: () => {
        const { projects } = get()
        const active = projects.filter((p) => p.status !== 'cancelled')
        const eventCount = active.length
        const revenue = active.reduce((s, p) => s + p.totalRevenue, 0)
        const avgMargin =
          eventCount > 0
            ? active.reduce((s, p) => s + p.margin, 0) / eventCount
            : 0
        const current = get().getActiveProject()
        const aiRecommendations = current
          ? getAIRecommendations(current)
          : [
              'Vytvořte první akci přes AI Planner pro personalizovaná doporučení.',
              'Nastavte firemní profil (IČO, DIČ, banka) pro autofill dokumentů.',
              'Upgrade na TEAM odemkne WhatsApp koordinaci personálu.',
            ]
        return { eventCount, revenue, avgMargin, aiRecommendations }
      },
    }),
    {
      name: 'eventflow-storage',
      partialize: (s) => ({
        profile: s.profile,
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        showHero: s.showHero,
        view: s.view === 'hero' ? 'dashboard' : s.view,
      }),
    }
  )
)
