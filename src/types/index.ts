export type SubscriptionTier = 'LITE' | 'TEAM' | 'BUSINESS' | 'ENTERPRISE'

export interface SubscriptionPlan {
  id: SubscriptionTier
  name: string
  price: number
  currency: string
  period: string
  features: string[]
  highlight?: boolean
}

export interface AgencyProfile {
  companyName: string
  ico: string
  dic: string
  street: string
  city: string
  zip: string
  bankAccount: string
  bankCode: string
  iban: string
  email: string
  phone: string
  contactPerson: string
  subscription: SubscriptionTier
  vopAccepted: boolean
  gdprAccepted: boolean
  registeredAt: string | null
  /** Manager PIN to unlock Admin Dashboard from /pos-terminal (digits). */
  managerPin?: string
  /** Brand logo for printable menus (https / data URL) */
  logoUrl?: string | null
  /** Subtitle under venue name on menu header */
  menuSubtitle?: string | null
  /** Welcome copy for closed-event (raut/svatba) menus */
  eventWelcomeMessage?: string | null
  /** When false, event mode hides unit prices */
  showEventPrices?: boolean
  /**
   * Per-venue OpenAI API key issued by EventFlow platform admin.
   * Used only for this provozovna's AI traffic (never shared globally).
   */
  openaiApiKey?: string
  /** When true, profile UI hides the key and requires Manager PIN to edit. */
  openaiApiKeyLocked?: boolean
}

export interface TimelineItem {
  id: string
  time: string
  title: string
  description: string
  order: number
}

export interface BudgetLine {
  id: string
  category: string
  description: string
  amount: number
  vatRate: number
  isCost: boolean
}

export interface RecipeIngredient {
  name: string
  qtyPerPortion: number
  unit: string
  /** Optional FK to inventory.id when linked */
  inventoryItemId?: string
}

/** Relational recipe BOM row (Supabase recipe_ingredients / local cache) */
export interface RecipeIngredientRecord {
  id: string
  catering_id: string
  catering_name: string
  inventory_item_id: string | null
  ingredient_name: string
  qty_per_portion: number
  unit: string
  user_id: string
  updated_at: string
}

export type OfflineQueueKind =
  | 'inventory_delete'
  | 'inventory_upsert'
  | 'inventory_log'
  | 'recipe_upsert'
  | 'document_sequence'
  | 'staff_shift_upsert'
  | 'staff_shift_delete'
  | 'staff_advance_upsert'
  | 'staff_payroll_upsert'

export interface OfflineQueueEntry {
  id: string
  kind: OfflineQueueKind
  payload: unknown
  createdAt: string
  attempts: number
  lastError?: string
}

export type CloudSyncStatus = 'synced' | 'local' | 'pending' | 'error'

export type POSFoodSubcategory = 'predkrmy' | 'hlavni' | 'dezerty' | 'raut'
export type POSDrinkSubcategory = 'pivo' | 'vino' | 'koktejly' | 'nealko' | 'destilaty'
export type POSSubcategory = POSFoodSubcategory | POSDrinkSubcategory | 'ostatni'

export interface CateringItem {
  id: string
  name: string
  recipe: string
  foodCost: number
  portion: number
  allergens: string[]
  inventory: string[]
  category: 'food' | 'beverage' | 'other'
  subcategory: POSSubcategory | string
  /** POS sell price per portion (Kč, vč. DPH) */
  sellPrice: number
  vatRate: number
  plannedPortions: number
  soldPortions: number
  ingredients: RecipeIngredient[]
  /** Product photo URL (https, data URL, or Supabase public URL) */
  image_url?: string | null
  /** Origin inventory id when tile is pushed from Sklad „Do kasy“ */
  inventory_item_id?: string | null
  /** Direct 1:1 stock sale (bottles/packaged) — no composite recipe required */
  is_direct_sale?: boolean
  /** Temporary Polední menu tile — cleared after midnight */
  is_daily_special?: boolean
  /** Local calendar day YYYY-MM-DD for daily special validity */
  daily_special_date?: string | null
}

export interface WarehouseItem {
  id: string
  name: string
  unit: string
  initialQty: number
  currentQty: number
  category: 'raw' | 'package' | 'beverage'
  linkedCateringIds: string[]
}

