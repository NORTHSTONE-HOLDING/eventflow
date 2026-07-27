// Czech ARES (Administrativní registr ekonomických subjektů) identification lookup.
// Attempts a live call to the public ARES v3 REST API and gracefully falls back
// to a deterministic local simulation when the network / CORS is unavailable.

export interface AresResult {
  companyName: string
  dic: string
  address: string
  city: string
  zip: string
  vatPayer: boolean
  source: 'ares' | 'offline'
}

const ARES_BASE =
  'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty'

interface AresApiResponse {
  obchodniJmeno?: string
  dic?: string
  sidlo?: {
    textovaAdresa?: string
    nazevObce?: string
    psc?: number
  }
}

const OFFLINE_DB: Record<string, Omit<AresResult, 'source'>> = {
  '27604977': {
    companyName: 'Alza.cz a.s.',
    dic: 'CZ27604977',
    address: 'Jankovcova 1522/53',
    city: 'Praha',
    zip: '17000',
    vatPayer: true,
  },
  '45317054': {
    companyName: 'Škoda Auto a.s.',
    dic: 'CZ45317054',
    address: 'tř. Václava Klementa 869',
    city: 'Mladá Boleslav',
    zip: '29301',
    vatPayer: true,
  },
  '26168685': {
    companyName: 'Kofola ČeskoSlovensko a.s.',
    dic: 'CZ26168685',
    address: 'Nad Porubkou 2278/31a',
    city: 'Ostrava',
    zip: '70800',
    vatPayer: true,
  },
}

function isValidIco(ico: string): boolean {
  return /^\d{8}$/.test(ico)
}

function offlineLookup(ico: string): AresResult {
  const hit = OFFLINE_DB[ico]
  if (hit) return { ...hit, source: 'offline' }
  // Deterministic synthetic subject so the wizard always resolves offline.
  const zipSeed = 10000 + (Number(ico.slice(0, 5)) % 89999)
  return {
    companyName: `Eventová agentura ${ico.slice(0, 4)} s.r.o.`,
    dic: `CZ${ico}`,
    address: `Náměstí Míru ${(Number(ico.slice(-2)) % 90) + 1}`,
    city: 'Praha',
    zip: String(zipSeed),
    vatPayer: Number(ico[7]) % 2 === 0,
    source: 'offline',
  }
}

export async function lookupAres(icoRaw: string): Promise<AresResult> {
  const ico = icoRaw.replace(/\s/g, '')
  if (!isValidIco(ico)) {
    throw new Error('IČO musí obsahovat přesně 8 číslic.')
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(`${ARES_BASE}/${ico}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`ARES ${res.status}`)
    const data = (await res.json()) as AresApiResponse
    const dic = data.dic ? (data.dic.startsWith('CZ') ? data.dic : `CZ${data.dic}`) : ''
    return {
      companyName: data.obchodniJmeno ?? offlineLookup(ico).companyName,
      dic,
      address: data.sidlo?.textovaAdresa ?? '',
      city: data.sidlo?.nazevObce ?? '',
      zip: data.sidlo?.psc ? String(data.sidlo.psc) : '',
      vatPayer: Boolean(dic),
      source: 'ares',
    }
  } catch {
    // Network blocked / CORS / offline — fall back to local simulation.
    return offlineLookup(ico)
  }
}
