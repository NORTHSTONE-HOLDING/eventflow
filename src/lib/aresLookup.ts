/**
 * Czech ARES — ekonomické subjekty lookup by IČO.
 * https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}
 */

export interface AresCompanyResult {
  ico: string
  dic: string
  companyName: string
  street: string
  city: string
  zip: string
  source: 'ares' | 'simulated'
}

function digitsOnly(raw: string): string {
  return String(raw || '').replace(/\D/g, '')
}

function mapAresPayload(json: Record<string, unknown>, ico: string): AresCompanyResult {
  const sidlo = (json.sidlo || json.adresaDorucovaci || {}) as Record<string, unknown>
  const streetParts = [
    sidlo.nazevUlice || sidlo.ulice,
    sidlo.cisloDomovni || sidlo.cisloOrientacni,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  const street =
    streetParts.join(' ') ||
    String(sidlo.textovaAdresa || '').split(',')[0]?.trim() ||
    ''
  const city = String(sidlo.nazevObce || sidlo.obec || '').trim()
  const zip = digitsOnly(String(sidlo.psc || sidlo.PSC || ''))
  return {
    ico,
    dic: String(json.dic || '').trim(),
    companyName: String(json.obchodniJmeno || json.nazev || '').trim(),
    street,
    city,
    zip: zip.length === 5 ? `${zip.slice(0, 3)} ${zip.slice(3)}` : zip,
    source: 'ares',
  }
}

function mockAres(ico: string): AresCompanyResult {
  return {
    ico,
    dic: `CZ${ico}`,
    companyName: 'Demo Gastro & Events s.r.o.',
    street: 'Václavské náměstí 1',
    city: 'Praha',
    zip: '110 00',
    source: 'simulated',
  }
}

/**
 * Fetch company data from ARES. Falls back to Czech simulation when offline / blocked.
 */
export async function fetchAresByIco(rawIco: string): Promise<AresCompanyResult> {
  const ico = digitsOnly(rawIco)
  if (ico.length !== 8) {
    throw new Error('IČO musí mít přesně 8 číslic')
  }

  try {
    const url = `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>
      const mapped = mapAresPayload(json, ico)
      if (mapped.companyName) return mapped
    }
  } catch {
    // fall through
  }

  await new Promise((r) => setTimeout(r, 700))
  return mockAres(ico)
}