export interface WarehouseAlert {
  id: string
  projectId: string
  projectName: string
  warehouseItemId: string
  itemName: string
  percentLeft: number
  createdAt: string
  acknowledged: boolean
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
  category: string
}

export interface StaffMember {
  id: string
  name: string
  role: string
  phone: string
  hourlyWage: number
  attendance: 'confirmed' | 'pending' | 'absent'
  tasks: string[]
  shiftStart: string
  shiftEnd: string
}

/** Calendar-linked staff shift booked onto an event date */
export interface ShiftBooking {
  id: string
  projectId: string
  staffId: string
  staffName: string
  role: string
  /** YYYY-MM-DD */
  date: string
  shiftStart: string
  shiftEnd: string
  hourlyWage: number
  hours: number
  laborCost: number
  attendance: 'confirmed' | 'pending' | 'absent'
  tasks: string[]
  source: 'ai' | 'manual' | 'pos'
}

/** Operational shift row — POS express / Staff manager / Supabase staff_shifts */
export interface StaffShiftRecord {
  id: string
  user_id: string
  staff_id: string
  staff_name: string
  role: string
  /** YYYY-MM-DD */
  date: string
  shift_start: string
  shift_end: string
  hours: number
  hourly_wage: number
  labor_cost: number
  source: 'pos' | 'manual' | 'ai'
  project_id: string | null
  note: string
  created_at: string
  updated_at: string
}

/** Cash advance (záloha) against a payroll month */
export interface StaffAdvance {
  id: string
  user_id: string
  staff_id: string
  staff_name: string
  amount: number
  /** YYYY-MM */
  month_key: string
  note: string
  created_at: string
}

/** Monthly payroll lock — marks wage as fully paid */
export interface StaffPayrollLock {
  id: string
  user_id: string
  staff_id: string
  staff_name: string
  role: string
  /** YYYY-MM */
  month_key: string
  hours: number
  gross_wage: number
  advances: number
  payout: number
  paid: boolean
  paid_at: string | null
  updated_at: string
}

export interface DocumentIds {
  nabidka: string
  smlouva: string
  faktura: string
  protokol: string
  sequence: number
}

export type POSPaymentMethod =
  | 'card'
  | 'invoice'
  | 'all_inclusive'
  | 'cash'
  | 'combined'
  | 'apple_pay'
  | 'google_pay'

/** Draft = waiter's unsent cart; Sent = locked after Odeslat to KDS */
export type PosCartLineState = 'draft' | 'sent'

export interface POSCartLine {
  cateringId: string
  name: string
  category: 'food' | 'beverage' | 'other'
  subcategory: POSSubcategory | string
  unitPrice: number
  qty: number
  vatRate: number
  foodCostPerUnit: number
  /** Volná položka mimo katalog — bez skladového odepisu */
  isCustom?: boolean
  lineId?: string
  waiterId?: string
  waiterName?: string
  /** Legacy flag — prefer cartState === 'sent' */
  sentToKds?: boolean
  /** Explicit draft vs sent lock state */
  cartState?: PosCartLineState
  /** Exact ISO timestamp when waiter clicked Odeslat (KDS stopwatch origin) */
  sentAt?: string | null
  /** KDS ticket id(s) this line was dispatched into */
  kdsTicketIds?: string[]
  /** Direct inventory link for hybrid 1:1 deduction */
  inventory_item_id?: string | null
  is_daily_special?: boolean
  /**
   * Seat / židle assignment (1…capacity).
   * null/undefined = Celý stůl (společný účet).
   */
  seatIndex?: number | null
  /** Guest self-order / online channel flag */
  orderSource?: 'waiter' | 'customer_qr' | 'online'
}

/** Permanent POS / KDS audit trail (storno, odeslání, …) */
export interface PosAuditEntry {
  id: string
  createdAt: string
  action: 'send_order' | 'void_sent_line' | 'remove_draft_line'
  projectId: string
  projectName?: string
  tableId?: string
  tableLabel?: string
  lineId?: string
  lineName?: string
  qty?: number
  unitPrice?: number
  waiterId?: string
  waiterName?: string
  managerAuthorized: boolean
  details: string
  kdsTicketIds?: string[]
}

