/**
 * EU Regulation 1169/2011 — 14 mandatory allergen groups (Czech localization).
 */

export interface AllergenDef {
  code: number
  label: string
  aliases: string[]
}

export const EU_ALLERGENS: AllergenDef[] = [
  {
    code: 1,
    label: 'Obiloviny obsahující lepek',
    aliases: ['lepek', 'gluten', 'obiloviny', 'psenice', 'pšenice', 'zuceny', 'žito', 'oves', 'jecmen', 'ječmen', '1'],
  },
  {
    code: 2,
    label: 'Korýši',
    aliases: ['korysi', 'korýši', 'krevety', 'krab', '2'],
  },
  {
    code: 3,
    label: 'Vejce',
    aliases: ['vejce', 'vajec', 'egg', '3'],
  },
  {
    code: 4,
    label: 'Ryby',
    aliases: ['ryby', 'ryba', 'losos', 'fish', '4'],
  },
  {
    code: 5,
    label: 'Arašídy',
    aliases: ['arasidy', 'arašídy', 'burske', 'burské', 'peanut', '5'],
  },
  {
    code: 6,
    label: 'Sójové boby',
    aliases: ['soja', 'sója', 'sojove', 'sojové', 'soy', '6'],
  },
  {
    code: 7,
    label: 'Mléko',
    aliases: ['mleko', 'mléko', 'mlecne', 'mléčné', 'smetana', 'syr', 'sýr', 'lactose', '7'],
  },
  {
    code: 8,
    label: 'Skořápkové plody',
    aliases: ['oresky', 'ořechy', 'skorapkove', 'skořápkové', 'mandle', 'liskove', 'lískové', 'vlasske', 'vlašské', '8'],
  },
  {
    code: 9,
    label: 'Celer',
    aliases: ['celer', 'celery', '9'],
  },
  {
    code: 10,
    label: 'Hořčice',
    aliases: ['horcice', 'hořčice', 'mustard', '10'],
  },
  {
    code: 11,
    label: 'Sezamová semena',
    aliases: ['sezam', 'sezamova', 'sesame', '11'],
  },
  {
    code: 12,
    label: 'Oxid siřičitý a siřičitany',
    aliases: ['sulfit', 'siričitany', 'siřičitany', 'oxid', 'so2', '12'],
  },
  {
    code: 13,
    label: 'Vlčí bob (lupina)',
    aliases: ['lupina', 'vlci bob', 'vlčí bob', 'lupin', '13'],
  },
  {
    code: 14,
    label: 'Měkkýši',
    aliases: ['mekkysi', 'měkkýši', 'ustřice', 'ustrice', 'mussel', '14'],
  },
]

function normalizeToken(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Map free-text allergen labels / numbers → unique EU codes 1–14. */
export function resolveAllergenCodes(raw: Array<string | number> | string | null | undefined): number[] {
  if (raw == null) return []
  const parts = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(/[,;/|]+/)
        .map((s) => s.trim())
        .filter(Boolean)

  const codes = new Set<number>()
  for (const part of parts) {
    if (typeof part === 'number' && part >= 1 && part <= 14) {
      codes.add(part)
      continue
    }
    const token = normalizeToken(String(part))
    if (!token) continue
    if (/^\d{1,2}$/.test(token)) {
      const n = Number(token)
      if (n >= 1 && n <= 14) codes.add(n)
      continue
    }
    for (const def of EU_ALLERGENS) {
      if (def.aliases.some((a) => normalizeToken(a) === token || token.includes(normalizeToken(a)))) {
        codes.add(def.code)
        break
      }
    }
  }
  return Array.from(codes).sort((a, b) => a - b)
}

export function formatAllergenCodes(codes: number[]): string {
  if (!codes.length) return ''
  return codes.join(', ')
}

/** Build footer legend only for codes present on the menu. */
export function buildAllergenLegend(codes: number[]): Array<{ code: number; label: string }> {
  const set = new Set(codes)
  return EU_ALLERGENS.filter((a) => set.has(a.code)).map((a) => ({
    code: a.code,
    label: a.label,
  }))
}

export function allergenLegendText(codes: number[]): string {
  return buildAllergenLegend(codes)
    .map((a) => `${a.code} – ${a.label}`)
    .join(' · ')
}

/** Lightweight Czech name heuristics when structured allergens are missing. */
export function inferAllergensFromName(name: string, description = ''): number[] {
  const blob = normalizeToken(`${name} ${description}`)
  const codes = new Set<number>()
  if (/chleb|knedl|testovin|pasta|mouka|palacin|wrap|tortill|piro|housk|baget/.test(blob)) {
    codes.add(1)
  }
  if (/krevet|krab|langust|korys/.test(blob)) codes.add(2)
  if (/vejce|vajick|omelet|majonez|spenatove/.test(blob)) codes.add(3)
  if (/losos|treska|ryba|rybi|tunak|sardink|candat/.test(blob)) codes.add(4)
  if (/arasi|bursk/.test(blob)) codes.add(5)
  if (/soj|tofu|edamam/.test(blob)) codes.add(6)
  if (/syrov|smetana|maslo|mleko|syr |parmaz|hermelin|eidam|tvaroh|zmrztin|fondant|cokolad/.test(blob)) {
    codes.add(7)
  }
  if (/orech|mandl|liskov|vlassk|pistaci|kesu/.test(blob)) codes.add(8)
  if (/celer/.test(blob)) codes.add(9)
  if (/horcic|dijon/.test(blob)) codes.add(10)
  if (/sezam/.test(blob)) codes.add(11)
  if (/vino|prosecco|sekt|pivo|sulfit/.test(blob)) codes.add(12)
  if (/lupina|vlci bob/.test(blob)) codes.add(13)
  if (/ustric|slávk|slamk|chobotnic|kalamar/.test(blob)) codes.add(14)
  return Array.from(codes).sort((a, b) => a - b)
}
