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
  PosAuditEntry,
  PosOrder,
  PosPrinter,
  PosTableTab,
  StaffMember,
  SubscriptionTier,
  TimelineItem,
  WarehouseAlert,
} from '../types'
import { generateEventFromPrompt, getAIRecommendations } from '../lib/aiParser'
import { setDocumentSequence, uid, allocateDocumentSequence, generateDocumentIds } from '../lib/documentIds'
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
  applyKdsLineVoid,
  buildKdsTicketsFromCart,
  publishKdsTicket,
  publishKdsStatus,
  publishKdsVoidLine,
  publishWaiterReady,
} from '../lib/kdsSync'
import {
  clampSeatCapacity,
  ensurePosTables,
  isSentCartLine,
  mergeCartLine,
  resolveActiveTableId,
  subtractPaidLines,
} from '../lib/tableTabs'
import { verifyManagerPin } from './useStaffLockStore'
import { syncProjectShiftsAndBudget } from '../lib/shiftScheduler'
import { useInventoryStore } from './useInventoryStore'
import { useDailySpecialStore } from './useDailySpecialStore'
import { resolveSaleCatalogItem } from '../lib/inventoryPosBridge'

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
  managerPin: '2580',
  logoUrl: null,
  menuSubtitle: '',
  eventWelcomeMessage: '',
  showEventPrices: false,
  openaiApiKey: '',
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
  'cctv',
  'closure',
]

export function normalizeAppView(view: unknown): AppView {
  if (typeof view === 'string' && APP_VIEWS.includes(view as AppView)) {
    return view as AppView
  }
  return 'dashboard'
}

/** Migrate pre-POS projects so POS never crashes on missing fields. */
function migrateProjectRaw(p: EventProject): EventProject {
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
    activeTableId: resolveActiveTableId(p.posTables, p.activeTableId),
    posExtrasTotal: Number(p.posExtrasTotal) || 0,
    doplatkovaId: p.doplatkovaId ?? null,
    doplatkovaText: p.doplatkovaText ?? null,
    posClosed: Boolean(p.posClosed),
    finalPaymentPaid: Boolean(p.finalPaymentPaid),
    invoiceDueDate: p.invoiceDueDate ?? null,
    debtLegalAnalysis: p.debtLegalAnalysis ?? null,
    timeline: Array.isArray(p.timeline) ? p.timeline : [],
    budgetLines: Array.isArray(p.budgetLines) ? p.budgetLines : [],
    checklist: Array.isArray(p.checklist) ? p.checklist : [],
    staff: Array.isArray(p.staff) ? p.staff : [],
    shiftBookings: Array.isArray(p.shiftBookings) ? p.shiftBookings : [],
    documents: p.documents ?? {
      nabidka: 'CN2026000',
      smlouva: 'SOD2026000',
      faktura: 'F2026000',
      protokol: 'PP2026000',
      sequence: 0,
    },
  }
}

/** Public migrate — sync staff shifts into calendar + budget labor. */
export function migrateProject(p: EventProject | null | undefined): EventProject | null {
  if (!p || typeof p !== 'object') return null
  return syncProjectShiftsAndBudget(migrateProjectRaw(p))
}