/** Venue floor space / zone for dynamic table map */
export interface PosSpace {
  id: string
  name: string
  sort: number
  createdAt: string
}

export interface PosTableTab {
  id: string
  label: string
  lines: POSCartLine[]
  status: 'open' | 'paid'
  updatedAt: string
  note?: string
  /** Floor space id (Salonek / Zahrádka / Hlavní sál) */
  spaceId?: string | null
  /** Waiter who last touched this table */
  assignedWaiterId?: string | null
  assignedWaiterName?: string | null
  /**
   * Hybrid POS billing kind:
   * - restaurant = ordinary individual bill (slate)
   * - event = all-inclusive / pre-paid event tab (gold)
   */
  billingKind?: 'restaurant' | 'event'
  /** Dynamic seat capacity — Počet židlí / míst (1–16) */
  seatCapacity?: number
}

/** POS layout: venue master catalog vs event catering vs merged hybrid */
export type PosOperationMode = 'regular' | 'event' | 'hybrid'

export type PrinterRole = 'bar' | 'kitchen' | 'receipt'
export type PrinterConnection = 'bluetooth' | 'network' | 'simulated'

export interface PosPrinter {
  id: string
  name: string
  role: PrinterRole
  connection: PrinterConnection
  address: string
  paired: boolean
  paperWidthMm: 80
  lastSeen: string | null
}

export type KdsTicketStatus = 'new' | 'preparing' | 'done'

export interface KdsTicketLine {
  name: string
  qty: number
  note?: string
  /** Matches POS cart lineId for precise storno sync */
  lineId?: string
  unitPrice?: number
  voided?: boolean
}

export interface KdsTicket {
  id: string
  projectId: string
  projectName: string
  receiptNumber: string
  station: 'kitchen' | 'bar'
  tableLabel: string
  /** Millisecond-precise dispatch time — stopwatch starts here, not on cart tap */
  createdAt: string
  /** Alias of createdAt at Odeslat click (explicit for KDS sync) */
  dispatchedAt?: string
  status: KdsTicketStatus
  lines: KdsTicketLine[]
  waiterId?: string
  waiterName?: string
  orderId?: string
  tableId?: string
  /** When preparation started */
  preparingAt?: string | null
  /** When marked Hotovo */
  completedAt?: string | null
  /** Total prep duration in seconds */
  prepDurationSec?: number | null
  /** Estimated ticket value for daily station revenue (Kč) */
  ticketValue?: number
  /** Origin channel for KDS badge */
  orderSource?: 'waiter' | 'customer_qr' | 'online'
}

/** Cash outflow logged during an active shift (odepis z tržby) */
export type ShiftCashExpenseKind = 'goods_cash' | 'staff_advance' | 'staff_payout'

export interface ShiftCashExpense {
  id: string
  shiftId: string
  kind: ShiftCashExpenseKind
  amount: number
  staffId?: string | null
  staffName?: string | null
  note: string
  createdAt: string
}

/** End-of-shift / denní uzávěrka archive row */
export interface ShiftClosureRecord {
  id: string
  createdAt: string
  shiftId: string
  waiterId: string
  waiterName: string
  managerName: string
  venueName: string
  projectId: string | null
  projectName: string
  revenueKitchen: number
  revenueBar: number
  revenueCard: number
  revenueCash: number
  revenueTotal: number
  deductionGoods: number
  deductionAdvances: number
  deductionPayouts: number
  /** @deprecated use deductionAdvances + deductionPayouts */
  deductionWages: number
  netCashDrawer: number
  expenses: ShiftCashExpense[]
  kdsTicketCount: number
  notes: string
  thermalText: string
}

/** KDS ticket permanently archived after Uzavřít směnu */
export interface ArchivedKdsTicket extends KdsTicket {
  archivedAt: string
  closureId: string
  shiftId: string
}

/** Locked documents container — shift closures + KDS historie */
export interface ShiftDocumentArchive {
  id: string
  createdAt: string
  shiftId: string
  closureId: string
  kind: 'shift_closure'
  title: string
  thermalText: string
  kdsTickets: ArchivedKdsTicket[]
  closure: ShiftClosureRecord
}

