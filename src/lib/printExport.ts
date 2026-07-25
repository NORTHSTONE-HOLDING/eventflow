import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { PrintFormat, PrintMenuKind, PrintMenuSection } from '../types'
import { buildAllergenLegend } from './allergens'
import {
  formatAllergenLine,
  formatMenuPrice,
  formatPageSize,
} from './printMenuEngine'

function safeFilename(name: string): string {
  return name.replace(/[^\w\-ščřžýáíéúůňťďóČŠŘŽÝÁÍÉÚŮŇŤĎÓ]+/gi, '_')
}

/** Raster PDF from the live preview node (ink-friendly when print-mode class is active). */
export async function exportMenuPdf(
  element: HTMLElement,
  format: PrintFormat,
  filename: string,
) {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  })
  const img = canvas.toDataURL('image/png')
  const { widthMm, heightMm } = formatPageSize(format)

  const pdf =
    format === 'DL'
      ? new jsPDF({ orientation: 'portrait', unit: 'mm', format: [widthMm, heightMm] })
      : new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: format.toLowerCase() as 'a4' | 'a5',
        })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = format === 'DL' ? 3 : 5
  const imgW = pageW - margin * 2
  const imgH = (canvas.height * imgW) / canvas.width

  let heightLeft = imgH
  let position = margin
  pdf.addImage(img, 'PNG', margin, position, imgW, imgH)
  heightLeft -= pageH - margin * 2

  while (heightLeft > 4) {
    position = margin - (imgH - heightLeft)
    pdf.addPage(
      format === 'DL' ? [widthMm, heightMm] : (format.toLowerCase() as 'a4' | 'a5'),
    )
    pdf.addImage(img, 'PNG', margin, position, imgW, imgH)
    heightLeft -= pageH - margin * 2
  }

  pdf.save(`${safeFilename(filename)}.pdf`)
}

/** Trigger browser print with @page size injection for A4 / A5 / DL. */
export function printMenuNative(format: PrintFormat) {
  const { widthMm, heightMm } = formatPageSize(format)
  const styleId = 'eventflow-print-page-size'
  let style = document.getElementById(styleId) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }
  style.textContent = `
    @media print {
      @page { size: ${widthMm}mm ${heightMm}mm; margin: 8mm; }
      body * { visibility: hidden !important; }
      .print-menu-sheet, .print-menu-sheet * { visibility: visible !important; }
      .print-menu-sheet {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: ${widthMm}mm !important;
        max-width: ${widthMm}mm !important;
        margin: 0 !important;
        box-shadow: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print,
      .print-ops-label,
      .print-menu-meta,
      .print-menu-subtitle { display: none !important; }
    }
  `
  window.print()
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Word (.docx) export via HTML WordProcessingML-compatible document.
 * MIME: application/msword (opens natively in Microsoft Word / LibreOffice).
 */
export function exportMenuWord(
  sections: PrintMenuSection[],
  opts: {
    filename: string
    kind: PrintMenuKind
    showPrices: boolean
    venueName: string
  },
) {
  const title = opts.kind === 'beverage' ? 'Nápojový lístek' : 'Jídelní lístek'
  const allCodes: number[] = []
  for (const section of sections) {
    for (const item of section.items) {
      for (const code of item.allergenCodes) {
        if (!allCodes.includes(code)) allCodes.push(code)
      }
    }
  }
  allCodes.sort((a, b) => a - b)
  const legend = buildAllergenLegend(allCodes)

  const sectionHtml = sections
    .map((section) => {
      const rows = section.items
        .map((item) => {
          const allergen = formatAllergenLine(item.allergenCodes)
          const priceCell = opts.showPrices
            ? `<td style="text-align:right;white-space:nowrap;font-weight:700;color:#D4AF37;">${escapeHtml(formatMenuPrice(item.unitPrice))}</td>`
            : ''
          return `
            <tr>
              <td style="width:70px;color:#666;font-size:10pt;vertical-align:top;">${escapeHtml(item.portionLabel)}</td>
              <td style="vertical-align:top;">
                <div style="font-weight:700;font-size:12pt;">${escapeHtml(item.name)}</div>
                ${
                  item.description
                    ? `<div style="color:#666;font-size:9pt;margin-top:2px;">${escapeHtml(item.description)}</div>`
                    : ''
                }
                ${
                  allergen
                    ? `<div style="font-size:8.5pt;margin-top:2px;font-weight:700;">${escapeHtml(allergen)}</div>`
                    : ''
                }
              </td>
              ${priceCell}
            </tr>`
        })
        .join('')
      return `
        <h2 style="font-family:Georgia,serif;color:#D4AF37;border-bottom:1px solid #D4AF37;padding-bottom:4px;margin:18pt 0 8pt;font-size:14pt;">
          ${escapeHtml(section.label)}
        </h2>
        <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="4">
          ${rows || '<tr><td colspan="3" style="color:#888;">(bez položek)</td></tr>'}
        </table>`
    })
    .join('')

  const legendHtml = legend.length
    ? legend
        .map(
          (a) =>
            `<div style="font-size:9pt;margin:2px 0;"><b style="color:#D4AF37;">${a.code}</b> – ${escapeHtml(a.label)}</div>`,
        )
        .join('')
    : `<div style="font-size:9pt;color:#666;">Na tomto lístku nejsou uvedeny povinné alergeny.</div>`

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="EventFlow Print Menu Engine" />
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <title>${escapeHtml(opts.venueName)} — ${escapeHtml(title)}</title>
  <style>
    @page { margin: 2cm; }
    body {
      font-family: Calibri, 'Segoe UI', Arial, sans-serif;
      color: #1a1a1a;
      background: #fff;
      font-size: 11pt;
      line-height: 1.35;
    }
    .brand {
      text-align: center;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 22pt;
      color: #D4AF37;
      letter-spacing: 0.06em;
      margin: 0 0 6pt;
    }
    .doc-title {
      text-align: center;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 28pt;
      color: #111;
      margin: 8pt 0 18pt;
      letter-spacing: 0.04em;
    }
    .footer-box {
      margin-top: 22pt;
      padding-top: 10pt;
      border-top: 1px solid #D4AF37;
    }
  </style>
</head>
<body>
  <div class="brand">${escapeHtml(opts.venueName)}</div>
  <div class="doc-title">${escapeHtml(title)}</div>
  ${sectionHtml || '<p style="text-align:center;color:#888;">Žádné položky</p>'}
  <div class="footer-box">
    <div style="font-family:Georgia,serif;color:#D4AF37;font-size:12pt;margin-bottom:6pt;">
      Index alergenů (EU 1169/2011)
    </div>
    ${legendHtml}
    <div style="font-size:8.5pt;color:#666;margin-top:8pt;">
      Ceny uvedeny v Kč · Informace o alergenech poskytne obsluha na vyžádání.
    </div>
  </div>
</body>
</html>`

  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(opts.filename)}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** @deprecated use exportMenuWord — kept as alias during transition */
export const exportMenuExcel = exportMenuWord
