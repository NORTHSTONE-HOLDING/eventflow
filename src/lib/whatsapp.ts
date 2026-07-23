export function buildStaffWhatsAppMessage(opts: {
  staffName: string
  eventName: string
  shiftStart: string
  tasks: string[]
  checkinUrl?: string
}): string {
  const tasks = opts.tasks.length
    ? opts.tasks.map((t) => `• ${t}`).join('\n')
    : '• Dle instrukcí vedoucího'
  const url = opts.checkinUrl ?? 'http://localhost:5173/staff-checkin'
  return (
    `Ahoj ${opts.staffName.split(' ')[0]}, tvoje směna na akci ${opts.eventName} ` +
    `začíná v ${opts.shiftStart}. Tvoje úkoly na dnes:\n${tasks}\n\n` +
    `Potvrď příjezd zde: ${url}`
  )
}

export function buildClientWhatsAppMessage(opts: {
  clientName: string
  eventName: string
  quoteId: string
  portalUrl?: string
}): string {
  const url = opts.portalUrl ?? `${window.location.origin}/portal`
  return (
    `Dobrý den${opts.clientName ? ` ${opts.clientName}` : ''},\n\n` +
    `zasíláme Vám nabídku ${opts.quoteId} k akci „${opts.eventName}".\n` +
    `Prohlédněte si ji a podepište zde: ${url}\n\n` +
    `S pozdravem,\nEventFlow`
  )
}

export function openWhatsApp(phone: string, message: string) {
  const cleaned = phone.replace(/[^\d+]/g, '')
  const encoded = encodeURIComponent(message)
  const url = `https://wa.me/${cleaned.replace(/^\+/, '')}?text=${encoded}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function buildDebtWhatsAppMessage(notice: string): string {
  return notice
}
