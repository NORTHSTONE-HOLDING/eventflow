import type { CateringItem } from '../types'
import { uid } from './documentIds'

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
      {
        id: uid('scan'),
        name: 'Pivo Pilsner Urquell 0.5l',
        recipe: 'Lahvové / sudové dle dostupnosti',
        foodCost: 42,
        portion: 1,
        allergens: [],
        inventory: ['Karton 20 ks'],
        category: 'beverage',
      },
      {
        id: uid('scan'),
        name: 'Víno Ryzlink rýnský 0.75l',
        recipe: 'Moravské bílé víno',
        foodCost: 185,
        portion: 1,
        allergens: ['sulfit'],
        inventory: ['Karton 6 lahví'],
        category: 'beverage',
      },
      {
        id: uid('scan'),
        name: 'Minerálka Mattoni 0.33l',
        recipe: 'Perlivá / neperlivá',
        foodCost: 18,
        portion: 1,
        allergens: [],
        inventory: ['Balení 24 ks'],
        category: 'beverage',
      },
      {
        id: uid('scan'),
        name: 'Syrový talíř — mix',
        recipe: 'Eidam, Hermelín, uzený sýr, hrozny',
        foodCost: 320,
        portion: 8,
        allergens: ['mléko'],
        inventory: ['Sýry 1.2 kg', 'Hrozny 0.5 kg'],
        category: 'food',
      },
    ]
  }

  // Handwritten note / menu photo simulation
  return [
    {
      id: uid('scan'),
      name: 'Polévka — krém z dýně',
      recipe: 'Dýně Hokkaido, smetana, dýňový olej, semínka',
      foodCost: 45,
      portion: 1,
      allergens: ['mléko'],
      inventory: ['Dýně 8 kg', 'Smetana 2 l'],
      category: 'food',
    },
    {
      id: uid('scan'),
      name: 'Hlavní — pečený losos',
      recipe: 'Losos, citronové máslo, baby brambory, chřest',
      foodCost: 210,
      portion: 1,
      allergens: ['ryby', 'mléko'],
      inventory: ['Losos filet dle počtu', 'Chřest 4 kg', 'Brambory 10 kg'],
      category: 'food',
    },
    {
      id: uid('scan'),
      name: 'Veget — risotto s hříbky',
      recipe: 'Arborio, hříbky, parmezán, bílé víno',
      foodCost: 95,
      portion: 1,
      allergens: ['mléko', 'sulfit'],
      inventory: ['Rýže Arborio 3 kg', 'Hříbky 2 kg', 'Parmezán 0.8 kg'],
      category: 'food',
    },
    {
      id: uid('scan'),
      name: 'Dezert — čokoládový fondant',
      recipe: 'Hořká čokoláda 70 %, vanilková zmrzlina',
      foodCost: 55,
      portion: 1,
      allergens: ['mléko', 'vejce', 'lepek'],
      inventory: ['Čokoláda 2 kg', 'Zmrzlina 4 l'],
      category: 'food',
    },
    {
      id: uid('scan'),
      name: 'Nápoj — home-made limonáda',
      recipe: 'Citron, máta, cukr, soda',
      foodCost: 22,
      portion: 1,
      allergens: [],
      inventory: ['Citrony 5 kg', 'Máta 4 svazky', 'Soda 20 l'],
      category: 'beverage',
    },
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
