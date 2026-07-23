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
}

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
}

export interface PosTableTab {
  id: string
  label: string
  lines: POSCartLine[]
  status: 'open' | 'paid'
  updatedAt: string
  note?: string
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