/** Independent POS order payload (multi-waiter / KDS) */
export interface PosOrder {
  id: string
  projectId: string
  tableId: string
  tableLabel: string
  waiterId: string
  waiterName: string
  lines: POSCartLine[]
  createdAt: string
  status: 'sent' | 'preparing' | 'ready' | 'served' | 'paid'
  kdsTicketIds: string[]
  receiptNumber: string
}

export interface PosWaiterProfile {
  id: string
  name: string
  role: string
  color: string
}

export interface PosWaiterWorkspace {
  waiterId: string
  activeTableId: string | null
  orderLogIds: string[]
  updatedAt: string
}

export interface TerminalSession {
  id: string
  amount: number
  currency: 'CZK'
  status: 'idle' | 'sending' | 'waiting_card' | 'approved' | 'rejected' | 'cancelled'
  message: string
  provider: 'stripe_terminal' | 'sumup'
  startedAt: string | null
  finishedAt: string | null
}

export interface CustomerDisplayState {
  projectName: string
  lines: Array<{ name: string; qty: number; price: number }>
  total: number
  phase: 'idle' | 'cart' | 'tap_card' | 'approved' | 'rejected'
  message: string
  updatedAt: string
}

export interface POSTransaction {
  id: string
  receiptNumber: string
  timestamp: string
  lines: POSCartLine[]
  paymentMethod: POSPaymentMethod
  totalGross: number
  totalNet: number
  totalVat: number
  totalFoodCost: number
  portionsIssued: number
  appendedToInvoice: boolean
  charged: boolean
  cashAmount?: number
  cardAmount?: number
  changeGiven?: number
  tableId?: string
  tableLabel?: string
}

export interface EventProject {
  id: string
  name: string
  prompt: string
  guests: number
  location: string
  budget: number
  date: string
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  timeline: TimelineItem[]
  budgetLines: BudgetLine[]
  catering: CateringItem[]
  checklist: ChecklistItem[]
  staff: StaffMember[]
  /** Auto-booked / managed shifts linked to calendar & budget labor */
  shiftBookings: ShiftBooking[]
  documents: DocumentIds
  clientPhone: string
  clientName: string
  clientSigned: boolean
  clientSignature: string | null
  depositPaid: boolean
  createdAt: string
  margin: number
  netProfit: number
  totalCost: number
  totalRevenue: number
  /** Live warehouse for POS odepisování */
  warehouse: WarehouseItem[]
  posTransactions: POSTransaction[]
  /** Open guest tabs / table map */
  posTables: PosTableTab[]
  activeTableId: string | null
  /** Extra bar / POS sales appended to doplatková faktura */
  posExtrasTotal: number
  doplatkovaId: string | null
  doplatkovaText: string | null
  posClosed: boolean
  /** Final / doplatek invoice settled */
  finalPaymentPaid: boolean
  /** ISO date of final invoice due date */
  invoiceDueDate: string | null
  /** Last AI debt collection analysis snapshot (Czech legal text) */
  debtLegalAnalysis?: {
    generatedAt: string
    sectionBreach: string
    sectionPreAction: string
    whatsappNotice: string
    source: 'openai' | 'simulated'
    model: string
  } | null
}

export interface LegalRisk {
  level: 'high' | 'medium' | 'summary'
  title: string
  description: string
  recommendation: string
}

export interface MetricSnapshot {
  eventCount: number
  revenue: number
  avgMargin: number
  aiRecommendations: string[]
}

export interface POSLiveMetrics {
  currentTurnover: number
  realMarginPercent: number
  portionsIssued: number
  portionsPlanned: number
  portionsRatioPercent: number
  cardSales: number
  invoiceSales: number
  allInclusivePortions: number
  lowStockCount: number
}

/** 6 luxury print themes (+ legacy aliases remapped in printMenuEngine) */
export type PrintDesign =
  | 'elegant_gold'
  | 'minimalist_nordic'
  | 'classic_vintage'
  | 'cyberpunk_slate'
  | 'rustic_eco'
  | 'grand_hotel'
  /** @deprecated legacy aliases */
  | 'modern'
  | 'elegant'
  | 'corporate'

