import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AgencyProfile,
  AppView,
  CateringItem,
  ChecklistItem,
  EventProject,
  LegalRisk,
  MetricSnapshot,
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

const APP_VIEWS: AppView[] = [
  'dashboard',
  'planner',
  'scanner',
  'staff',
  'portal',
  'legal',
  'profile',
  'print',
]

/** Normalize any persisted / invalid view into a real app screen (never 'hero' inside shell). */
export function normalizeAppView(view: unknown): AppView {
  if (typeof view === 'string' && APP_VIEWS.includes(view as AppView)) {
    return view as AppView
  }
  return 'dashboard'
}

export function computeMetrics(projects: EventProject[]): MetricSnapshot {
  const list = Array.isArray(projects) ? projects : []
  const active = list.filter((p) => p && p.status !== 'cancelled')
  const eventCount = active.length
  const revenue = active.reduce((sum, p) => sum + (Number(p.totalRevenue) || 0), 0)
  const avgMargin =
    eventCount > 0
      ? active.reduce((sum, p) => sum + (Number(p.margin) || 0), 0) / eventCount
      : 0

  const current = active[0] ?? null
  const aiRecommendations = current
    ? getAIRecommendations(current)
    : [
        'Vytvořte první akci přes AI Planner pro personalizovaná doporučení.',
        'Nastavte firemní profil (IČO, DIČ, banka) pro autofill dokumentů.',
        'Upgrade na TEAM odemkne WhatsApp koordinaci personálu.',
      ]

  return {
    eventCount,
    revenue,
    avgMargin,
    aiRecommendations: aiRecommendations ?? [],
  }
}

interface AppState {
  view: AppView
  showHero: boolean
  hydrated: boolean
  profile: AgencyProfile
  projects: EventProject[]
  activeProjectId: string | null
  aiLoading: boolean
  legalRisks: LegalRisk[]
  legalLoading: boolean
  toast: string | null

  setView: (view: AppView) => void
  enterApp: (targetView?: AppView) => void
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
  getMetrics: () => MetricSnapshot
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'dashboard',
      showHero: true,
      hydrated: false,
      profile: defaultProfile,
      projects: [],
      activeProjectId: null,
      aiLoading: false,
      legalRisks: [],
      legalLoading: false,
      toast: null,

      setView: (view) => {
        const next = normalizeAppView(view)
        set({ view: next, showHero: false })
      },

      /** Single entry point from Hero → AppShell with a guaranteed active view. */
      enterApp: (targetView = 'dashboard') => {
        const next = normalizeAppView(targetView)
        set({
          showHero: false,
          view: next,
        })
      },

      dismissHero: () => {
        get().enterApp('dashboard')
      },

      setToast: (msg) => {
        set({ toast: msg })
        if (msg) {
          window.setTimeout(() => {
            if (get().toast === msg) set({ toast: null })
          }, 3500)
        }
      },

      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),

      registerAgency: (profile) =>
        set({
          profile: {
            ...defaultProfile,
            ...profile,
            registeredAt: new Date().toISOString(),
          },
          view: 'dashboard',
          showHero: false,
        }),

      setSubscription: (tier) =>
        set((s) => ({ profile: { ...s.profile, subscription: tier } })),

      createFromPrompt: async (prompt) => {
        set({ aiLoading: true, showHero: false })
        try {
          const project = await generateEventFromPrompt(prompt)
          set((s) => {
            const safeProjects = Array.isArray(s.projects) ? s.projects : []
            const maxSeq = safeProjects.reduce(
              (m, p) => Math.max(m, p?.documents?.sequence ?? 0),
              0
            )
            setDocumentSequence(maxSeq + 1)
            return {
              projects: [project, ...safeProjects],
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
          get().setToast('AI Planner selhal — zkuste to znovu')
          throw e
        }
      },

      setActiveProject: (id) => set({ activeProjectId: id }),

      updateProject: (id, patch) =>
        set((s) => ({
          projects: (s.projects ?? []).map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        })),

      updateTimeline: (projectId, timeline) =>
        get().updateProject(projectId, { timeline: timeline ?? [] }),

      updateChecklist: (projectId, checklist) =>
        get().updateProject(projectId, { checklist: checklist ?? [] }),

      updateCatering: (projectId, catering) =>
        get().updateProject(projectId, { catering: catering ?? [] }),

      addCateringItems: (projectId, items) =>
        set((s) => ({
          projects: (s.projects ?? []).map((p) =>
            p.id === projectId
              ? { ...p, catering: [...(items ?? []), ...(p.catering ?? [])] }
              : p
          ),
        })),

      updateStaff: (projectId, staff) =>
        get().updateProject(projectId, { staff: staff ?? [] }),

      setClientSignature: (projectId, signature) =>
        get().updateProject(projectId, {
          clientSigned: true,
          clientSignature: signature,
        }),

      markDepositPaid: (projectId) =>
        get().updateProject(projectId, { depositPaid: true }),

      runLegalAudit: async (text) => {
        set({ legalLoading: true })
        try {
          const risks = await auditContractText(text || '')
          set({ legalRisks: risks ?? [], legalLoading: false })
        } catch {
          set({ legalRisks: [], legalLoading: false })
          get().setToast('Právní audit se nezdařil')
        }
      },

      getActiveProject: () => {
        const s = get()
        const projects = Array.isArray(s.projects) ? s.projects : []
        if (!projects.length) return null
        return (
          projects.find((p) => p?.id === s.activeProjectId) ?? projects[0] ?? null
        )
      },

      getMetrics: () => computeMetrics(get().projects ?? []),
    }),
    {
      name: 'eventflow-storage',
      partialize: (s) => ({
        profile: s.profile,
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        showHero: s.showHero,
        view: normalizeAppView(s.view),
      }),
      onRehydrateStorage: () => (state) => {
        // Normalize after persist rehydration so AppShell never boots on an invalid view
        queueMicrotask(() => {
          useAppStore.setState({
            hydrated: true,
            view: normalizeAppView(state?.view),
            projects: Array.isArray(state?.projects) ? state!.projects : [],
            profile: { ...defaultProfile, ...(state?.profile ?? {}) },
            showHero: state?.showHero ?? true,
          })
        })
      },
    }
  )
)

/** Stable selector: active project by id (no new object allocation in selector). */
export function selectActiveProject(s: AppState): EventProject | null {
  const projects = Array.isArray(s.projects) ? s.projects : []
  if (!projects.length) return null
  return projects.find((p) => p?.id === s.activeProjectId) ?? projects[0] ?? null
}
