/**
 * Printable QR code sheet for guest self-order tables.
 */

import { QRCodeSVG } from 'qrcode.react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { openPrintCapableWindow, writeAndPrintHtml } from './safePrintWindow'

export function customerOrderPath(tableId: string): string {
  const id = encodeURIComponent(String(tableId || '').trim())
  return `/customer-order/stul-${id}`
}

export function customerOrderUrl(tableId: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  // Spec mock shape on local Vite
  if (/localhost|127\.0\.0\.1/.test(origin)) {
    return `http://localhost:5173${customerOrderPath(tableId)}`
  }
  return `${origin}${customerOrderPath(tableId)}`
}

/** Resolve table id from route param `stul-<id>` (URL-encoded). */
export function parseCustomerOrderTableParam(param: string): string {
  const raw = String(param || '').trim()
  if (!raw) return ''
  const body = raw.startsWith('stul-') ? raw.slice('stul-'.length) : raw
  try {
    return decodeURIComponent(body)
  } catch {
    return body
  }
}

/** Open printable QR sheet for a table (A5-friendly). */
export function printTableQrCode(opts: {
  tableId: string
  tableLabel: string
  seatCapacity?: number
  venueName?: string
}): boolean {
  const tableId = String(opts.tableId || '').trim()
  if (!tableId) return false

  const url = customerOrderUrl(tableId)
  const win = openPrintCapableWindow({ width: 480, height: 720 })
  if (!win) {
    console.warn('QR tiskové okno bylo zablokováno prohlížečem')
    return false
  }

  const safeLabel = String(opts.tableLabel || 'Stůl').replace(/[<>&]/g, '')
  const safeVenue = String(opts.venueName || 'EventFlow').replace(/[<>&]/g, '')
  const safeUrl = url.replace(/[<>&]/g, '')
  const capacity = Math.max(1, Math.min(16, Number(opts.seatCapacity) || 4))

  writeAndPrintHtml(
    win,
    `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8"/>
<title>QR · ${safeLabel}</title>
<style>
  @page { size: A5; margin: 12mm; }
  body {
    margin: 0; background: #fff; color: #0b0f14;
    font-family: Georgia, "Times New Roman", serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh;
  }
  .sheet {
    width: min(420px, 100%);
    text-align: center;
    border: 2px solid #D4AF37;
    padding: 28px 24px;
    border-radius: 8px;
  }
  .brand { color: #D4AF37; letter-spacing: 0.14em; font-size: 12px; text-transform: uppercase; font-weight: 700; }
  h1 { margin: 10px 0 4px; font-size: 28px; }
  .cap { color: #475569; font-size: 14px; margin-bottom: 18px; }
  .qr { display: flex; justify-content: center; margin: 12px 0 16px; min-height: 220px; }
  .url { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; color: #334155; }
  .hint { margin-top: 14px; font-size: 13px; color: #0b0f14; }
  @media print {
    body { background: #fff; }
    .sheet { border-color: #000; }
    .brand { color: #000; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="brand">${safeVenue}</div>
    <h1>${safeLabel}</h1>
    <div class="cap">Kapacita: ${capacity} osob · Objednejte si sami</div>
    <div class="qr" id="qr-root"></div>
    <div class="url">${safeUrl}</div>
    <div class="hint">Naskenujte QR kód mobilním telefonem<br/>a zaplaťte přes Apple Pay / Kartou.</div>
  </div>
</body>
</html>`,
    0,
    { autoPrint: false },
  )

  // Mount QR after DOM is ready; print after SVG paint
  window.setTimeout(() => {
    try {
      const mount = win.document.getElementById('qr-root')
      if (mount) {
        const root = createRoot(mount)
        root.render(
          createElement(QRCodeSVG, {
            value: url,
            size: 220,
            bgColor: '#ffffff',
            fgColor: '#0b0f14',
            level: 'M',
            includeMargin: true,
          }),
        )
      }
    } catch {
      const mount = win.document.getElementById('qr-root')
      if (mount) {
        mount.textContent = safeUrl
      }
    }
    window.setTimeout(() => {
      try {
        win.focus()
        win.print()
      } catch {
        // ignore
      }
    }, 420)
  }, 80)

  return true
}
