import type {
  ArchiveDay,
  Camera,
  MenuTheme,
  PricingPlan,
  Product,
  Waiter,
} from './types'

export const MANAGER_PIN = '1234'

export const OPERATING_HOURS = 'Po–Ne 11:00–23:00'

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'lite',
    name: 'Lite',
    price: 490,
    period: 'Kč / měsíc',
    tagline: 'Pro začínající provozy a malé kavárny.',
    highlight: false,
    features: [
      '1 pokladní terminál',
      'Základní mapa stolů',
      'Denní uzávěrka',
      'E-mailová podpora',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: 1490,
    period: 'Kč / měsíc',
    tagline: 'Pro restaurace s kuchyní a barem.',
    highlight: false,
    features: [
      '5 terminálů + mobilní číšník',
      'KDS Kuchyně & Bar',
      'Správa personálu a směn',
      'Audit trail číšníků',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 2890,
    period: 'Kč / měsíc',
    tagline: 'Pro eventové agentury a catering.',
    highlight: true,
    features: [
      'Neomezené terminály',
      'AI Plánovač eventů',
      'Tiskový engine jídelních lístků',
      'Napojení na ARES & DPH matici',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 5990,
    period: 'Kč / měsíc',
    tagline: 'Pro hotelové řetězce a velké provozy.',
    highlight: false,
    features: [
      'AI CCTV bezpečnostní monitor',
      'Vlastní branding & termotisk 80 mm',
      'Neomezené kamery a zóny',
      'Dedikovaný account manager',
    ],
  },
]

export const DEFAULT_WAITERS: Waiter[] = [
  { id: 'w-eva', name: 'Eva Novotná' },
  { id: 'w-jan', name: 'Jan Dvořák' },
  { id: 'w-petra', name: 'Petra Malá' },
  { id: 'w-tomas', name: 'Tomáš Král' },
]

export const CATALOG: Product[] = [
  // JÍDLO — Předkrmy
  { id: 'p-tatarak', name: 'Hovězí tatarák', price: 245, category: 'jidlo', subcategory: 'predkrmy', photo: '🥩', vatRate: 12, station: 'kitchen' },
  { id: 'p-carpaccio', name: 'Carpaccio z lososa', price: 219, category: 'jidlo', subcategory: 'predkrmy', photo: '🐟', vatRate: 12, station: 'kitchen' },
  { id: 'p-brusk', name: 'Bruschetta trio', price: 165, category: 'jidlo', subcategory: 'predkrmy', photo: '🍅', vatRate: 12, station: 'kitchen' },
  { id: 'p-polevka', name: 'Cibulačka v chlebu', price: 129, category: 'jidlo', subcategory: 'predkrmy', photo: '🍞', vatRate: 12, station: 'kitchen' },
  // JÍDLO — Hlavní chody
  { id: 'p-svickova', name: 'Svíčková na smetaně', price: 289, category: 'jidlo', subcategory: 'hlavni-chody', photo: '🍖', vatRate: 12, station: 'kitchen' },
  { id: 'p-ryzek', name: 'Vídeňský řízek', price: 265, category: 'jidlo', subcategory: 'hlavni-chody', photo: '🍗', vatRate: 12, station: 'kitchen' },
  { id: 'p-steak', name: 'Rib-eye steak 300g', price: 549, category: 'jidlo', subcategory: 'hlavni-chody', photo: '🥩', vatRate: 12, station: 'kitchen' },
  { id: 'p-rizoto', name: 'Houbové rizoto', price: 219, category: 'jidlo', subcategory: 'hlavni-chody', photo: '🍚', vatRate: 12, station: 'kitchen' },
  { id: 'p-burger', name: 'EventFlow Burger', price: 245, category: 'jidlo', subcategory: 'hlavni-chody', photo: '🍔', vatRate: 12, station: 'kitchen' },
  // JÍDLO — Dezerty
  { id: 'p-strudl', name: 'Jablečný štrúdl', price: 119, category: 'jidlo', subcategory: 'dezerty', photo: '🥧', vatRate: 12, station: 'kitchen' },
  { id: 'p-cheesecake', name: 'Cheesecake', price: 139, category: 'jidlo', subcategory: 'dezerty', photo: '🍰', vatRate: 12, station: 'kitchen' },
  { id: 'p-creme', name: 'Crème brûlée', price: 149, category: 'jidlo', subcategory: 'dezerty', photo: '🍮', vatRate: 12, station: 'kitchen' },
  // PITÍ — Pivo
  { id: 'd-plzen', name: 'Pilsner Urquell 0,5', price: 69, category: 'piti', subcategory: 'pivo', photo: '🍺', vatRate: 21, station: 'bar' },
  { id: 'd-kozel', name: 'Velkopopovický Kozel 0,5', price: 55, category: 'piti', subcategory: 'pivo', photo: '🍺', vatRate: 21, station: 'bar' },
  { id: 'd-ipa', name: 'EventFlow IPA 0,4', price: 89, category: 'piti', subcategory: 'pivo', photo: '🍺', vatRate: 21, station: 'bar' },
  // PITÍ — Víno
  { id: 'd-ryzlink', name: 'Ryzlink rýnský 0,15', price: 89, category: 'piti', subcategory: 'vino', photo: '🍷', vatRate: 21, station: 'bar' },
  { id: 'd-frankovka', name: 'Frankovka 0,15', price: 95, category: 'piti', subcategory: 'vino', photo: '🍷', vatRate: 21, station: 'bar' },
  { id: 'd-prosecco', name: 'Prosecco 0,1', price: 99, category: 'piti', subcategory: 'vino', photo: '🥂', vatRate: 21, station: 'bar' },
  // PITÍ — Nealko
  { id: 'd-kola', name: 'Coca-Cola 0,33', price: 55, category: 'piti', subcategory: 'nealko', photo: '🥤', vatRate: 21, station: 'bar' },
  { id: 'd-voda', name: 'Mattoni 0,33', price: 45, category: 'piti', subcategory: 'nealko', photo: '💧', vatRate: 21, station: 'bar' },
  { id: 'd-espresso', name: 'Espresso', price: 59, category: 'piti', subcategory: 'nealko', photo: '☕', vatRate: 21, station: 'bar' },
  // PITÍ — Destiláty
  { id: 'd-becher', name: 'Becherovka 0,04', price: 65, category: 'piti', subcategory: 'destilaty', photo: '🥃', vatRate: 21, station: 'bar' },
  { id: 'd-whisky', name: 'Single Malt Whisky 0,04', price: 149, category: 'piti', subcategory: 'destilaty', photo: '🥃', vatRate: 21, station: 'bar' },
  { id: 'd-gin', name: 'Gin & Tonic', price: 129, category: 'piti', subcategory: 'destilaty', photo: '🍸', vatRate: 21, station: 'bar' },
]

export const SUBCATEGORIES: Record<
  'jidlo' | 'piti',
  { id: string; label: string }[]
> = {
  jidlo: [
    { id: 'predkrmy', label: 'Předkrmy' },
    { id: 'hlavni-chody', label: 'Hlavní chody' },
    { id: 'dezerty', label: 'Dezerty' },
  ],
  piti: [
    { id: 'pivo', label: 'Pivo' },
    { id: 'vino', label: 'Víno' },
    { id: 'nealko', label: 'Nealko' },
    { id: 'destilaty', label: 'Destiláty' },
  ],
}

export const MENU_THEMES: { id: MenuTheme; label: string; swatch: string; body: string }[] = [
  { id: 'elegant-gold', label: 'Elegant Gold', swatch: 'from-gold-400 to-gold-700', body: 'bg-[#12100a] text-gold-100 border-gold-600' },
  { id: 'minimalist-nordic', label: 'Minimalist Nordic', swatch: 'from-slate-200 to-slate-400', body: 'bg-white text-slate-800 border-slate-300' },
  { id: 'classic-vintage', label: 'Classic Vintage', swatch: 'from-amber-200 to-amber-700', body: 'bg-[#f5ecd7] text-amber-900 border-amber-700' },
  { id: 'cyberpunk-slate', label: 'Cyberpunk Slate', swatch: 'from-fuchsia-500 to-cyan-400', body: 'bg-slate-950 text-cyan-300 border-fuchsia-500' },
  { id: 'rustic-eco', label: 'Rustic Eco', swatch: 'from-lime-300 to-green-700', body: 'bg-[#f0f3e6] text-green-900 border-green-700' },
  { id: 'grand-hotel', label: 'Grand Hotel', swatch: 'from-rose-300 to-rose-700', body: 'bg-[#1a1013] text-rose-100 border-rose-600' },
]

export const MENU_FORMATS: { id: 'A4' | 'A5' | 'DL'; label: string; ratio: string }[] = [
  { id: 'A4', label: 'A4 (210×297)', ratio: '210 / 297' },
  { id: 'A5', label: 'A5 (148×210)', ratio: '148 / 210' },
  { id: 'DL', label: 'DL Slim (99×210)', ratio: '99 / 210' },
]

export const ALLERGENS: { code: number; name: string }[] = [
  { code: 1, name: 'Obiloviny obsahující lepek' },
  { code: 3, name: 'Vejce' },
  { code: 4, name: 'Ryby' },
  { code: 7, name: 'Mléko a mléčné výrobky' },
  { code: 8, name: 'Skořápkové plody' },
  { code: 9, name: 'Celer' },
  { code: 10, name: 'Hořčice' },
  { code: 12, name: 'Oxid siřičitý a siřičitany' },
]

export const DEFAULT_CAMERAS: Camera[] = Array.from({ length: 10 }, (_, i) => {
  const zones = [
    'Hlavní vchod',
    'Bar',
    'Kuchyně',
    'Salonek',
    'Zahrádka',
    'Sklad',
    'Pokladna',
    'Chodba WC',
    'Parkoviště',
    'Zázemí personálu',
  ]
  return {
    id: `cam-${i + 1}`,
    index: i + 1,
    name: `Kamera ${String(i + 1).padStart(2, '0')}`,
    zone: zones[i],
    ip: `192.168.1.${20 + i}`,
    alert: false,
  }
})

export const CCTV_ARCHIVE: ArchiveDay[] = Array.from({ length: 60 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  return {
    date,
    clips: 40 + ((i * 7) % 60),
    sizeGb: Number((6 + ((i * 3) % 18) + 0.4).toFixed(1)),
  }
})
