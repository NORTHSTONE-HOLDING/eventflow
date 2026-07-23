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
  POSCartLine,
  POSPaymentMethod,
  StaffMember,
  SubscriptionTier,
  TimelineItem,
  WarehouseAlert,
} from '../types'
import { generateEventFromPrompt, getAIRecommendations } from '../lib/aiParser'
import { setDocumentSequence } from '../lib/documentIds'
import { auditContractText } from '../lib/legalAudit'
import {
  buildWarehouseFromCatering,
  decrementWarehouseForSale,
  normalizeCateringForPos,
} from '../lib/inventoryEngine'
import {
  buildDoplatkovaFaktura,
  buildTransaction,
  isPosUnlocked,
} from '../lib/posEngine'

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
  'pos',
]

export function normalizeAppView(view: unknown): AppView {
  if (typeof view === 'string' && APP_VIEWS.includes(view as AppView)) {
    return view as AppView
  }
  return 'dashboard'
}

/** Migrate pre-POS projects so POS never crashes on missing fields. */
export function migrateProject(p: EventProject): EventProject {
  const catering = normalizeCateringForPos(p.catering ?? [])
  const warehouse =
    Array.isArray(p.warehouse) && p.warehouse.length > 0
      ? p.warehouse
      : buildWarehouseFromCatering(catering)

  return {
    ...p,
    catering,
    warehouse,
    posTransactions: Array.isArray(p.posTransactions) ? p.posTransactions : [],
    posExtrasTotal: Number(p.posExtrasTotal) || 0,
    doplatkovaId: p.doplatkovaId ?? null,
    doplatkovaText: p.doplatkovaText ?? null,
    posClosed: Boolean(p.posClosed),
    timeline: p.timeline ?? [],
    budgetLines: p.budgetLines ?? [],
    checklist: p.checklist ?? [],
    staff: p.staff ?? [],
  }
}

