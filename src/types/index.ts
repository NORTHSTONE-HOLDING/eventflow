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
  | 'inventory_upsert'
  | 'inventory_log'
  | 'recipe_upsert'
  | 'document_sequence'

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
  subcategory: POSSubcategory
  /** POS sell price per portion (Kč, vč. DPH) */
  sellPrice: number
  vatRate: number
  plannedPortions: number
  soldPortions: number
  ingredients: RecipeIngredient[]
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

export interface POSCartLine {
  cateringId: string
  name: string
  category: 'food' | 'beverage' | 'other'
  subcategory: POSSubcategory
  unitPrice: number
  qty: number
  vatRate: number
  foodCostPerUnit: number
  /** Volná položka mimo katalog — bez skladového odepisu */
  isCustom?: boolean
  lineId?: string
  waiterId?: string
  waiterName?: string
  sentToKds?: boolean
}

export interface PosTableTab {
  id: string
  label: string
  lines: POSCartLine[]
  status: 'open' | 'paid'
  updatedAt: string
  note?: string
  /** Waiter who last touched this table */
  assignedWaiterId?: string | null
  assignedWaiterName?: string | null
}

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
}

export interface KdsTicket {
  id: string
  projectId: string
  projectName: string
  receiptNumber: string
  station: 'kitchen' | 'bar'
  tableLabel: string
  createdAt: string
  status: KdsTicketStatus
  lines: KdsTicketLine[]
  waiterId?: string
  waiterName?: string
  orderId?: string
  tableId?: string
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

export type PrintDesign = 'modern' | 'elegant' | 'corporate'
export type PrintFormat = 'A4' | 'A5'

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
  vat_rate: number
  unit: InventoryUnit | string
  current_quantity: number
  minimum_quantity: number
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

export interface InvoiceVisionLine {
  name: string
  quantity: number
  unit: string
  purchase_price_ex_vat: number
  vat_rate: number
  barcode?: string | null
}

export interface InvoiceVisionResult {
  supplier_name: string
  date: string
  ico: string
  items: InvoiceVisionLine[]
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
  | 'inventory'