export type PrintFormat = 'A4' | 'A5' | 'DL'

/** Restaurant à-la-carte vs closed event banquet */
export type PrintOperationMode = 'restaurant' | 'event'

/** Food card vs beverage card */
export type PrintMenuKind = 'food' | 'beverage'

export type PrintMenuSource = 'sklad' | 'project' | 'vision'

export interface PrintMenuItem {
  id: string
  name: string
  description?: string
  sectionId: string
  sectionLabel: string
  /** e.g. 180 g / 0,33 l / 1 porce */
  portionLabel: string
  /** Unit sell price in Kč */
  unitPrice: number
  /** EU allergen numeric codes 1–14 */
  allergenCodes: number[]
  category: 'food' | 'beverage' | 'other'
}

export interface PrintMenuSection {
  id: string
  label: string
  items: PrintMenuItem[]
}

export type InventoryUnit = 'kg' | 'l' | 'ks' | 'ml' | 'g' | 'porce'

export type InventoryLogType = 'naskladneni' | 'odpis_pos' | 'inventura_rozdil'

export interface InventoryItem {
  id: string
  user_id: string
  name: string
  barcode: string | null
  category: string
  subcategory: string
  supplier: string
  purchase_price: number
  average_price: number
  /** Prodejní cena (POS / ceník) */
  sale_price: number
  vat_rate: number
  unit: InventoryUnit | string
  current_quantity: number
  minimum_quantity: number
  /**
   * Objem / hmotnost jednoho balení při unit = „ks“
   * (např. láhev 0.7 l, sud 50 l). Jednotka: litry pro tekutiny, kg pro pevné balení.
   */
  pack_volume: number | null
  /**
   * Zbývající obsah aktuálně otevřeného balení (stejná dimenze jako pack_volume).
   * Null = začít nové balení při prvním odpisu.
   */
  open_pack_remaining: number | null
  /**
   * Produktové foto — https / data URL / Supabase Storage
   * bucket: product-images/{user_id}/{product_id}.jpg
   */
  image_url: string | null
  /**
   * true = aktivní prodejní dlaždice v Kase /pos-terminal
   * false = pouze skladová surovina (výchozí u AI importu)
   */
  pos_visible: boolean
  /**
   * true = surovina (kg/g…) — skrytá z Kasy, odepisuje se přes receptury
   * false = prodejný kus/balení — 1:1 odepis při prodeji
   */
  is_raw_material: boolean
  shelf_life: string | null
  warehouse_section: string
  updated_at: string
  created_at: string
}

export interface InventoryLog {
  id: string
  item_id: string
  type: InventoryLogType
  quantity_changed: number
  user_id: string
  timestamp: string
  note?: string
  unit_price?: number
}

/** AI OCR confidence — high = green, low = amber double-check */
export type AiScanConfidence = 'high' | 'low'

export interface InvoiceVisionLine {
  name: string
  quantity: number
  unit: string
  purchase_price_ex_vat: number
  /** Suggested sell price (POS) when activating in Kasa */
  sale_price?: number
  vat_rate: number
  barcode?: string | null
  /** Inventory category id or Czech label (Jídlo/Pití/…) */
  category?: string
  subcategory?: string
  confidence?: AiScanConfidence
  /** 0–100 simulated/returned AI certainty */
  confidence_score?: number
}

export interface InvoiceVisionResult {
  supplier_name: string
  date: string
  ico: string
  items: InvoiceVisionLine[]
  /** invoice | menu | receipt */
  source_kind?: 'invoice' | 'menu' | 'receipt'
}

export interface InventuraCountRow {
  item_id: string
  expected_quantity: number
  actual_quantity: number | null
  unit_price: number
}

export interface InventuraSession {
  id: string
  warehouse_name: string
  started_at: string
  closed_at: string | null
  counts: InventuraCountRow[]
  status: 'open' | 'closed'
}

export type AppView =
  | 'hero'
  | 'dashboard'
  | 'planner'
  | 'scanner'
  | 'staff'
  | 'portal'
  | 'legal'
  | 'profile'
  | 'print'
  | 'pos'
  | 'hardware'
  | 'inventory'
  | 'cctv'
  | 'closure'
