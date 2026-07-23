import type { AgencyProfile, EventProject } from '../types'
import { formatCurrency } from './documentIds'

export type ReceivableStatus = 'paid' | 'open' | 'overdue' | 'none'

export interface ProjectReceivable {
  projectId: string
  projectName: string
  clientName: string
  clientPhone: string
  invoiceId: string
  contractId: string
  protocolId: string
  dueDate: string
  dueDateLabel: string
  daysOverdue: number
  contractBalance: number
  posExtras: number
  amountDue: number
  status: ReceivableStatus
  depositPaid: boolean
  clientSigned: boolean
  hasSignedProtocol: boolean
  contractText: string
  protocolText: string
  paymentLink: string
}

function defaultDueDate(project: EventProject): string {
  if (project.invoiceDueDate) return project.invoiceDueDate
  // 14 days after event date (or today if missing)
  const base = project.date ? new Date(project.date) : new Date()
  if (Number.isNaN(base.getTime())) {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  }
  base.setDate(base.getDate() + 14)
  return base.toISOString().slice(0, 10)
}

/** Build Czech contract excerpt from project state (Smlouva o dílo). */
export function buildContractDocumentText(
  project: EventProject,
  profile: AgencyProfile
): string {
  const company = profile.companyName || 'EventFlow Agentura'
  const amount = Math.round(project.totalRevenue || 0)
  const deposit = Math.round(amount * 0.5)
  const balance = amount - deposit
  return (
    `SMLOUVA O DÍLO č. ${project.documents?.smlouva || 'SOD—'}\n` +
    `uzavřená dle § 2586 a násl. zákona č. 89/2012 Sb., občanský zákoník\n\n` +
    `Zhotovitel: ${company}, IČO ${profile.ico || '—'}, ${profile.street || ''} ${profile.city || ''}\n` +
    `Objednatel: ${project.clientName || 'Klient'}, tel. ${project.clientPhone || '—'}\n\n` +
    `Čl. I — Předmět díla\n` +
    `Zhotovitel se zavazuje zajistit eventovou produkci „${project.name}" dne ${project.date || '—'} ` +
    `v lokalitě ${project.location || '—'} pro ${project.guests || 0} hostů.\n\n` +
    `Čl. II — Cena a platební podmínky\n` +
    `Celková cena díla: ${formatCurrency(amount)} bez DPH dle nabídky ${project.documents?.nabidka || '—'}.\n` +
    `Záloha 50 % (${formatCurrency(deposit)}) splatná před zahájením produkce.\n` +
    `Doplatek 50 % (${formatCurrency(balance)}) splatný do 14 dnů od předání díla / ukončení akce.\n` +
    `Extra spotřebace (POS/bar) se připočítává k doplatku dle skutečného odběru.\n\n` +
    `Čl. III — Prodlení a sankce\n` +
    `Při prodlení s úhradou doplatku je Objednatel povinen uhradit zákonný úrok z prodlení ` +
    `dle nařízení vlády č. 351/2013 Sb. a smluvní pokutu 0,05 % z dlužné částky za každý den prodlení.\n` +
    `Zhotovitel je oprávněn uplatnit pohledávku soudní cestou po marném uplynutí lhůty předžalobní výzvy dle § 142a OSŘ.\n\n` +
    `Čl. IV — Předání díla\n` +
    `O předání díla bude sepsán Předávací protokol č. ${project.documents?.protokol || 'PP—'}. ` +
    `Podpis protokolu (včetně digitálního podpisu na canvas) zakládá splatnost doplatku.\n\n` +
    `Čl. V — Závěrečná ustanovení\n` +
    `Smlouva je platná a účinná dnem digitálního podpisu Objednatele v klientském portálu.\n` +
    `Stav podpisu: ${project.clientSigned ? 'PODEPSÁNO' : 'NEPODEPSÁNO'}.\n` +
    `Záloha: ${project.depositPaid ? 'UHRAZENA' : 'NEUHRAZENA'}.`
  )
}

