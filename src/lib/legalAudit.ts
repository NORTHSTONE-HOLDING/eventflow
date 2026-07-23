import type { LegalRisk } from '../types'

const RISK_PATTERNS: Array<{
  keywords: string[]
  level: LegalRisk['level']
  title: string
  description: string
  recommendation: string
}> = [
  {
    keywords: ['neomezená odpovědnost', 'veškerá škoda', 'bez limitu'],
    level: 'high',
    title: 'Neomezená odpovědnost za škodu',
    description:
      'Smlouva obsahuje klauzuli o neomezené odpovědnosti, která může ohrozit solventnost agentury.',
    recommendation:
      'Omezte odpovědnost na výši pojistného plnění nebo max. 100 % ceny zakázky.',
  },
  {
    keywords: ['smluvní pokuta', 'pokuta ve výši', 'penále'],
    level: 'high',
    title: 'Vysoká smluvní pokuta',
    description:
      'Detekována smluvní pokuta — zkontrolujte její přiměřenost vůči hodnotě plnění.',
    recommendation:
      'Smluvní pokuta by neměla přesáhnout 10–20 % ceny zakázky. Navrhněte strop.',
  },
  {
    keywords: ['výhradní', 'exkluzivita', 'non-compete', 'zákaz konkurence'],
    level: 'high',
    title: 'Exkluzivita / zákaz konkurence',
    description: 'Klauzule omezuje možnost pracovat pro jiné klienty ve stejném segmentu.',
    recommendation: 'Omezte geograficky a časově (max. 6 měsíců po akci).',
  },
  {
    keywords: ['platební podmínky', 'splatnost', 'záloha', 'doplatek'],
    level: 'medium',
    title: 'Platební podmínky vyžadují pozornost',
    description: 'Platební harmonogram je klíčový — ověřte zálohu min. 40 % před akcí.',
    recommendation: 'Doporučený model: 50 % záloha / 50 % do 7 dnů po akci.',
  },
  {
    keywords: ['výpověď', 'odstoupení', 'storno', 'zrušení'],
    level: 'medium',
    title: 'Storno a odstoupení',
    description: 'Podmínky storna mohou být nevyvážené v neprospěch agentury.',
    recommendation:
      'Zajistěte storno poplatky: 30/60/90 dní = 30/60/100 % ceny.',
  },
  {
    keywords: ['gdpr', 'osobní údaje', 'zpracování údajů'],
    level: 'medium',
    title: 'GDPR a osobní údaje',
    description: 'Smlouva se dotýká zpracování osobních údajů hostů / personálu.',
    recommendation: 'Doplňte DPA (Data Processing Agreement) jako přílohu.',
  },
  {
    keywords: ['force majeure', 'vyšší moc', 'pandemie', 'vis major'],
    level: 'medium',
    title: 'Force majeure klauzule',
    description: 'Ověřte, zda je vyšší moc dostatečně definována.',
    recommendation: 'Explicitně zahrňte pandemii, přírodní katastrofy a zásahy státu.',
  },
]

export async function auditContractText(text: string): Promise<LegalRisk[]> {
  await new Promise((r) => setTimeout(r, 1400))

  const lower = text.toLowerCase()
  const found: LegalRisk[] = []

  for (const pattern of RISK_PATTERNS) {
    if (pattern.keywords.some((k) => lower.includes(k))) {
      found.push({
        level: pattern.level,
        title: pattern.title,
        description: pattern.description,
        recommendation: pattern.recommendation,
      })
    }
  }

  if (found.length === 0) {
    found.push({
      level: 'medium',
      title: 'Obecná kontrola doporučena',
      description:
        'AI nenašla kritické klíčové fráze, ale smlouva by měla projít právním review.',
      recommendation: 'Nechte zkontrolovat právníkem specializovaným na event business.',
    })
  }

  const highCount = found.filter((f) => f.level === 'high').length
  const medCount = found.filter((f) => f.level === 'medium').length

  found.push({
    level: 'summary',
    title: 'Shrnutí lidskou řečí',
    description:
      highCount > 0
        ? `Pozor — našli jsme ${highCount} velkých rizik a ${medCount} upozornění. Před podpisem doporučujeme vyjednat limity odpovědnosti a storno podmínky.`
        : `Smlouva vypadá relativně vyváženě (${medCount} upozornění). Přesto ověřte platební podmínky a storno před finálním podpisem.`,
    recommendation:
      'Uložte audit do složky zakázky a sdílejte s klientem jen shrnutí, nikoli interní rizika.',
  })

  return found
}

