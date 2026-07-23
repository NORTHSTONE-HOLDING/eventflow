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

export interface CateringItem {
  id: string
  name: string
  recipe: string
  foodCost: number
  portion: number
  allergens: string[]
  inventory: string[]
  category: 'food' | 'beverage' | 'other'
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
