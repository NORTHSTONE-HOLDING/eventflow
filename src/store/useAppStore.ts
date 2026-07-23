import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AgencyProfile,
  AppView,
  CateringItem,
  ChecklistItem,
  EventProject,
  KdsTicket,
  KdsTicketStatus,
  LegalRisk,
  MetricSnapshot,
  POSCartLine,
  POSPaymentMethod,
  PosPrinter,
  PosTableTab,
  StaffMember,
  SubscriptionTier,
  TimelineItem,
  WarehouseAlert,
} from '../types'
import { generateEventFromPrompt, getAIRecommendations } from '../lib/aiParser'
import { setDocumentSequence, uid } from '../lib/documentIds'
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
import { DEFAULT_PRINTERS } from '../lib/printerHardware'
import {
  buildKdsTicketsFromCart,
  publishKdsTicket,
} from '../lib/kdsSync'
import { ensurePosTables, mergeCartLine, subtractPaidLines } from '../lib/tableTabs'
import { useInventoryStore } from './useInventoryStore'

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
  'inventory',
]

export function normalizeAppView(view: unknown): AppView {
  if (typeof view === 'string' && APP_VIEWS.includes(view as AppView)) {
    return view as AppView
  }
  return 'dashboard'
}

/** Migrate pre-POS projects so POS never crashes on missing fields. */
export function migrateProject(p: EventProject | null | undefined): EventProject | null {
  if (!p || typeof p !== 'object') return null
  const catering = normalizeCateringForPos(Array.isArray(p.catering) ? p.catering : [])
  const warehouse =
    Array.isArray(p.warehouse) && p.warehouse.length > 0
      ? p.warehouse
      : buildWarehouseFromCatering(catering)

  return {
    ...p,
    name: p.name || 'Bez názvu',
    catering,
    warehouse,
    posTransactions: Array.isArray(p.posTransactions) ? p.posTransactions : [],
    posTables: ensurePosTables(p.posTables),
    activeTableId:
      p.activeTableId ||
      ensurePosTables(p.posTables)[0]?.id ||
      'table_default_1',
    posExtrasTotal: Number(p.posExtrasTotal) || 0,
    doplatkovaId: p.doplatkovaId ?? null,
    doplatkovaText: p.doplatkovaText ?? null,
    posClosed: Boolean(p.posClosed),
    timeline: Array.isArray(p.timeline) ? p.timeline : [],
    budgetLines: Array.isArray(p.budgetLines) ? p.budgetLines : [],
    checklist: Array.isArray(p.checklist) ? p.checklist : [],
    staff: Array.isArray(p.staff) ? p.staff : [],
    documents: p.documents ?? {
      nabidka: 'CN2026000',
      smlouva: 'SOD2026000',
      faktura: 'F2026000',
      protokol: 'PP2026000',
      sequence: 0,
    },
  }
}

