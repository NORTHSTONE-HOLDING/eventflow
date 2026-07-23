import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { PrintFormat } from '../types'

export async function exportMenuPdf(
  element: HTMLElement,
  format: PrintFormat,
  filename: string
) {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: null,
    useCORS: true,
  })
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: format.toLowerCase() as 'a4' | 'a5',
  })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height) * canvas.width
  const imgW = pageW - 10
  const imgH = (canvas.height * imgW) / canvas.width
  pdf.addImage(img, 'PNG', 5, 5, imgW, Math.min(imgH, pageH - 10))
  pdf.save(`${filename}.pdf`)
  void ratio
}
