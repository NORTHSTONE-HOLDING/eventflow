import type { CateringItem } from '../types'
import { uid } from './documentIds'
import { normalizeCateringForPos } from './inventoryEngine'

function item(
  partial: Omit<
    CateringItem,
    'sellPrice' | 'vatRate' | 'plannedPortions' | 'soldPortions' | 'ingredients' | 'subcategory'
  > &
    Partial<
      Pick<
        CateringItem,
        'sellPrice' | 'vatRate' | 'plannedPortions' | 'soldPortions' | 'ingredients' | 'subcategory'
      >
    >
): CateringItem {
  const planned = partial.plannedPortions || partial.portion || 1
  return normalizeCateringForPos([
    {
      ...partial,
      subcategory: partial.subcategory || 'ostatni',
      sellPrice: partial.sellPrice ?? 0,
      vatRate: partial.vatRate ?? (partial.category === 'beverage' ? 21 : 12),
      plannedPortions: planned,
      soldPortions: 0,
      ingredients: partial.ingredients ?? [],
    },
  ])[0]
}

/** Client-side AI Vision simulation — extracts menu items from image metadata / filename heuristics + OCR-like mock */
export async function scanMenuFromImage(file: File): Promise<CateringItem[]> {
  await new Promise((r) => setTimeout(r, 1800))

  const name = file.name.toLowerCase()
  const isDistributor =
    name.includes('ceník') ||
    name.includes('cenik') ||
    name.includes('distributor') ||
    name.includes('list')

  if (isDistributor) {
    return [
      item({
        id: uid('scan'),
        name: 'Pivo Pilsner Urquell 0.5l',
        recipe: 'Lahvové / sudové dle dostupnosti',
        foodCost: 42,
        portion: 24,
        allergens: [],
        inventory: ['Pivo 24 ks'],
        category: 'beverage',
        subcategory: 'pivo',
        sellPrice: 65,
        ingredients: [{ name: 'Pivo', qtyPerPortion: 1, unit: 'ks' }],
      }),
      item({
        id: uid('scan'),
        name: 'Víno Ryzlink rýnský 0.75l',
        recipe: 'Moravské bílé víno',
        foodCost: 185,
        portion: 6,
        allergens: ['sulfit'],
        inventory: ['Víno 6 ks'],
        category: 'beverage',
        sellPrice: 280,
        ingredients: [{ name: 'Víno', qtyPerPortion: 1, unit: 'ks' }],
      }),
      item({
        id: uid('scan'),
        name: 'Minerálka Mattoni 0.33l',
        recipe: 'Perlivá / neperlivá',
        foodCost: 18,
        portion: 24,
        allergens: [],
        inventory: ['Minerálka 24 ks'],
        category: 'beverage',
        sellPrice: 35,
        ingredients: [{ name: 'Minerálka', qtyPerPortion: 1, unit: 'ks' }],
      }),
      item({
        id: uid('scan'),
        name: 'Syrový talíř — mix',
        recipe: 'Eidam, Hermelín, uzený sýr, hrozny',
        foodCost: 320,
        portion: 8,
        allergens: ['mléko'],
        inventory: ['Sýry 1.2 kg', 'Hrozny 0.5 kg'],
        category: 'food',
        sellPrice: 190,
        ingredients: [
          { name: 'Sýry', qtyPerPortion: 1.2 / 8, unit: 'kg' },
          { name: 'Hrozny', qtyPerPortion: 0.5 / 8, unit: 'kg' },
        ],
      }),
    ]
  }

  return [
    item({
      id: uid('scan'),
      name: 'Polévka — krém z dýně',
      recipe: 'Dýně Hokkaido, smetana, dýňový olej, semínka',
      foodCost: 45,
      portion: 50,
      allergens: ['mléko'],
      inventory: ['Dýně 8 kg', 'Smetana 2 l'],
      category: 'food',
      sellPrice: 89,
      ingredients: [
        { name: 'Dýně', qtyPerPortion: 8 / 50, unit: 'kg' },
        { name: 'Smetana', qtyPerPortion: 2 / 50, unit: 'l' },
      ],
    }),
    item({
      id: uid('scan'),
      name: 'Hlavní — pečený losos',
      recipe: 'Losos, citronové máslo, baby brambory, chřest',
      foodCost: 210,
      portion: 40,
      allergens: ['ryby', 'mléko'],
      inventory: ['Losos 8 kg', 'Chřest 4 kg', 'Brambory 10 kg'],
      category: 'food',
      sellPrice: 340,
      ingredients: [
        { name: 'Losos', qtyPerPortion: 8 / 40, unit: 'kg' },
        { name: 'Chřest', qtyPerPortion: 4 / 40, unit: 'kg' },
        { name: 'Brambory', qtyPerPortion: 10 / 40, unit: 'kg' },
      ],
    }),
    item({
      id: uid('scan'),
      name: 'Veget — risotto s hříbky',
      recipe: 'Arborio, hříbky, parmezán, bílé víno',
      foodCost: 95,
      portion: 30,
      allergens: ['mléko', 'sulfit'],
      inventory: ['Rýže Arborio 3 kg', 'Hříbky 2 kg', 'Parmezán 0.8 kg'],
      category: 'food',
      sellPrice: 220,
    }),
    item({
      id: uid('scan'),
      name: 'Dezert — čokoládový fondant',
      recipe: 'Hořká čokoláda 70 %, vanilková zmrzlina',
      foodCost: 55,
      portion: 40,
      allergens: ['mléko', 'vejce', 'lepek'],
      inventory: ['Čokoláda 2 kg', 'Zmrzlina 4 l'],
      category: 'food',
      sellPrice: 95,
    }),
    item({
      id: uid('scan'),
      name: 'Nápoj — home-made limonáda',
      recipe: 'Citron, máta, cukr, soda, led',
      foodCost: 22,
      portion: 60,
      allergens: [],
      inventory: ['Citrony 5 kg', 'Máta 4 svazky', 'Soda 20 l', 'Led 10 kg'],
      category: 'beverage',
      sellPrice: 55,
      ingredients: [
        { name: 'Citrony', qtyPerPortion: 5 / 60, unit: 'kg' },
        { name: 'Máta', qtyPerPortion: 4 / 60, unit: 'ks' },
        { name: 'Soda', qtyPerPortion: 20 / 60, unit: 'l' },
        { name: 'Led', qtyPerPortion: 10 / 60, unit: 'kg' },
      ],
    }),
  ]
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
