import type { CompanyProfile } from './types'
import type { ShiftReceipt } from '../store/useShiftStore'
import { OPERATING_HOURS } from './constants'
import { formatCZK, formatDateCZ, vatBase } from './format'

// Builds an 80mm thermal receipt (HTML) for the shift closure and prints it.
export function buildShiftReceiptHtml(receipt: ShiftReceipt, company: CompanyProfile): string {
  const { totals } = receipt
  const kitchen = vatBase(totals.kitchen, 12)
  const bar = vatBase(totals.bar, 21)

  const vatMatrix = company.vatPayer
    ? `
      <div class="line"><span>Sazba 12% základ</span><span>${formatCZK(kitchen.base)}</span></div>
      <div class="line"><span>Sazba 12% DPH</span><span>${formatCZK(kitchen.vat)}</span></div>
      <div class="line"><span>Sazba 21% základ</span><span>${formatCZK(bar.base)}</span></div>
      <div class="line"><span>Sazba 21% DPH</span><span>${formatCZK(bar.vat)}</span></div>
      <div class="line total"><span>DPH celkem</span><span>${formatCZK(kitchen.vat + bar.vat)}</span></div>`
    : `<div class="center small">Neplátce DPH — daň z přidané hodnoty se neuplatňuje.</div>`

  const cashOuts = receipt.cashOuts.length
    ? receipt.cashOuts
        .map((c) => `<div class="line"><span>${c.label}</span><span>- ${formatCZK(c.amount)}</span></div>`)
        .join('')
    : '<div class="small center">Bez hotovostních výdejů</div>'

  return `
  <div class="receipt">
    <div class="center">
      <div class="logo">◆ EVENTFLOW ◆</div>
      <div class="bold">${company.companyName || 'EventFlow Venue'}</div>
      <div class="small">${company.address || ''} ${company.city || ''}</div>
      <div class="small">IČO: ${company.ico || '—'}${company.dic ? ` · DIČ: ${company.dic}` : ''}</div>
      <div class="small">${company.vatPayer ? 'Plátce DPH' : 'Neplátce DPH'}</div>
      <div class="small">Provozní doba: ${OPERATING_HOURS}</div>
    </div>
    <div class="hr"></div>
    <div class="center bold">UZÁVĚRKA SMĚNY</div>
    <div class="line"><span>Doklad</span><span>${receipt.docNumber}</span></div>
    <div class="line"><span>Datum</span><span>${formatDateCZ(receipt.closedAt)}</span></div>
    <div class="line"><span>Účtenek</span><span>${receipt.saleCount}</span></div>
    <div class="hr"></div>
    <div class="line"><span>Tržba Kuchyně</span><span>${formatCZK(totals.kitchen)}</span></div>
    <div class="line"><span>Tržba Bar</span><span>${formatCZK(totals.bar)}</span></div>
    <div class="line"><span>Tržba Hotovost</span><span>${formatCZK(totals.cash)}</span></div>
    <div class="line"><span>Tržba Terminál</span><span>${formatCZK(totals.card)}</span></div>
    <div class="line total"><span>TRŽBA CELKEM</span><span>${formatCZK(totals.total)}</span></div>
    <div class="hr"></div>
    ${vatMatrix}
    <div class="hr"></div>
    <div class="bold">Hotovostní výdej</div>
    ${cashOuts}
    <div class="line total"><span>K ODVODU (hotovost)</span><span>${formatCZK(receipt.finalCash)}</span></div>
    <div class="hr"></div>
    <div class="center small">Děkujeme a těšíme se na další směnu.</div>
    <div class="center small">${formatDateCZ(receipt.closedAt)} · ${receipt.docNumber}</div>
  </div>`
}

export function printThermalReceipt(innerHtml: string): void {
  const win = window.open('', '_blank', 'width=380,height=700')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Uzávěrka</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; background: #fff; }
    .receipt { width: 80mm; padding: 6mm 5mm; box-sizing: border-box; font-family: "Courier New", monospace; font-size: 12px; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .small { font-size: 10px; }
    .logo { font-size: 16px; font-weight: bold; letter-spacing: 2px; margin-bottom: 4px; }
    .line { display: flex; justify-content: space-between; margin: 2px 0; }
    .total { font-weight: bold; border-top: 1px dashed #000; padding-top: 3px; margin-top: 3px; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
  </style></head><body>${innerHtml}
  <script>window.onload=function(){window.focus();window.print();}</script>
  </body></html>`)
  win.document.close()
}
