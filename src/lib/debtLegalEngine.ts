import type { ProjectReceivable } from './receivables'
import type { AgencyProfile } from '../types'
import { formatCurrency } from './documentIds'
import { formatCzechDate } from './czechDate'

export interface DebtLegalAnalysis {
  projectId: string
  invoiceId: string
  generatedAt: string
  sectionBreach: string
  sectionPreAction: string
  whatsappNotice: string
  model: string
  source: 'openai' | 'simulated'
}

function buildSimulatedAnalysis(
  debt: ProjectReceivable,
  profile: AgencyProfile
): DebtLegalAnalysis {
  const company = profile.companyName || 'EventFlow Agentura'
  const amount = formatCurrency(debt.amountDue)
  const interestNote =
    debt.daysOverdue > 0
      ? `Ke dni analýzy činí prodlení ${debt.daysOverdue} dnů; zákonný úrok z prodlení dle nařízení vlády č. 351/2013 Sb. se počítá denně z částky ${amount}.`
      : `Splatnost nastala / nastává ${debt.dueDateLabel}; při neuhrazení počíná běžet zákonný úrok z prodlení.`

  const sectionBreach =
    `🔴 ANALÝZA PORUŠENÍ SMLOUVY\n\n` +
    `Pohledávka: ${debt.invoiceId} · Zakázka: ${debt.projectName}\n` +
    `Smlouva o dílo: ${debt.contractId}\n` +
    `Předávací protokol: ${debt.protocolId}\n` +
    `Dlužná částka: ${amount} (doplatek smlouvy ${formatCurrency(debt.contractBalance)}` +
    `${debt.posExtras ? ` + POS/bar ${formatCurrency(debt.posExtras)}` : ''})\n` +
    `Splatnost: ${debt.dueDateLabel} · Stav: ${debt.status === 'overdue' ? 'PO SPLATNOSTI' : 'NEUHRAZENO'}\n\n` +
    `1) Porušení Čl. II Smlouvy o dílo (platební podmínky)\n` +
    `   Objednatel ${debt.clientName} neuhradil doplatek ceny díla ve sjednané lhůtě 14 dnů ` +
    `od předání / ukončení akce, ačkoli záloha byla uhrazena a dílo bylo realizováno.\n\n` +
    `2) Porušení povinnosti vzniklé podpisem Předávacího protokolu ${debt.protocolId}\n` +
    `   Digitálně podepsaný předávací protokol (canvas podpis v klientském portálu) ` +
    `zakládá splatnost doplatku. ${debt.hasSignedProtocol ? 'Protokol je v systému evidován jako podepsaný.' : 'Protokol/smlouva jsou vázány na digitální akceptaci v portálu.'}\n\n` +
    `3) Porušení Čl. III (prodlení a sankce)\n` +
    `   ${interestNote}\n` +
    `   Věřitel je oprávněn požadovat smluvní pokutu 0,05 % denně a náhradu nákladů vymáhání.\n\n` +
    `4) Důkazní situace\n` +
    `   • Smlouva o dílo ${debt.contractId}\n` +
    `   • Nabídka / fakturační řada ${debt.invoiceId}\n` +
    `   • Předávací protokol ${debt.protocolId} s digitálním podpisem\n` +
    `   • Evidence zálohy (depositPaid=true) a neuhrazeného doplatku\n`

  const sectionPreAction =
    `📄 PŘEDŽALOBNÍ VÝZVA (§ 142a OSŘ)\n\n` +
    `${company}\n` +
    `${profile.street || ''} ${profile.city || ''} ${profile.zip || ''}\n` +
    `IČO: ${profile.ico || '—'} · DIČ: ${profile.dic || '—'}\n` +
    `E-mail: ${profile.email || '—'} · Tel.: ${profile.phone || '—'}\n` +
    `Č. účtu: ${profile.bankAccount || '—'}/${profile.bankCode || '—'} · IBAN: ${profile.iban || '—'}\n\n` +
    `Věc: Předžalobní výzva k úhradě dle § 142a zákona č. 99/1963 Sb., občanský soudní řád\n\n` +
    `Vážený/á ${debt.clientName},\n\n` +
    `tímto Vás v souladu s § 142a OSŘ vyzýváme k úhradě splatné pohledávky vzniklé ze Smlouvy o dílo ` +
    `č. ${debt.contractId} a na základě Předávacího protokolu č. ${debt.protocolId} ` +
    `(digitálně podepsaného v klientském portálu EventFlow).\n\n` +
    `Identifikace pohledávky:\n` +
    `• Doklad: ${debt.invoiceId}\n` +
    `• Akce: ${debt.projectName}\n` +
    `• Jistina: ${amount}\n` +
    `• Splatnost: ${debt.dueDateLabel}\n` +
    `• Prodlení: ${debt.daysOverdue} dnů\n\n` +
    `VYZÝVÁME VÁS, abyste dlužnou částku včetně zákonného úroku z prodlení uhradili ` +
    `nejpozději do 15 (patnácti) dnů ode dne doručení této výzvy na účet věřitele uvedený v záhlaví, ` +
    `variabilní symbol: ${debt.invoiceId.replace(/\D/g, '') || '0000'}.\n\n` +
    `Upozorňujeme, že:\n` +
    `a) zákonný úrok z prodlení se nadále navyšuje každý den prodlení;\n` +
    `b) digitálně podepsaný Předávací protokol tvoří důkaz o vzniku a splatnosti závazku;\n` +
    `c) po marném uplynutí lhůty podáme žalobu o zaplacení k příslušnému soudu ` +
    `a budeme požadovat jistinu, příslušenství i náhradu nákladů řízení včetně nákladů právního zastoupení;\n` +
    `d) v odůvodněných případech zvážíme i další zákonné prostředky ochrany pohledávky.\n\n` +
    `Okamžitá úhrada online: ${debt.paymentLink}\n\n` +
    `V ${profile.city || 'Praze'} dne ${formatCzechDate(new Date())}\n\n` +
    `${company}\n` +
    `${profile.contactPerson || 'Jednatel / oprávněná osoba'}\n`

  const whatsappNotice =
    `⚠️ PŘEDŽALOBNÍ VÝZVA (§ 142a OSŘ)\n\n` +
    `${debt.clientName}, evidujeme neuhrazenou pohledávku ${debt.invoiceId} ` +
    `ve výši ${amount} (splatnost ${debt.dueDateLabel}).\n\n` +
    `Porušili jste platební povinnost ze Smlouvy o dílo ${debt.contractId} ` +
    `a Předávacího protokolu ${debt.protocolId} (digitální podpis).\n\n` +
    `Bez úhrady do 15 dnů podáme žalobu, zákonný úrok z prodlení narůstá denně.\n\n` +
    `💳 OKAMŽITÁ PLATBA:\n${debt.paymentLink}\n\n` +
    `— ${company} · právní vymáhání pohledávek`

  return {
    projectId: debt.projectId,
    invoiceId: debt.invoiceId,
    generatedAt: new Date().toISOString(),
    sectionBreach,
    sectionPreAction,
    whatsappNotice,
    model: 'eventflow-legal-sim-v1',
    source: 'simulated',
  }
}

