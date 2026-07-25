import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import type { PrintFormat, PrintMenuSection, PrintMenuKind, PrintOperationMode } from '../types'
import { formatPageSize, sectionsToExcelRows } from './printMenuEngine'

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

  const safeName = filename.replace(/[^\w\-ščřžýáíéúůňťďóČŠŘŽÝÁÍÉÚŮŇŤĎÓ]+/gi, '_')
  pdf.save(`${safeName}.pdf`)
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
      .no-print { display: none !important; }
    }
  `
  window.print()
}

/** Structured Excel workbook of menu sections. */
export function exportMenuExcel(
  sections: PrintMenuSection[],
  opts: {
    filename: string
    kind: PrintMenuKind
    mode: PrintOperationMode
    showPrices: boolean
    venueName: string
  },
) {
  const rows = sectionsToExcelRows(sections, {
    showPrices: opts.showPrices,
    kind: opts.kind,
    mode: opts.mode,
  })
  const meta = [
    {
      Pole: 'Provozovna',
      Hodnota: opts.venueName,
    },
    {
      Pole: 'Druh lístku',
      Hodnota: opts.kind === 'beverage' ? 'Nápojový lístek' : 'Jídelní lístek',
    },
    {
      Pole: 'Režim',
      Hodnota: opts.mode === 'event' ? 'Uzavřená akce' : 'Běžný provoz',
    },
    {
      Pole: 'Exportováno',
      Hodnota: new Date().toLocaleString('cs-CZ'),
    },
  ]

  const wb = XLSX.utils.book_new()
  const wsMeta = XLSX.utils.json_to_sheet(meta)
  const wsItems = XLSX.utils.json_to_sheet(
    rows.length
      ? rows
      : [
          {
            Druh: '',
            Režim: '',
            Sekce: '',
            Název: '(prázdný lístek)',
            Popis: '',
            Porce: '',
            'Cena (Kč)': '',
            Alergeny: '',
          },
        ],
  )
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Hlavicka')
  XLSX.utils.book_append_sheet(wb, wsItems, 'Polozky')
  const safeName = opts.filename.replace(/[^\w\-ščřžýáíéúůňťďóČŠŘŽÝÁÍÉÚŮŇŤĎÓ]+/gi, '_')
  XLSX.writeFile(wb, `${safeName}.xlsx`)
}
