export type SubscriptionTier = 'lite' | 'team' | 'business' | 'enterprise'

export interface PricingPlan {
  id: SubscriptionTier
  name: string
  price: number
  period: string
  tagline: string
  features: string[]
  highlight: boolean
}

export interface Consents {
  gdpr: boolean
  vop: boolean
  llm: boolean
}

export interface CompanyProfile {
  companyName: string
  ico: string
  dic: string
  address: string
  city: string
  zip: string
  vatPayer: boolean
}

export type OnboardingStep = 'auth' | 'paywall' | 'company' | 'aikey' | 'done'

export type ProductCategory = 'jidlo' | 'piti'

export type ProductSubcategory =
  | 'predkrmy'
  | 'hlavni-chody'
  | 'dezerty'
  | 'pivo'
  | 'vino'
  | 'nealko'
  | 'destilaty'

export type Station = 'kitchen' | 'bar'

export interface Product {
  id: string
  name: string
  price: number
  category: ProductCategory
  subcategory: ProductSubcategory
  photo: string
  vatRate: number
  station: Station
}

export type OrderItemState = 'draft' | 'sent'

export type KitchenStatus = 'nova' | 'priprava' | 'hotovo'

export interface OrderItem {
  id: string
  productId: string
  name: string
  price: number
  vatRate: number
  station: Station
  state: OrderItemState
  sentAt: number | null
  kitchenStatus: KitchenStatus
  waiterId: string
  seat: number
}

export interface RestaurantTable {
  id: string
  spaceId: string
  name: string
  seats: number
  items: OrderItem[]
}

export interface Space {
  id: string
  name: string
}

export interface Waiter {
  id: string
  name: string
}

export type AuditAction =
  | 'add-item'
  | 'send-order'
  | 'void-item'
  | 'quick-sale'
  | 'payment'
  | 'close-shift'

export interface AuditLog {
  id: string
  ts: number
  waiterId: string
  waiterName: string
  action: AuditAction
  detail: string
  amount: number
}

export type PaymentMethod = 'cash' | 'card'

export interface SaleLineItem {
  name: string
  price: number
  station: Station
}

export interface SaleRecord {
  id: string
  ts: number
  waiterId: string
  waiterName: string
  tableName: string | null
  items: SaleLineItem[]
  total: number
  method: 'cash' | 'card' | 'split'
  cashPart: number
  cardPart: number
  docNumber: string
}

export interface KdsTicketItem {
  id: string
  name: string
  status: KitchenStatus
}

export interface KdsTicket {
  id: string
  tableId: string | null
  tableName: string
  seat: number | null
  station: Station
  items: KdsTicketItem[]
  createdAt: number
  waiterId: string
  waiterName: string
}

export type CashOutType = 'zbozi' | 'zalohy' | 'vyplaty'

export interface CashOut {
  id: string
  type: CashOutType
  label: string
  amount: number
  workerId: string
}

export interface Camera {
  id: string
  index: number
  name: string
  zone: string
  ip: string
  alert: boolean
}

export interface CctvEvent {
  id: string
  ts: number
  cameraId: string
  cameraName: string
  message: string
  level: 'info' | 'red'
}

export interface ArchiveDay {
  date: string
  clips: number
  sizeGb: number
}

export type MenuTheme =
  | 'elegant-gold'
  | 'minimalist-nordic'
  | 'classic-vintage'
  | 'cyberpunk-slate'
  | 'rustic-eco'
  | 'grand-hotel'

export type MenuFormat = 'A4' | 'A5' | 'DL'

export interface TimelineBlock {
  time: string
  title: string
  detail: string
}

export interface ShoppingLine {
  item: string
  qty: string
  note: string
}

export interface EventPlan {
  title: string
  guests: number
  location: string
  budget: number
  summary: string
  timeline: TimelineBlock[]
  shopping: ShoppingLine[]
  recipes: { name: string; steps: string[] }[]
}