function needsPosMigration(p: EventProject): boolean {
  if (!Array.isArray(p.warehouse) || p.warehouse.length === 0) return true
  if (!Array.isArray(p.posTransactions)) return true
  if (!Array.isArray(p.posTables) || p.posTables.length === 0) return true
  const first = p.catering?.[0]
  if (first && (first.sellPrice == null || first.subcategory == null)) return true
  return false
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
  printers: PosPrinter[]
  kdsTickets: KdsTicket[]

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

  completePosSale: (
    projectId: string,
    lines: POSCartLine[],
    paymentMethod: POSPaymentMethod,
    opts?: {
      tableLabel?: string
      tableId?: string
      skipKds?: boolean
      cashAmount?: number
      cardAmount?: number
      changeGiven?: number
      /** If true, remove paid lines from the active/open table tab */
      clearFromTable?: boolean
    }
  ) => { ok: boolean; receiptNumber?: string; error?: string; kdsTicketIds?: string[] }
  closePosAndGenerateDoplatkova: (projectId: string) => string | null
  acknowledgeAlert: (alertId: string) => void
  clearAcknowledgedAlerts: () => void
  ensureProjectPosReady: (projectId: string) => void

  setActiveTable: (projectId: string, tableId: string) => void
  setTableLines: (projectId: string, tableId: string, lines: POSCartLine[]) => void
  addLineToActiveTable: (projectId: string, line: POSCartLine) => void
  renameTable: (projectId: string, tableId: string, label: string) => void
  addTable: (projectId: string, label: string) => void

  upsertPrinter: (printer: PosPrinter) => void
  removePrinter: (printerId: string) => void
  setKdsTicketStatus: (ticketId: string, status: KdsTicketStatus) => void
  addKdsTickets: (tickets: KdsTicket[]) => void

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
      printers: DEFAULT_PRINTERS,
      kdsTickets: [],

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
              projects: [migrateProject(project)!, ...safeProjects],
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
          projects: (s.projects ?? []).map((p) => {
            if (p.id !== id) return p
            const merged = { ...p, ...patch }
            return needsPosMigration(merged)
              ? migrateProject(merged)!
              : merged
          }),
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
            })!
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
        if (!needsPosMigration(p)) return
        const migrated = migrateProject(p)
        if (!migrated) return
        set((s) => ({
          projects: (s.projects ?? []).map((x) =>
            x.id === projectId ? migrated : x
          ),
        }))
      },

      completePosSale: (projectId, lines, paymentMethod, opts) => {
        const state = get()
        const project = state.projects.find((p) => p.id === projectId)
        if (!project) return { ok: false, error: 'Projekt nenalezen' }
        const migrated = migrateProject(project)
        if (!migrated) return { ok: false, error: 'Projekt nelze načíst' }
        if (!isPosUnlocked(migrated)) {
          return {
            ok: false,
            error: 'POS je zamčená — vyžaduje podpis klienta a uhrazenou zálohu',
          }
        }
        if (!lines?.length) return { ok: false, error: 'Košík je prázdný' }

        let warehouse = [...(migrated.warehouse ?? [])]
        let catering = [...(migrated.catering ?? [])]
        const newAlerts: WarehouseAlert[] = []

        const inventoryApi = useInventoryStore.getState()

        for (const line of lines) {
          // Volná položka — bez skladového odepisu
          if (line.isCustom || String(line.cateringId).startsWith('custom_')) continue
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
          newAlerts.push(...(result.alerts ?? []))
          catering = catering.map((c) =>
            c.id === line.cateringId
              ? { ...c, soldPortions: (c.soldPortions || 0) + line.qty }
              : c
          )
          // Supabase / offline inventory transaction by recipe composition
          void inventoryApi.applyPosSaleDeduction(
            item,
            line.qty,
            `POS ${opts?.tableLabel || 'Kasa'} · ${line.name}`
          )
        }

        const charged =
          paymentMethod === 'card' ||
          paymentMethod === 'cash' ||
          paymentMethod === 'combined' ||
          paymentMethod === 'invoice'

        const tx = buildTransaction(
          lines,
          paymentMethod,
          migrated.documents?.sequence || 1,
          {
            cashAmount: opts?.cashAmount,
            cardAmount: opts?.cardAmount,
            changeGiven: opts?.changeGiven,
            tableId: opts?.tableId,
            tableLabel: opts?.tableLabel,
          }
        )

        const extrasAdd = charged ? tx.totalGross : 0

        const tableLabel = opts?.tableLabel || 'Bar / Kasa'
        const catalogLines = lines.filter((l) => !l.isCustom)
        const kdsTickets = opts?.skipKds
          ? []
          : buildKdsTicketsFromCart({
              projectId: migrated.id,
              projectName: migrated.name,
              receiptNumber: tx.receiptNumber,
              tableLabel,
              lines: catalogLines,
            })

        for (const ticket of kdsTickets) {
          publishKdsTicket(ticket)
        }

        let posTables = ensurePosTables(migrated.posTables)
        if (opts?.clearFromTable && opts.tableId) {
          posTables = posTables.map((t) => {
            if (t.id !== opts.tableId) return t
            const remaining = subtractPaidLines(t.lines, lines)
            return {
              ...t,
              lines: remaining,
              status: remaining.length === 0 ? 'open' : t.status,
              updatedAt: new Date().toISOString(),
            }
          })
        }

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
          kdsTickets: [...kdsTickets, ...(state.kdsTickets ?? [])].slice(0, 100),
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...migrated,
                  warehouse,
                  catering,
                  posTables,
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
        } else if (paymentMethod === 'cash') {
          get().setToast(
            `Hotovost OK · ${tx.receiptNumber}` +
              (opts?.changeGiven ? ` · vrátit ${opts.changeGiven} Kč` : '')
          )
        } else if (paymentMethod === 'combined') {
          get().setToast(
            `Kombinovaná platba OK · hotovost ${opts?.cashAmount ?? 0} Kč + karta ${opts?.cardAmount ?? 0} Kč`
          )
        } else {
          get().setToast(`Platba kartou OK · ${tx.receiptNumber}`)
        }

        return {
          ok: true,
          receiptNumber: tx.receiptNumber,
          kdsTicketIds: kdsTickets.map((t) => t.id),
        }
      },

      closePosAndGenerateDoplatkova: (projectId) => {
        const state = get()
        const project = state.projects.find((p) => p.id === projectId)
        if (!project) return null
        const migrated = migrateProject(project)
        if (!migrated) return null
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

      setActiveTable: (projectId, tableId) => {
        get().updateProject(projectId, { activeTableId: tableId })
      },

      setTableLines: (projectId, tableId, lines) => {
        const p = get().projects.find((x) => x.id === projectId)
        if (!p) return
        const tables = ensurePosTables(p.posTables).map((t) =>
          t.id === tableId
            ? {
                ...t,
                lines: Array.isArray(lines) ? lines : [],
                updatedAt: new Date().toISOString(),
                status: 'open' as const,
              }
            : t
        )
        get().updateProject(projectId, { posTables: tables, activeTableId: tableId })
      },

      addLineToActiveTable: (projectId, line) => {
        const p = migrateProject(get().projects.find((x) => x.id === projectId))
        if (!p) return
        const tables = ensurePosTables(p.posTables)
        const activeId = p.activeTableId || tables[0]?.id
        if (!activeId) return
        const next = tables.map((t) => {
          if (t.id !== activeId) return t
          return {
            ...t,
            lines: mergeCartLine(t.lines, line),
            updatedAt: new Date().toISOString(),
            status: 'open' as const,
          }
        })
        get().updateProject(projectId, {
          posTables: next,
          activeTableId: activeId,
        })
      },

      renameTable: (projectId, tableId, label) => {
        const p = get().projects.find((x) => x.id === projectId)
        if (!p) return
        const tables = ensurePosTables(p.posTables).map((t) =>
          t.id === tableId ? { ...t, label: label.trim() || t.label } : t
        )
        get().updateProject(projectId, { posTables: tables })
      },

      addTable: (projectId, label) => {
        const p = migrateProject(get().projects.find((x) => x.id === projectId))
        if (!p) return
        const tables = ensurePosTables(p.posTables)
        const neu: PosTableTab = {
          id: uid('table'),
          label: label.trim() || `Stůl ${tables.length + 1}`,
          lines: [],
          status: 'open',
          updatedAt: new Date().toISOString(),
        }
        get().updateProject(projectId, {
          posTables: [...tables, neu],
          activeTableId: neu.id,
        })
      },

      upsertPrinter: (printer) =>
        set((s) => {
          const list = Array.isArray(s.printers) ? [...s.printers] : []
          const idx = list.findIndex((p) => p.id === printer.id)
          if (idx >= 0) {
            list[idx] = printer
            return { printers: list }
          }
          const roleIdx = list.findIndex((p) => p.role === printer.role)
          if (roleIdx >= 0) {
            list[roleIdx] = printer
            return { printers: list }
          }
          return { printers: [...list, printer] }
        }),

      removePrinter: (printerId) =>
        set((s) => ({
          printers: (s.printers ?? []).filter((p) => p.id !== printerId),
        })),

      setKdsTicketStatus: (ticketId, status) =>
        set((s) => ({
          kdsTickets: (s.kdsTickets ?? []).map((t) =>
            t.id === ticketId ? { ...t, status } : t
          ),
        })),

      addKdsTickets: (tickets) =>
        set((s) => ({
          kdsTickets: [...(tickets ?? []), ...(s.kdsTickets ?? [])].slice(0, 100),
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
        return migrateProject(found)
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
        printers: s.printers,
        kdsTickets: s.kdsTickets,
      }),
      onRehydrateStorage: () => (state) => {
        queueMicrotask(() => {
          const projects = Array.isArray(state?.projects)
            ? state!.projects
                .map((p) => migrateProject(p))
                .filter((p): p is EventProject => Boolean(p))
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
            printers:
              Array.isArray(state?.printers) && state!.printers.length
                ? state!.printers
                : DEFAULT_PRINTERS,
            kdsTickets: Array.isArray(state?.kdsTickets) ? state!.kdsTickets : [],
          })
        })
      },
    }
  )
)

/**
 * Stable selector — returns the raw project reference from the store.
 * NEVER call migrateProject here (new object every read → infinite re-render crash).
 */
export function selectActiveProject(s: AppState): EventProject | null {
  const projects = Array.isArray(s.projects) ? s.projects : []
  if (!projects.length) return null
  return projects.find((p) => p?.id === s.activeProjectId) ?? projects[0] ?? null
}

export { isPosUnlocked }
