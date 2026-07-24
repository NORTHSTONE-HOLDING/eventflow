/**
 * EventFlow — Hybrid product image provisioning
 * - AI / web-search style image resolution (OpenAI + curated fallbacks)
 * - Manual camera / file upload → data URL + Supabase `product-images` bucket
 *
 * Storage path: product-images/{user_id}/{product_id}.jpg
 */

import { getSupabase, isSupabaseConfigured } from './supabase'
import { normalizeName } from './inventoryModels'
import { DEFAULT_USER_ID } from './inventoryModels'

export const PRODUCT_IMAGES_BUCKET = 'product-images'

export function productImageObjectPath(userId: string, productId: string): string {
  const uid = (userId || DEFAULT_USER_ID).replace(/[^a-zA-Z0-9_-]/g, '_')
  const pid = (productId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${uid}/${pid}.jpg`
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Curated Unsplash photo IDs by gastro category (clean product/food framing) */
const CATEGORY_PHOTO_IDS: Record<string, string[]> = {
  beverage: [
    '1566632506275-bf59a987dc8b', // beer glass
    '1514362545857-3bc16c4c76dd', // cocktail
    '1547595628-c61a29f50f17', // wine
    '1551024709-8f23befc6f87', // cocktail color
    '1436076867666-f2727e4d0c0b', // beer pour
  ],
  food: [
    '1546069901-ba9599a7e63c', // plated food
    '1504674900247-0877df9cc836', // steak-ish
    '1565299624946-b28f40a0ae38', // pizza
    '1476224203421-9ac39bcb3327', // brunch
    '1414235077428-338989a2e8c0', // fine dining
  ],
  other: [
    '1556910103-1c02745aae4d', // kitchen
    '1556911220-bff31c8120fe', // cooking
  ],
}

function categoryKey(category: string): 'beverage' | 'food' | 'other' {
  const c = normalizeName(category)
  if (
    c.includes('beverage') ||
    c.includes('piti') ||
    c.includes('pití') ||
    c.includes('bar') ||
    c.includes('drink') ||
    c.includes('napoj')
  ) {
    return 'beverage'
  }
  if (c.includes('food') || c.includes('raw') || c.includes('jidlo') || c.includes('jídlo')) {
    return 'food'
  }
  return 'other'
}

function searchKeywords(productName: string, category: string): string {
  const base = productName
    .replace(/\d+[.,]?\d*\s*(l|ml|g|kg|ks)\b/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
  const cat = categoryKey(category)
  const hint = cat === 'beverage' ? 'drink product' : cat === 'food' ? 'food dish' : 'product'
  return `${base} ${hint}`.trim()
}

function curatedFallbackUrl(productName: string, category: string): string {
  const cat = categoryKey(category)
  const ids = CATEGORY_PHOTO_IDS[cat] || CATEGORY_PHOTO_IDS.other
  const id = ids[hashCode(productName) % ids.length]
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&h=600&q=80`
}

function loremFlickrUrl(productName: string, category: string): string {
  const cat = categoryKey(category)
  const tags =
    cat === 'beverage'
      ? 'beer,cocktail,drink'
      : cat === 'food'
        ? 'food,restaurant,meal'
        : 'kitchen,product'
  const lock = hashCode(productName) % 9999
  return `https://loremflickr.com/600/600/${tags}/all?lock=${lock}`
}

async function openaiSuggestImageUrl(
  productName: string,
  category: string,
): Promise<string | null> {
  const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Navrhni veřejnou HTTPS URL kvalitní produktové fotografie (Unsplash/Pexels/CDN) pro gastro položku. Vrať JSON { "image_url": "https://..." }. Preferuj čisté pozadí / produktový záběr. Pokud nevíš, vrať null.',
          },
          {
            role: 'user',
            content: `Produkt: ${productName}\nKategorie: ${category}\nDotaz: ${searchKeywords(productName, category)}`,
          },
        ],
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = json.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { image_url?: string | null }
    const url = parsed.image_url?.trim()
    if (url && /^https:\/\//i.test(url)) return url
    return null
  } catch {
    return null
  }
}

/**
 * Resolve a product image URL via AI suggestion + web-search style fallbacks.
 */
export async function fetchProductImageUrl(
  productName: string,
  category = 'other',
): Promise<string | null> {
  const name = String(productName || '').trim()
  if (!name) return null

  const ai = await openaiSuggestImageUrl(name, category)
  if (ai) return ai

  // Prefer Unsplash curated (stable CDN); LoremFlickr as secondary variety
  const primary = curatedFallbackUrl(name, category)
  try {
    const probe = await fetch(primary, { method: 'HEAD', mode: 'no-cors' })
    void probe
    return primary
  } catch {
    return loremFlickrUrl(name, category)
  }
}

/** Read local file / camera blob as data URL (offline-safe cache). */
export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string' && result.startsWith('data:image')) {
        resolve(result)
      } else {
        reject(new Error('Soubor není platný obrázek'))
      }
    }
    reader.onerror = () => reject(new Error('Čtení souboru selhalo'))
    reader.readAsDataURL(file)
  })
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, data] = dataUrl.split(',')
    const mime = /data:(.*?);base64/.exec(header)?.[1] || 'image/jpeg'
    const binary = atob(data)
    const arr = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
    return new Blob([arr], { type: mime })
  } catch {
    return null
  }
}

/**
 * Upload to Supabase Storage bucket `product-images`.
 * Returns public/signed URL, or the original data URL if offline.
 */
export async function uploadProductImage(opts: {
  userId: string
  productId: string
  dataUrl: string
}): Promise<{ ok: boolean; url: string; storagePath: string | null; error?: string }> {
  const storagePath = productImageObjectPath(opts.userId, opts.productId)
  const fullPath = `${PRODUCT_IMAGES_BUCKET}/${storagePath}`

  if (!isSupabaseConfigured) {
    return { ok: true, url: opts.dataUrl, storagePath: fullPath }
  }

  const sb = getSupabase()
  if (!sb) {
    return { ok: true, url: opts.dataUrl, storagePath: fullPath }
  }

  const blob = dataUrlToBlob(opts.dataUrl)
  if (!blob) {
    return { ok: false, url: opts.dataUrl, storagePath: null, error: 'Neplatná data obrázku' }
  }

  const { error } = await sb.storage.from(PRODUCT_IMAGES_BUCKET).upload(storagePath, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  })

  if (error) {
    // Keep local data URL so POS still shows the photo
    return {
      ok: true,
      url: opts.dataUrl,
      storagePath: fullPath,
      error: error.message,
    }
  }

  const { data } = sb.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath)
  return {
    ok: true,
    url: data?.publicUrl || opts.dataUrl,
    storagePath: fullPath,
  }
}