export function computeMetrics(projects: EventProject[]): MetricSnapshot {
  const list = Array.isArray(projects) ? projects : []
  const active = list.filter((p) => p && p.status !== 'cancelled')
  const eventCount = active.length
  const revenue = active.reduce(
    (sum, p) => sum + (Number(p.totalRevenue) || 0) + (Number(p.posExtrasTotal) || 0),
    0
  )
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
  warehouseAlerts: WarehouseAlert[]

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

  /** Complete a POS checkout: inventory odepis, metrics, optional invoice append */
  completePosSale: (
    projectId: string,
    lines: POSCartLine[],
    paymentMethod: POSPaymentMethod
  ) => { ok: boolean; receiptNumber?: string; error?: string }
  closePosAndGenerateDoplatkova: (projectId: string) => string | null
  acknowledgeAlert: (alertId: string) => void
  clearAcknowledgedAlerts: () => void
  ensureProjectPosReady: (projectId: string) => void

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
      warehouseAlerts: [],

      setView: (view) => {
        const next = normalizeAppView(view)
        set({ view: next, showHero: false })
      },

      enterApp: (targetView = 'dashboard') => {
        const next = normalizeAppView(targetView)
        set({ showHero: false, view: next })
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
              projects: [migrateProject(project), ...safeProjects],
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
            p.id === id ? migrateProject({ ...p, ...patch }) : p
          ),
        })),

      updateTimeline: (projectId, timeline) =>
        get().updateProject(projectId, { timeline: timeline ?? [] }),

      updateChecklist: (projectId, checklist) =>
        get().updateProject(projectId, { checklist: checklist ?? [] }),

      updateCatering: (projectId, catering) => {
        const normalized = normalizeCateringForPos(catering ?? [])
        get().updateProject(projectId, {
          catering: normalized,
          warehouse: buildWarehouseFromCatering(normalized),
        })
      },

      addCateringItems: (projectId, items) =>
        set((s) => ({
          projects: (s.projects ?? []).map((p) => {
            if (p.id !== projectId) return p
            const merged = normalizeCateringForPos([
              ...(items ?? []),
              ...(p.catering ?? []),
            ])
            return migrateProject({
              ...p,
              catering: merged,
              warehouse: buildWarehouseFromCatering(merged),
            })
          }),
        })),

      updateStaff: (projectId, staff) =>
        get().updateProject(projectId, { staff: staff ?? [] }),

      setClientSignature: (projectId, signature) => {
        get().updateProject(projectId, {
          clientSigned: true,
          clientSignature: signature,
        })
        const p = get().projects.find((x) => x.id === projectId)
        if (p?.depositPaid) {
          get().setToast('POS Kasa odemčena — podpis + záloha hotovo')
        }
      },

      markDepositPaid: (projectId) => {
        get().updateProject(projectId, { depositPaid: true })
        const p = get().projects.find((x) => x.id === projectId)
        if (p?.clientSigned) {
          get().setToast('Záloha uhrazena · Event POS / Kasa je odemčená')
        } else {
          get().setToast('Záloha uhrazena — po podpisu se odemkne POS Kasa')
        }
      },

      ensureProjectPosReady: (projectId) => {
        const p = get().projects.find((x) => x.id === projectId)
        if (!p) return
        get().updateProject(projectId, migrateProject(p))
      },

      completePosSale: (projectId, lines, paymentMethod) => {
        const state = get()
        const project = state.projects.find((p) => p.id === projectId)
        if (!project) return { ok: false, error: 'Projekt nenalezen' }
        if (!isPosUnlocked(project)) {
          return {
            ok: false,
            error: 'POS je zamčená — vyžaduje podpis klienta a uhrazenou zálohu',
          }
        }
        if (!lines.length) return { ok: false, error: 'Košík je prázdný' }

        const migrated = migrateProject(project)
        let warehouse = [...(migrated.warehouse ?? [])]
        let catering = [...(migrated.catering ?? [])]
        const newAlerts: WarehouseAlert[] = []

        for (const line of lines) {
          const item = catering.find((c) => c.id === line.cateringId)
          if (!item) continue
          const result = decrementWarehouseForSale(
            warehouse,
            item,
            line.qty,
            project.id,
            project.name
          )
          warehouse = result.warehouse
          newAlerts.push(...result.alerts)
          catering = catering.map((c) =>
            c.id === line.cateringId
              ? { ...c, soldPortions: (c.soldPortions || 0) + line.qty }
              : c
          )
        }

        const tx = buildTransaction(
          lines,
          paymentMethod,
          migrated.documents?.sequence || 1
        )

        const extrasAdd =
          paymentMethod === 'invoice' || paymentMethod === 'card'
            ? tx.totalGross
            : 0

        // Deduplicate alerts for same warehouse item (keep lowest %)
        const existingAlerts = state.warehouseAlerts ?? []
        const mergedAlerts = [...existingAlerts]
        for (const alert of newAlerts) {
          const idx = mergedAlerts.findIndex(
            (a) =>
              a.warehouseItemId === alert.warehouseItemId &&
              a.projectId === alert.projectId &&
              !a.acknowledged
          )
          if (idx >= 0) {
            if (alert.percentLeft < mergedAlerts[idx].percentLeft) {
              mergedAlerts[idx] = alert
            }
          } else {
            mergedAlerts.unshift(alert)
          }
        }

        set({
          warehouseAlerts: mergedAlerts.slice(0, 50),
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...migrated,
                  warehouse,
                  catering,
                  posTransactions: [tx, ...(migrated.posTransactions ?? [])],
                  posExtrasTotal: (migrated.posExtrasTotal || 0) + extrasAdd,
                }
              : p
          ),
        })

        if (newAlerts.length) {
          get().setToast(
            `⚠️ Sklad pod 15 %: ${newAlerts.map((a) => a.itemName).join(', ')}`
          )
        } else if (paymentMethod === 'all_inclusive') {
          get().setToast(`Porce odkliknuta · ${tx.receiptNumber}`)
        } else if (paymentMethod === 'invoice') {
          get().setToast(`Připsáno na doplatkovou fakturu · ${tx.receiptNumber}`)
        } else {
          get().setToast(`Platba kartou OK · ${tx.receiptNumber}`)
        }

        return { ok: true, receiptNumber: tx.receiptNumber }
      },

      closePosAndGenerateDoplatkova: (projectId) => {
        const state = get()
        const project = state.projects.find((p) => p.id === projectId)
        if (!project) return null
        const migrated = migrateProject(project)
        const doc = buildDoplatkovaFaktura(migrated, state.profile)
        set({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...migrated,
                  doplatkovaId: doc.id,
                  doplatkovaText: doc.text,
                  posClosed: true,
                  status: 'completed',
                }
              : p
          ),
        })
        get().setToast(`Doplatková faktura ${doc.id} vygenerována`)
        return doc.text
      },

      acknowledgeAlert: (alertId) =>
        set((s) => ({
          warehouseAlerts: (s.warehouseAlerts ?? []).map((a) =>
            a.id === alertId ? { ...a, acknowledged: true } : a
          ),
        })),

      clearAcknowledgedAlerts: () =>
        set((s) => ({
          warehouseAlerts: (s.warehouseAlerts ?? []).filter((a) => !a.acknowledged),
        })),

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
        const found =
          projects.find((p) => p?.id === s.activeProjectId) ?? projects[0] ?? null
        return found ? migrateProject(found) : null
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
        warehouseAlerts: s.warehouseAlerts,
      }),
      onRehydrateStorage: () => (state) => {
        queueMicrotask(() => {
          const projects = Array.isArray(state?.projects)
            ? state!.projects.map(migrateProject)
            : []
          useAppStore.setState({
            hydrated: true,
            view: normalizeAppView(state?.view),
            projects,
            profile: { ...defaultProfile, ...(state?.profile ?? {}) },
            showHero: state?.showHero ?? true,
            warehouseAlerts: Array.isArray(state?.warehouseAlerts)
              ? state!.warehouseAlerts
              : [],
          })
        })
      },
    }
  )
)

export function selectActiveProject(s: AppState): EventProject | null {
  const projects = Array.isArray(s.projects) ? s.projects : []
  if (!projects.length) return null
  const found =
    projects.find((p) => p?.id === s.activeProjectId) ?? projects[0] ?? null
  return found ? migrateProject(found) : null
}

export { isPosUnlocked }