/** Build Předávací protokol text from signed project state. */
export function buildProtocolDocumentText(
  project: EventProject,
  profile: AgencyProfile
): string {
  const company = profile.companyName || 'EventFlow Agentura'
  return (
    `PŘEDÁVACÍ PROTOKOL č. ${project.documents?.protokol || 'PP—'}\n` +
    `ke Smlouvě o dílo č. ${project.documents?.smlouva || 'SOD—'}\n\n` +
    `Zhotovitel: ${company}\n` +
    `Objednatel: ${project.clientName || 'Klient'}\n` +
    `Akce: ${project.name}\n` +
    `Datum akce: ${project.date || '—'}\n` +
    `Místo: ${project.location || '—'}\n\n` +
    `1. Objednatel potvrzuje, že dílo (eventová produkce) bylo předáno řádně a včas.\n` +
    `2. Objednatel nemá výhrady k rozsahu ani kvalitě plnění, které by odůvodňovaly zadržení doplatku.\n` +
    `3. Tímto protokolem nastává splatnost doplatku dle Čl. II Smlouvy o dílo.\n` +
    `4. Digitální podpis Objednatele (canvas) je nedílnou součástí tohoto protokolu.\n\n` +
    `Digitální podpis: ${project.clientSignature ? 'ANO — uložen v systému EventFlow' : 'NE'}\n` +
    `Stav: ${project.clientSigned ? 'PROTOKOL POTVRZEN' : 'ČEKÁ NA PODPIS'}\n` +
    `Extra POS/bar na akci: ${formatCurrency(Math.round(project.posExtrasTotal || 0))}\n`
  )
}

export function getProjectReceivable(
  project: EventProject | null | undefined,
  profile: AgencyProfile,
  origin = typeof window !== 'undefined' ? window.location.origin : ''
): ProjectReceivable | null {
  if (!project) return null

  const contractBalance = Math.round((project.totalRevenue || 0) * 0.5)
  const posExtras = Math.round(project.posExtrasTotal || 0)
  const amountDue = contractBalance + posExtras
  const dueDate = defaultDueDate(project)
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const daysOverdue = Math.max(
    0,
    Math.floor((today.getTime() - due.getTime()) / 86400000)
  )

  const eligible =
    Boolean(project.clientSigned) &&
    Boolean(project.depositPaid) &&
    !project.finalPaymentPaid &&
    amountDue > 0 &&
    project.status !== 'cancelled'

  let status: ReceivableStatus = 'none'
  if (project.finalPaymentPaid) status = 'paid'
  else if (eligible && daysOverdue > 0) status = 'overdue'
  else if (eligible) status = 'open'

  const invoiceId =
    project.doplatkovaId || project.documents?.faktura || 'F—'
  const paymentLink = `${origin}/portal?event=${encodeURIComponent(project.id)}&pay=final&invoice=${encodeURIComponent(invoiceId)}`

  return {
    projectId: project.id,
    projectName: project.name,
    clientName: project.clientName || 'Dlužník',
    clientPhone: project.clientPhone || '',
    invoiceId,
    contractId: project.documents?.smlouva || 'SOD—',
    protocolId: project.documents?.protokol || 'PP—',
    dueDate,
    dueDateLabel: due.toLocaleDateString('cs-CZ'),
    daysOverdue,
    contractBalance,
    posExtras,
    amountDue,
    status,
    depositPaid: Boolean(project.depositPaid),
    clientSigned: Boolean(project.clientSigned),
    hasSignedProtocol: Boolean(project.clientSigned && project.clientSignature),
    contractText: buildContractDocumentText(project, profile),
    protocolText: buildProtocolDocumentText(project, profile),
    paymentLink,
  }
}

export function listActiveReceivables(
  projects: EventProject[],
  profile: AgencyProfile
): ProjectReceivable[] {
  return (projects ?? [])
    .map((p) => getProjectReceivable(p, profile))
    .filter((r): r is ProjectReceivable => Boolean(r && (r.status === 'open' || r.status === 'overdue')))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amountDue - a.amountDue)
}