function extractSection(text: string, marker: string, nextMarkers: string[]): string {
  const start = text.indexOf(marker)
  if (start < 0) return ''
  let end = text.length
  for (const m of nextMarkers) {
    const idx = text.indexOf(m, start + marker.length)
    if (idx >= 0) end = Math.min(end, idx)
  }
  return text.slice(start, end).trim()
}

export async function analyzeReceivableWithAI(
  debt: ProjectReceivable,
  profile: AgencyProfile
): Promise<DebtLegalAnalysis> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()
  const fallback = buildSimulatedAnalysis(debt, profile)

  if (!apiKey) {
    await new Promise((r) => setTimeout(r, 1200))
    return fallback
  }

  const systemPrompt =
    `Jsi nekompromisní český advokát specializovaný na vymáhání pohledávek z eventových ` +
    `Smluv o dílo. Generuj právně odolný výstup VÝHRADNĚ v češtině. ` +
    `Musíš vytvořit přesně dvě sekce s těmito nadpisy:\n` +
    `1) 🔴 ANALÝZA PORUŠENÍ SMLOUVY — identifikuj konkrétní články/klauzule, které klient porušil neplacením, ` +
    `odkaž na Smlouvu o dílo a digitálně podepsaný Předávací protokol.\n` +
    `2) 📄 PŘEDŽALOBNÍ VÝZVA (§ 142a OSŘ) — kompletní oficiální text výzvy varující před soudním sporem, ` +
    `nabíháním zákonného úroku z prodlení a vynucením digitálně podepsaného protokolu.\n` +
    `Buď konkrétní, formální a nepřipouštěj ústupky. Na konci sekce 2 uveď platební odkaz.`

  const userPrompt =
    `Věřitel: ${profile.companyName || 'EventFlow'}, IČO ${profile.ico || '—'}, ` +
    `účet ${profile.bankAccount || '—'}/${profile.bankCode || '—'}, IBAN ${profile.iban || '—'}\n` +
    `Dlužník: ${debt.clientName}, tel. ${debt.clientPhone || '—'}\n` +
    `Faktura/doklad: ${debt.invoiceId}\n` +
    `Částka: ${debt.amountDue} Kč\n` +
    `Splatnost: ${debt.dueDateLabel} (${debt.daysOverdue} dnů po splatnosti)\n` +
    `Platební odkaz: ${debt.paymentLink}\n\n` +
    `=== SMLOUVA O DÍLO ===\n${debt.contractText}\n\n` +
    `=== PŘEDÁVACÍ PROTOKOL ===\n${debt.protocolText}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!res.ok) return fallback
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      model?: string
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) return fallback

    const sectionBreach =
      extractSection(content, '🔴 ANALÝZA PORUŠENÍ SMLOUVY', [
        '📄 PŘEDŽALOBNÍ VÝZVA',
      ]) || fallback.sectionBreach

    const sectionPreAction =
      extractSection(content, '📄 PŘEDŽALOBNÍ VÝZVA', []) ||
      (content.includes('PŘEDŽALOBNÍ')
        ? content.slice(content.indexOf('PŘEDŽALOBNÍ') - 2)
        : fallback.sectionPreAction)

    const whatsappNotice =
      `⚠️ PŘEDŽALOBNÍ VÝZVA (§ 142a OSŘ)\n\n` +
      `${debt.clientName}, neuhrazeno ${formatCurrency(debt.amountDue)} · ${debt.invoiceId}.\n` +
      `Smlouva ${debt.contractId} / Protokol ${debt.protocolId}.\n` +
      `Bez úhrady do 15 dnů žaloba + zákonný úrok z prodlení.\n\n` +
      `💳 OKAMŽITÁ PLATBA:\n${debt.paymentLink}\n\n` +
      `— ${profile.companyName || 'EventFlow'}`

    return {
      projectId: debt.projectId,
      invoiceId: debt.invoiceId,
      generatedAt: new Date().toISOString(),
      sectionBreach,
      sectionPreAction,
      whatsappNotice,
      model: data.model || 'gpt-4o-mini',
      source: 'openai',
    }
  } catch {
    return fallback
  }
}

export function buildPredzalobniWhatsAppMessage(analysis: DebtLegalAnalysis): string {
  return analysis.whatsappNotice
}
