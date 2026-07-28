import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Modal } from '../common/Modal'
import { tap } from '../../lib/feedback'
import type { RestaurantTable } from '../../lib/types'

interface TableQrModalProps {
  table: RestaurantTable | null
  onClose: () => void
}

export function TableQrModal({ table, onClose }: TableQrModalProps) {
  const [dataUrl, setDataUrl] = useState('')
  const url = table ? `${window.location.origin}/customer-order/stul-${table.id}` : ''

  useEffect(() => {
    if (!table) {
      setDataUrl('')
      return
    }
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setDataUrl)
      .catch(() => setDataUrl(''))
  }, [table, url])

  const print = () => {
    tap(880)
    const win = window.open('', '_blank', 'width=420,height=620')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>QR ${table?.name}</title>
      <style>
        @page { margin: 12mm; }
        body { font-family: Arial, sans-serif; text-align: center; color: #0f172a; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        p { color: #475569; margin: 2px 0; font-size: 13px; }
        img { width: 300px; height: 300px; margin: 16px auto; display: block; }
        .code { font-family: monospace; font-size: 11px; word-break: break-all; color: #64748b; }
      </style></head><body>
      <h1>${table?.name ?? ''}</h1>
      <p>Naskenujte a objednejte přímo ze stolu</p>
      <img src="${dataUrl}" alt="QR" />
      <p class="code">${url}</p>
      <script>window.onload=function(){window.focus();window.print();}</script>
      </body></html>`)
    win.document.close()
  }

  return (
    <Modal open={!!table} title="🖨️ QR kód pro stůl" onClose={onClose} maxWidth="max-w-sm">
      {table && (
        <div className="text-center">
          <div className="mb-2 font-display text-2xl text-white">{table.name}</div>
          <div className="mx-auto mb-4 flex h-64 w-64 items-center justify-center rounded-xl bg-white p-3">
            {dataUrl ? (
              <img src={dataUrl} alt={`QR ${table.name}`} className="h-full w-full" />
            ) : (
              <span className="text-slate-400">Generuji…</span>
            )}
          </div>
          <p className="mb-4 break-all font-mono text-xs text-slate-500">{url}</p>
          <button type="button" onClick={print} className="btn btn-gold w-full">
            🖨️ Vytisknout QR kód pro stůl
          </button>
        </div>
      )}
    </Modal>
  )
}