export function generateDebtNotice(
  clientName: string,
  amount: number,
  invoiceId: string,
  dueDate: string
): string {
  return (
    `Vážený/á ${clientName || 'kliente'},\n\n` +
    `tímto Vás formálně urgujeme k úhradě splatné pohledávky:\n\n` +
    `Faktura: ${invoiceId}\n` +
    `Částka: ${amount.toLocaleString('cs-CZ')} Kč\n` +
    `Splatnost: ${dueDate}\n\n` +
    `Bez úhrady do 7 dnů budeme nuceni přistoupit k předžalobní výzvě dle § 142a OSŘ ` +
    `a případně dalším právním krokům.\n\n` +
    `S pozdravem,\nEventFlow Legal Desk`
  )
}

export const COLLECTION_TEMPLATES = {
  predalobni: {
    title: 'Předžalobní výzva k úhradě (§ 142a OSŘ)',
    body: (name: string, amount: number, invoice: string) =>
      `PŘEDŽALOBNÍ VÝZVA K ÚHRADĚ\n\n` +
      `dle § 142a zákona č. 99/1963 Sb., občanský soudní řád\n\n` +
      `Vážený/á ${name},\n\n` +
      `vyzýváme Vás k úhradě dlužné částky ${amount.toLocaleString('cs-CZ')} Kč ` +
      `z faktury ${invoice} ve lhůtě 15 dnů od doručení této výzvy.\n\n` +
      `V případě neuhrazení budeme nuceni uplatnit pohledávku soudní cestou ` +
      `včetně příslušenství a náhrady nákladů řízení.\n\n` +
      `V Praze dne ${new Date().toLocaleDateString('cs-CZ')}`,
  },
  trestni: {
    title: 'Podání trestního oznámení pro podezření na podvod (§ 209 TZ)',
    body: (name: string, amount: number, invoice: string) =>
      `TRESTNÍ OZNÁMENÍ\n\n` +
      `pro podezření z trestného činu podvodu dle § 209 trestního zákoníku\n\n` +
      `Oznamovatel tímto podává trestní oznámení na ${name} ` +
      `pro podezření, že úmyslně neuhradil/a závazek z faktury ${invoice} ` +
      `ve výši ${amount.toLocaleString('cs-CZ')} Kč, ačkoli od počátku neměl/a úmysl plnit.\n\n` +
      `Žádáme o prošetření a případné zahájení trestního stíhání.\n\n` +
      `Přílohy: smlouva, faktura, komunikace, předžalobní výzva.`,
  },
  uznani: {
    title: 'Uznání dluhu se splátkovým kalendářem',
    body: (name: string, amount: number, invoice: string) =>
      `UZNÁNÍ DLUHU SE SPLÁTKOVÝM KALENDÁŘEM\n\n` +
      `Dlužník ${name} uznává svůj dluh vůči věřiteli z faktury ${invoice} ` +
      `ve výši ${amount.toLocaleString('cs-CZ')} Kč.\n\n` +
      `Splátkový kalendář:\n` +
      `1. splátka: ${Math.round(amount / 3).toLocaleString('cs-CZ')} Kč — do 30 dnů\n` +
      `2. splátka: ${Math.round(amount / 3).toLocaleString('cs-CZ')} Kč — do 60 dnů\n` +
      `3. splátka: ${Math.round(amount - 2 * Math.round(amount / 3)).toLocaleString('cs-CZ')} Kč — do 90 dnů\n\n` +
      `Při prodlení jedné splátky se stává splatný celý zůstatek.\n\n` +
      `Podpis dlužníka: ________________\n` +
      `Datum: ${new Date().toLocaleDateString('cs-CZ')}`,
  },
} as const
