import type { InvoiceVisionResult } from '../types'

const SYSTEM_PROMPT =
  'Jseš pokročilý skladový AI auditor pro EventFlow. Analyzuj tuto vyfocenou českou nákupní fakturu nebo dodací list. Extrahuj z ní: Název dodavatele, datum, IČO a kompletní seznam položek. U každé položky urči: Název zboží, množství, jednotku (ks, kg, l), nákupní cenu bez DPH a sazbu DPH (21%, 12%, 0%). Vrať pouze čistá JSON strukturovaná data.'

function mockInvoiceFromFilename(fileName: string): InvoiceVisionResult {
  const lower = fileName.toLowerCase()
  const isBeverage = /pivo|vino|bar|nápoj|napoj|cola/.test(lower)
  const today = new Date().toLocaleDateString('cs-CZ')

  if (isBeverage) {
    return {
      supplier_name: 'Nápoje Velkoobchod s.r.o.',
      date: today,
      ico: '27584321',
      items: [
        {
          name: 'Pivo ležák 12°',
          quantity: 24,
          unit: 'ks',
          purchase_price_ex_vat: 22,
          vat_rate: 21,
          barcode: '8594001100028',
        },
        {
          name: 'Nealko Cola 0.33',
          quantity: 48,
          unit: 'ks',
          purchase_price_ex_vat: 11.5,
          vat_rate: 21,
          barcode: '8594001100066',
        },
        {
          name: 'Prosecco Extra Dry',
          quantity: 12,
          unit: 'ks',
          purchase_price_ex_vat: 179,
          vat_rate: 21,
          barcode: '8594001100011',
        },
      ],
    }
  }

  return {
    supplier_name: 'Gastro Supply Praha a.s.',
    date: today,
    ico: '26123456',
    items: [
      {
        name: 'Losos filet',
        quantity: 3.2,
        unit: 'kg',
        purchase_price_ex_vat: 410,
        vat_rate: 12,
        barcode: '8594001100035',
      },
      {
        name: 'Hovězí svíčková',
        quantity: 5,
        unit: 'kg',
        purchase_price_ex_vat: 375,
        vat_rate: 12,
        barcode: '8594001100042',
      },
      {
        name: 'Olivový olej Extra Virgin',
        quantity: 2,
        unit: 'l',
        purchase_price_ex_vat: 205,
        vat_rate: 12,
        barcode: '8594001100080',
      },
      {
        name: 'Bazalka čerstvá',
        quantity: 10,
        unit: 'ks',
        purchase_price_ex_vat: 18,
        vat_rate: 12,
        barcode: null,
      },
    ],
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst'))
    reader.readAsDataURL(file)
  })
}

function parseVisionJson(raw: string): InvoiceVisionResult {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const parsed = JSON.parse(cleaned) as Partial<InvoiceVisionResult>
  const items = Array.isArray(parsed.items) ? parsed.items : []
  return {
    supplier_name: String(parsed.supplier_name || 'Neznámý dodavatel'),
    date: String(parsed.date || new Date().toLocaleDateString('cs-CZ')),
    ico: String(parsed.ico || '—'),
    items: items.map((it) => ({
      name: String(it.name || '').trim(),
      quantity: Number(it.quantity) || 0,
      unit: String(it.unit || 'ks'),
      purchase_price_ex_vat: Number(it.purchase_price_ex_vat) || 0,
      vat_rate: Number(it.vat_rate) || 12,
      barcode: it.barcode ?? null,
    })).filter((it) => it.name && it.quantity > 0),
  }
}

/** AI Vision capture of Czech delivery notes / invoices. Falls back to simulation. */
export async function analyzeInvoiceImage(file: File): Promise<InvoiceVisionResult> {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()

  if (apiKey) {
    try {
      const dataUrl = await fileToDataUrl(file)
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extrahuj data z této faktury/dodáku. JSON klíče: supplier_name, date, ico, items[{name, quantity, unit, purchase_price_ex_vat, vat_rate, barcode}].',
                },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const content = data?.choices?.[0]?.message?.content
        if (content) return parseVisionJson(content)
      }
    } catch {
      // fall through to simulation
    }
  }

  await new Promise((r) => setTimeout(r, 1400))
  return mockInvoiceFromFilename(file.name || 'faktura.jpg')
}

export { SYSTEM_PROMPT as INVOICE_VISION_SYSTEM_PROMPT }
