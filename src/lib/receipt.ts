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
      <div class="bold">Rekapitulace DPH</div>
      <table class="vat">
        <tr><th>Sazba</th><th>Základ</th><th>Daň</th><th>Celkem</th></tr>
        <tr><td>21 %</td><td>${formatCZK(bar.base)}</td><td>${formatCZK(bar.vat)}</td><td>${formatCZK(bar.base + bar.vat)}</td></tr>
        <tr><td>12 %</td><td>${formatCZK(kitchen.base)}</td><td>${formatCZK(kitchen.vat)}</td><td>${formatCZK(kitchen.base + kitchen.vat)}</td></tr>
        <tr class="sum"><td>Σ</td><td>${formatCZK(kitchen.base + bar.base)}</td><td>${formatCZK(kitchen.vat + bar.vat)}</td><td>${formatCZK(totals.total)}</td></tr>
      </table>`
    : `<div class="center small">Neplátce DPH — daň z přidané hodnoty se neuplatňuje dle §6 ZDPH.</div>`

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
    <div class="small">Spotřebitelská doložka: Reklamace se řídí zákonem č. 634/1992 Sb.,
    o ochraně spotřebitele. Případné spory lze řešit mimosoudně u ČOI (coi.cz).
    Tento doklad slouží jako podklad k evidenci tržeb.</div>
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
    table.vat { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
    table.vat th, table.vat td { border: 1px solid #000; padding: 2px 3px; text-align: right; }
    table.vat th:first-child, table.vat td:first-child { text-align: left; }
    table.vat tr.sum { font-weight: bold; }
  </style></head><body>${innerHtml}
  <script>window.onload=function(){window.focus();window.print();}</script>
  </body></html>`)
  win.document.close()
}