function needsPosMigration(p: EventProject): boolean {
  if (!Array.isArray(p.warehouse) || p.warehouse.length === 0) return true
  if (!Array.isArray(p.posTransactions)) return true
  if (!Array.isArray(p.posTables) || p.posTables.length === 0) return true
  if (!Array.isArray(p.shiftBookings)) return true
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
  posOrders: PosOrder[]
  posAuditLog: PosAuditEntry[]

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
      waiterId?: string
      waiterName?: string
    }
  ) => { ok: boolean; receiptNumber?: string; error?: string; kdsTicketIds?: string[] }
  closePosAndGenerateDoplatkova: (projectId: string) => string | null
  acknowledgeAlert: (alertId: string) => void
  clearAcknowledgedAlerts: () => void
  ensureProjectPosReady: (projectId: string) => void

  setActiveTable: (projectId: string, tableId: string) => void
  setTableLines: (projectId: string, tableId: string, lines: POSCartLine[]) => void
  addLineToActiveTable: (
    projectId: string,
    line: POSCartLine,
    opts?: { tableId?: string | null; waiterId?: string; waiterName?: string }
  ) => void
  /** Instant unrestricted delete of a draft / nepotvrzené line */
  removeDraftCartLine: (opts: {
    projectId: string
    tableId: string
    lineId: string
    waiterId?: string
    waiterName?: string
  }) => { ok: boolean; error?: string }
  /** Manager-PIN void of a locked Sent line — removes from table + KDS + audit */
  voidSentCartLine: (opts: {
    projectId: string
    tableId: string
    lineId: string
    managerPin: string
    expectedPin?: string
    waiterId?: string
    waiterName?: string
    reason?: string
  }) => { ok: boolean; error?: string }
  renameTable: (projectId: string, tableId: string, label: string) => void
  addTable: (
    projectId: string,
    label: string,
    opts?: { spaceId?: string | null; seatCapacity?: number },
  ) => string | null
  updateTableCapacity: (
    projectId: string,
    tableId: string,
    seatCapacity: number,
  ) => void
  /** Guest QR / online order → table cart + KDS tickets */
  injectCustomerQrOrder: (opts: {
    projectId: string
    tableId: string
    lines: POSCartLine[]
    paymentMethod: POSPaymentMethod
  }) => { ok: boolean; ticketIds?: string[]; error?: string }
  removeTable: (projectId: string, tableId: string) => {
    ok: boolean
    error?: string
  }
  sendTableOrderToKds: (opts: {
    projectId: string
    tableId: string
    waiterId: string
    waiterName: string
  }) => { ok: boolean; orderId?: string; ticketIds?: string[]; error?: string; dispatchedAt?: string }

  upsertPrinter: (printer: PosPrinter) => void
  removePrinter: (printerId: string) => void
  setKdsTicketStatus: (ticketId: string, status: KdsTicketStatus) => void
  addKdsTickets: (tickets: KdsTicket[]) => void
  voidKdsLineByCartLineId: (lineId: string) => void
  /** Wipe all active KDS tickets (called on Uzavřít směnu). */
  clearAllKdsTickets: () => void
  updatePosOrderStatus: (
    orderId: string,
    status: PosOrder['status']
  ) => void

  appendPosAudit: (entry: Omit<PosAuditEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => void

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
      posOrders: [],
      posAuditLog: [],

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
          const seq = await allocateDocumentSequence(get().projects)
          const project = await generateEventFromPrompt(prompt)
          project.documents = generateDocumentIds(seq)
          setDocumentSequence(seq + 1)
          const synced = migrateProject(project)!
          set((s) => {
            const safeProjects = Array.isArray(s.projects) ? s.projects : []
            return {
              projects: [synced, ...safeProjects],
              activeProjectId: synced.id,
              aiLoading: false,
              view: 'planner',
              showHero: false,
            }
          })
          // Link catering recipes → inventory for POS odepis
          void useInventoryStore.getState().syncRecipesFromProjects([synced])
          get().setToast(
            `Projekt vytvořen — ${synced.documents.nabidka} · směny v kalendáři: ${synced.shiftBookings?.length || 0}`
          )
          return synced
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
            // Staff/date changes must rebuild calendar shifts + labor budget
            if (
              patch.staff !== undefined ||
              patch.date !== undefined ||
              patch.shiftBookings !== undefined ||
              needsPosMigration(merged)
            ) {
              return migrateProject({
                ...merged,
                shiftBookings:
                  patch.staff !== undefined || patch.date !== undefined
                    ? []
                    : merged.shiftBookings,
              })!
            }
            return merged
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

      updateStaff: (projectId, staff) => {
        const found = get().projects.find((x) => x.id === projectId)
        if (!found) return
        const p = migrateProjectRaw(found)
        const next = syncProjectShiftsAndBudget({
          ...p,
          staff: staff ?? [],
          shiftBookings: [], // force rebuild from new roster
        })
        set((s) => ({
          projects: (s.projects ?? []).map((x) =>
            x.id === projectId ? next : x
          ),
        }))
      },

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
        const posDeductionJobs: Promise<{ ok: boolean; depleted: string[] }>[] = []

        const dailySpecials = useDailySpecialStore.getState().getActiveSpecials()
        const inventoryItems = inventoryApi.items ?? []

        for (const line of lines) {
          // Volná položka — bez skladového odepisu
          if (line.isCustom || String(line.cateringId).startsWith('custom_')) continue

          const item = resolveSaleCatalogItem({
            line,
            projectCatering: catering,
            inventory: inventoryItems,
            dailySpecials,
          })
          if (!item) continue

          // Project-local warehouse only for event catering rows
          if (catering.some((c) => c.id === item.id)) {
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
              c.id === item.id
                ? { ...c, soldPortions: (c.soldPortions || 0) + line.qty }
                : c
            )
          }

          if (item.is_daily_special) {
            useDailySpecialStore.getState().bumpSold(item.id, line.qty)
          }

          // Hybrid matrix → inventory + inventory_logs (odpis_pos)
          posDeductionJobs.push(
            inventoryApi.applyPosSaleDeduction(
              item,
              line.qty,
              `POS ${opts?.tableLabel || 'Kasa'} · ${line.name}`,
            )
          )
        }

        // Fire async but do not block checkout UI longer than necessary;
        // errors stay in offline queue / local cache.
        void Promise.all(posDeductionJobs).then((results) => {
          const depleted = results.flatMap((r) => r.depleted)
          if (depleted.length) {
            get().setToast(
              `Sklad pod minimem po odpisu: ${Array.from(new Set(depleted)).join(', ')}`
            )
          }
        })

        const charged =
          paymentMethod === 'card' ||
          paymentMethod === 'apple_pay' ||
          paymentMethod === 'google_pay' ||
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
        const catalogLines = lines.filter((l) => !l.isCustom && !l.sentToKds)
        const kdsTickets = opts?.skipKds
          ? []
          : buildKdsTicketsFromCart({
              projectId: migrated.id,
              projectName: migrated.name,
              receiptNumber: tx.receiptNumber,
              tableLabel,
              lines: catalogLines,
              waiterId: opts?.waiterId,
              waiterName: opts?.waiterName,
              tableId: opts?.tableId,
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
        } else if (paymentMethod === 'apple_pay') {
          get().setToast(`Apple Pay · ZAPLACENO · ${tx.receiptNumber}`)
        } else if (paymentMethod === 'google_pay') {
          get().setToast(`Google Pay · ZAPLACENO · ${tx.receiptNumber}`)
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

      addLineToActiveTable: (projectId, line, opts) => {
        const p = migrateProject(get().projects.find((x) => x.id === projectId))
        if (!p) return
        const tables = ensurePosTables(p.posTables)
        const activeId = resolveActiveTableId(
          tables,
          opts?.tableId || p.activeTableId
        )
        if (!activeId) return
        const stamped: POSCartLine = {
          ...line,
          waiterId: opts?.waiterId || line.waiterId,
          waiterName: opts?.waiterName || line.waiterName,
          lineId: line.lineId || uid('line'),
          cartState: 'draft',
          sentToKds: false,
          sentAt: null,
          kdsTicketIds: [],
        }
        const next = tables.map((t) => {
          if (t.id !== activeId) return t
          return {
            ...t,
            lines: mergeCartLine(t.lines, stamped),
            updatedAt: new Date().toISOString(),
            status: 'open' as const,
            assignedWaiterId: opts?.waiterId || t.assignedWaiterId || null,
            assignedWaiterName: opts?.waiterName || t.assignedWaiterName || null,
          }
        })
        get().updateProject(projectId, {
          posTables: next,
          activeTableId: activeId,
        })
      },

      removeDraftCartLine: ({ projectId, tableId, lineId, waiterId, waiterName }) => {
        const state = get()
        const project = migrateProject(state.projects.find((p) => p.id === projectId))
        if (!project) return { ok: false, error: 'Projekt nenalezen' }
        const tables = ensurePosTables(project.posTables)
        const table = tables.find((t) => t.id === tableId)
        if (!table) return { ok: false, error: 'Stůl nenalezen' }
        const line = (table.lines ?? []).find((l) => l.lineId === lineId)
        if (!line) return { ok: false, error: 'Položka nenalezena' }
        if (isSentCartLine(line)) {
          return {
            ok: false,
            error: 'Odeslanou položku nelze smazat bez Manažerského PIN (Storno)',
          }
        }
        const nextLines = (table.lines ?? []).filter((l) => l.lineId !== lineId)
        get().updateProject(projectId, {
          posTables: tables.map((t) =>
            t.id === tableId
              ? { ...t, lines: nextLines, updatedAt: new Date().toISOString() }
              : t,
          ),
        })
        get().appendPosAudit({
          action: 'remove_draft_line',
          projectId,
          projectName: project.name,
          tableId,
          tableLabel: table.label,
          lineId,
          lineName: line.name,
          qty: line.qty,
          unitPrice: line.unitPrice,
          waiterId,
          waiterName,
          managerAuthorized: false,
          details: `Smazána rozpracovaná položka „${line.name}“ (${line.qty}×) ze stolu ${table.label}`,
        })
        return { ok: true }
      },

      voidSentCartLine: ({
        projectId,
        tableId,
        lineId,
        managerPin,
        expectedPin,
        waiterId,
        waiterName,
        reason,
      }) => {
        if (!verifyManagerPin(managerPin, expectedPin || get().profile.managerPin)) {
          return { ok: false, error: 'Nesprávný Manažerský PIN' }
        }
        const state = get()
        const project = migrateProject(state.projects.find((p) => p.id === projectId))
        if (!project) return { ok: false, error: 'Projekt nenalezen' }
        const tables = ensurePosTables(project.posTables)
        const table = tables.find((t) => t.id === tableId)
        if (!table) return { ok: false, error: 'Stůl nenalezen' }
        const line = (table.lines ?? []).find((l) => l.lineId === lineId)
        if (!line) return { ok: false, error: 'Položka nenalezena' }
        if (!isSentCartLine(line)) {
          return { ok: false, error: 'Položka ještě nebyla odeslána — použijte běžné smazání' }
        }

        const nextLines = (table.lines ?? []).filter((l) => l.lineId !== lineId)
        const ticketIds = line.kdsTicketIds ?? []
        const nextTickets = applyKdsLineVoid(state.kdsTickets ?? [], lineId)

        set({
          kdsTickets: nextTickets,
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...project,
                  posTables: tables.map((t) =>
                    t.id === tableId
                      ? {
                          ...t,
                          lines: nextLines,
                          updatedAt: new Date().toISOString(),
                        }
                      : t,
                  ),
                }
              : p,
          ),
        })

        publishKdsVoidLine({
          lineId,
          ticketIds,
          tableId,
          reason: reason || 'Storno manažerem',
        })

        get().appendPosAudit({
          action: 'void_sent_line',
          projectId,
          projectName: project.name,
          tableId,
          tableLabel: table.label,
          lineId,
          lineName: line.name,
          qty: line.qty,
          unitPrice: line.unitPrice,
          waiterId,
          waiterName,
          managerAuthorized: true,
          kdsTicketIds: ticketIds,
          details:
            reason ||
            `STORNO odeslané položky „${line.name}“ (${line.qty}×) · stůl ${table.label} · autorizováno PIN`,
        })

        get().setToast(`Storno: ${line.name} odstraněno z účtu i KDS`)
        return { ok: true }
      },

      sendTableOrderToKds: ({ projectId, tableId, waiterId, waiterName }) => {
        const state = get()
        const project = migrateProject(state.projects.find((p) => p.id === projectId))
        if (!project) return { ok: false, error: 'Projekt nenalezen' }
        const tables = ensurePosTables(project.posTables)
        const table = tables.find((t) => t.id === tableId)
        if (!table) return { ok: false, error: 'Stůl nenalezen' }
        const pending = (table.lines ?? []).filter((l) => !isSentCartLine(l))
        if (!pending.length) {
          return { ok: false, error: 'Žádné rozpracované položky k odeslání' }
        }

        // Exact millisecond of Odeslat click — KDS stopwatch origin
        const dispatchedAt = new Date().toISOString()
        const receiptNumber = `OBJ-${Date.now().toString(36).toUpperCase()}`
        const orderId = uid('order')
        const tickets = buildKdsTicketsFromCart({
          projectId: project.id,
          projectName: project.name,
          receiptNumber,
          tableLabel: table.label,
          lines: pending,
          waiterId,
          waiterName,
          orderId,
          tableId: table.id,
          dispatchedAt,
        })

        for (const ticket of tickets) {
          publishKdsTicket(ticket)
        }

        const kitchenIds = tickets.filter((t) => t.station === 'kitchen').map((t) => t.id)
        const barIds = tickets.filter((t) => t.station === 'bar').map((t) => t.id)

        const markedLines = (table.lines ?? []).map((l) => {
          if (isSentCartLine(l)) return l
          const stationIds =
            l.category === 'beverage'
              ? barIds
              : l.category === 'food'
                ? kitchenIds
                : tickets.map((t) => t.id)
          return {
            ...l,
            cartState: 'sent' as const,
            sentToKds: true,
            sentAt: dispatchedAt,
            kdsTicketIds: stationIds.length ? stationIds : tickets.map((t) => t.id),
            waiterId: l.waiterId || waiterId,
            waiterName: l.waiterName || waiterName,
          }
        })

        const order: PosOrder = {
          id: orderId,
          projectId: project.id,
          tableId: table.id,
          tableLabel: table.label,
          waiterId,
          waiterName,
          lines: pending.map((l) => ({
            ...l,
            cartState: 'sent',
            sentToKds: true,
            sentAt: dispatchedAt,
            waiterId,
            waiterName,
          })),
          createdAt: dispatchedAt,
          status: 'sent',
          kdsTicketIds: tickets.map((t) => t.id),
          receiptNumber,
        }

        set({
          kdsTickets: [...tickets, ...(state.kdsTickets ?? [])].slice(0, 120),
          posOrders: [order, ...(state.posOrders ?? [])].slice(0, 200),
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...project,
                  posTables: tables.map((t) =>
                    t.id === table.id
                      ? {
                          ...t,
                          lines: markedLines,
                          assignedWaiterId: waiterId,
                          assignedWaiterName: waiterName,
                          updatedAt: dispatchedAt,
                        }
                      : t
                  ),
                  // Clear active table so UI returns to space/table map
                  activeTableId: null,
                }
              : p
          ),
        })

        get().appendPosAudit({
          action: 'send_order',
          projectId,
          projectName: project.name,
          tableId: table.id,
          tableLabel: table.label,
          waiterId,
          waiterName,
          managerAuthorized: false,
          kdsTicketIds: tickets.map((t) => t.id),
          details: `Odeslána objednávka ${receiptNumber} · ${pending.length} položek · ${table.label} · ${dispatchedAt}`,
        })

        get().setToast(
          `🔥 Objednávka odeslána · ${tickets.length} ticket(y) · ${table.label}`,
        )
        return {
          ok: true,
          orderId,
          ticketIds: tickets.map((t) => t.id),
          dispatchedAt,
        }
      },

      appendPosAudit: (entry) => {
        const row: PosAuditEntry = {
          ...entry,
          id: entry.id || uid('audit'),
          createdAt: entry.createdAt || new Date().toISOString(),
        }
        set((s) => ({
          posAuditLog: [row, ...(s.posAuditLog ?? [])].slice(0, 500),
        }))
      },

      voidKdsLineByCartLineId: (lineId) => {
        if (!lineId) return
        set((s) => ({
          kdsTickets: applyKdsLineVoid(s.kdsTickets ?? [], lineId),
        }))
      },

      clearAllKdsTickets: () => {
        set({ kdsTickets: [] })
        try {
          localStorage.setItem('eventflow-kds-tickets', JSON.stringify([]))
        } catch {
          // ignore
        }
      },

      renameTable: (projectId, tableId, label) => {
        const p = get().projects.find((x) => x.id === projectId)
        if (!p) return
        const tables = ensurePosTables(p.posTables).map((t) =>
          t.id === tableId ? { ...t, label: label.trim() || t.label } : t
        )
        get().updateProject(projectId, { posTables: tables })
      },

      addTable: (projectId, label, opts) => {
        const p = migrateProject(get().projects.find((x) => x.id === projectId))
        if (!p) return null
        const tables = ensurePosTables(p.posTables)
        const neu: PosTableTab = {
          id: uid('table'),
          label: label.trim() || `Stůl ${tables.length + 1}`,
          lines: [],
          status: 'open',
          updatedAt: new Date().toISOString(),
          billingKind: 'restaurant',
          spaceId: opts?.spaceId || 'space_main',
          seatCapacity: clampSeatCapacity(opts?.seatCapacity ?? 4),
        }
        get().updateProject(projectId, {
          posTables: [...tables, neu],
          activeTableId: neu.id,
        })
        return neu.id
      },

      updateTableCapacity: (projectId, tableId, seatCapacity) => {
        const p = migrateProject(get().projects.find((x) => x.id === projectId))
        if (!p) return
        const cap = clampSeatCapacity(seatCapacity)
        const tables = ensurePosTables(p.posTables).map((t) =>
          t.id === tableId
            ? { ...t, seatCapacity: cap, updatedAt: new Date().toISOString() }
            : t,
        )
        get().updateProject(projectId, { posTables: tables })
      },

      injectCustomerQrOrder: ({ projectId, tableId, lines, paymentMethod }) => {
        const state = get()
        const project = migrateProject(state.projects.find((p) => p.id === projectId))
        if (!project) return { ok: false, error: 'Projekt nenalezen' }
        const tables = ensurePosTables(project.posTables)
        const table = tables.find((t) => t.id === tableId)
        if (!table) return { ok: false, error: 'Stůl nenalezen' }
        const dispatchedAt = new Date().toISOString()
        const incoming = (lines ?? []).map((l) => ({
          ...l,
          lineId: l.lineId || uid('line'),
          cartState: 'sent' as const,
          sentToKds: true,
          sentAt: dispatchedAt,
          orderSource: 'customer_qr' as const,
        }))
        if (!incoming.length) return { ok: false, error: 'Prázdná objednávka' }

        const receiptNumber = `QR-${Date.now().toString(36).toUpperCase()}`
        const orderId = uid('order')
        const tickets = buildKdsTicketsFromCart({
          projectId: project.id,
          projectName: project.name,
          receiptNumber,
          tableLabel: table.label,
          lines: incoming,
          waiterId: 'customer_qr',
          waiterName: 'Online host',
          orderId,
          tableId: table.id,
          dispatchedAt,
          orderSource: 'customer_qr',
        })
        for (const ticket of tickets) publishKdsTicket(ticket)

        const gross = incoming.reduce(
          (s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0),
          0,
        )
        get().completePosSale(project.id, incoming, paymentMethod, {
          clearFromTable: false,
          tableId: table.id,
          tableLabel: table.label,
          skipKds: true,
          waiterId: 'customer_qr',
          waiterName: 'Online host',
          cardAmount: Math.round(gross),
        })

        const nextTables = ensurePosTables(
          migrateProject(get().projects.find((p) => p.id === projectId))?.posTables,
        ).map((t) =>
          t.id === tableId
            ? {
                ...t,
                lines: [...(t.lines ?? []), ...incoming],
                updatedAt: dispatchedAt,
              }
            : t,
        )

        set({
          kdsTickets: [...tickets, ...(get().kdsTickets ?? [])].slice(0, 120),
        })
        get().updateProject(projectId, { posTables: nextTables })
        get().setToast(`📥 ONLINE OBJEDNÁVKA · ${table.label} · ZAPLACENO`)
        return { ok: true, ticketIds: tickets.map((t) => t.id) }
      },

      removeTable: (projectId, tableId) => {
        const p = migrateProject(get().projects.find((x) => x.id === projectId))
        if (!p) return { ok: false, error: 'Projekt nenalezen' }
        const tables = ensurePosTables(p.posTables)
        const target = tables.find((t) => t.id === tableId)
        if (!target) return { ok: false, error: 'Stůl nenalezen' }
        if ((target.lines ?? []).length > 0) {
          return {
            ok: false,
            error: 'Nelze smazat stůl s otevřeným účtem — nejdřív vyúčtujte.',
          }
        }
        if (tables.length <= 1) {
          return { ok: false, error: 'Musí zůstat alespoň jeden stůl.' }
        }
        const next = tables.filter((t) => t.id !== tableId)
        get().updateProject(projectId, {
          posTables: next,
          activeTableId: resolveActiveTableId(next, p.activeTableId),
        })
        return { ok: true }
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

      setKdsTicketStatus: (ticketId, status) => {
        const state = get()
        const ticket = (state.kdsTickets ?? []).find((t) => t.id === ticketId)
        if (!ticket || ticket.status === status) return
        const nowIso = new Date().toISOString()
        let prepDurationSec = ticket.prepDurationSec ?? null
        let preparingAt = ticket.preparingAt ?? null
        let completedAt = ticket.completedAt ?? null
        if (status === 'preparing' && !preparingAt) preparingAt = nowIso
        if (status === 'done') {
          completedAt = nowIso
          const startMs = new Date(preparingAt || ticket.createdAt).getTime()
          prepDurationSec = Math.max(
            0,
            Math.round((Date.now() - startMs) / 1000),
          )
        }
        set({
          kdsTickets: (state.kdsTickets ?? []).map((t) =>
            t.id === ticketId
              ? {
                  ...t,
                  status,
                  preparingAt,
                  completedAt,
                  prepDurationSec,
                }
              : t,
          ),
        })
        publishKdsStatus(ticketId, status)

        if (status === 'preparing' && ticket.orderId) {
          get().updatePosOrderStatus(ticket.orderId, 'preparing')
        }

        if (status === 'done') {
          if (ticket.orderId) {
            get().updatePosOrderStatus(ticket.orderId, 'ready')
          }
          const mins = prepDurationSec != null ? Math.round(prepDurationSec / 60) : 0
          const message = `⚠️ Objednávka ${ticket.receiptNumber} pro ${ticket.tableLabel} je PŘIPRAVENA K ODNESENÍ! (${mins} min)`
          publishWaiterReady({
            ticketId: ticket.id,
            orderNumber: ticket.receiptNumber,
            tableLabel: ticket.tableLabel,
            station: ticket.station,
            waiterId: ticket.waiterId || '',
            waiterName: ticket.waiterName || '',
            message,
          })
        }
      },

      updatePosOrderStatus: (orderId, status) =>
        set((s) => ({
          posOrders: (s.posOrders ?? []).map((o) =>
            o.id === orderId ? { ...o, status } : o
          ),
        })),

      addKdsTickets: (tickets) =>
        set((s) => {
          const incoming = Array.isArray(tickets) ? tickets : []
          const existing = Array.isArray(s.kdsTickets) ? s.kdsTickets : []
          const byId = new Map<string, (typeof existing)[number]>()
          for (const t of existing) byId.set(t.id, t)
          for (const t of incoming) byId.set(t.id, { ...byId.get(t.id), ...t })
          return {
            kdsTickets: Array.from(byId.values())
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
              .slice(0, 100),
          }
        }),

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
        posOrders: s.posOrders,
        posAuditLog: s.posAuditLog,
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
            posOrders: Array.isArray((state as AppState | undefined)?.posOrders)
              ? (state as AppState).posOrders
              : [],
            posAuditLog: Array.isArray((state as AppState | undefined)?.posAuditLog)
              ? (state as AppState).posAuditLog
              : [],
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
