import { useMemo, useState } from 'react'
import {
  Bluetooth,
  Cable,
  CheckCircle2,
  ChefHat,
  Cctv,
  CreditCard,
  Monitor,
  Printer,
  RefreshCw,
  Settings2,
  Trash2,
  Wine,
  X,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaymentTerminalStore } from '../store/usePaymentTerminalStore'
import {
  pairBluetoothPrinter,
  pairNetworkPrinter,
  renamePosPrinter,
  roleLabel,
  stationLabel,
} from '../lib/printerHardware'
import {
  runTerminalHandshake,
  type TerminalProvider,
} from '../lib/terminalHandshake'
import { openPosDisplayWindow } from '../lib/kdsSync'
import { formatCurrency } from '../lib/documentIds'
import { formatCzechDateTime } from '../lib/czechDate'
import { tapFeedback } from '../lib/touchFeedback'
import type { PosPrinter, PrinterRole } from '../types'

const PRINTER_ROLES: PrinterRole[] = ['bar', 'kitchen', 'receipt']

type DisplayPath =
  | '/pos/customer'
  | '/kds-kitchen'
  | '/kds-bar'
  | '/pos/kds/kitchen'
  | '/pos/kds/bar'

const MONITORS: Array<{
  id: string
  title: string
  subtitle: string
  path: DisplayPath | null
  screenIndex: number
  icon: typeof ChefHat
  view?: 'cctv'
}> = [
  {
    id: 'kds-kitchen',
    title: 'Kitchen KDS',
    subtitle: 'Externí obrazovka kuchyně — boničky v reálném čase',
    path: '/kds-kitchen',
    screenIndex: 1,
    icon: ChefHat,
  },
  {
    id: 'kds-bar',
    title: 'Bar KDS',
    subtitle: 'Externí obrazovka baru — nápojové tikety',
    path: '/kds-bar',
    screenIndex: 2,
    icon: Wine,
  },
  {
    id: 'customer',
    title: 'Customer-Facing Display',
    subtitle: 'Displej pro hosta — košík a celková částka',
    path: '/pos/customer',
    screenIndex: 3,
    icon: Monitor,
  },
  {
    id: 'cctv',
    title: 'CCTV Office Wall',
    subtitle: 'Stěnová obrazovka kamerového dohledu (admin)',
    path: null,
    screenIndex: 0,
    icon: Cctv,
    view: 'cctv',
  },
]

/**
 * Owner/Manager — Hardware & POS Control Center.
 * Printers, payment terminals and multi-monitor launches live only here
 * (never on /pos-terminal staff route).
 */
export function HardwarePosCentrum({ embedded = false }: { embedded?: boolean }) {
  const printers = useAppStore((s) => s.printers)
  const upsertPrinter = useAppStore((s) => s.upsertPrinter)
  const removePrinter = useAppStore((s) => s.removePrinter)
  const setToast = useAppStore((s) => s.setToast)
  const setView = useAppStore((s) => s.setView)

  const provider = usePaymentTerminalStore((s) => s.provider)
  const apiKeyMasked = usePaymentTerminalStore((s) => s.apiKeyMasked)
  const connected = usePaymentTerminalStore((s) => s.connected)
  const logs = usePaymentTerminalStore((s) => s.logs)
  const setProvider = usePaymentTerminalStore((s) => s.setProvider)
  const setApiKey = usePaymentTerminalStore((s) => s.setApiKey)
  const pushLog = usePaymentTerminalStore((s) => s.pushLog)
  const clearLogs = usePaymentTerminalStore((s) => s.clearLogs)

  const [pairingRole, setPairingRole] = useState<PrinterRole | null>(null)
  const [lanDraft, setLanDraft] = useState<Record<PrinterRole, string>>({
    bar: '',
    kitchen: '',
    receipt: '',
  })
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({})
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [testAmount, setTestAmount] = useState('150')
  const [handshakeBusy, setHandshakeBusy] = useState(false)
  const [handshakeStatus, setHandshakeStatus] = useState<string | null>(null)

  const safePrinters = useMemo(
    () => (Array.isArray(printers) ? printers : []),
    [printers],
  )

  const printerFor = (role: PrinterRole) =>
    safePrinters.find((p) => p.role === role) || null

  const onPairBluetooth = async (role: PrinterRole) => {
    tapFeedback()
    setPairingRole(role)
    try {
      const printer = await pairBluetoothPrinter(role)
      upsertPrinter(printer)
      tapFeedback('success')
      setToast(`Bluetooth spárováno: ${printer.name} (${stationLabel(role)})`)
    } catch (e) {
      tapFeedback('alert')
      setToast(e instanceof Error ? e.message : 'Párování Bluetooth selhalo')
    } finally {
      setPairingRole(null)
    }
  }

  const onPairLan = async (role: PrinterRole) => {
    tapFeedback()
    setPairingRole(role)
    try {
      const printer = await pairNetworkPrinter(role, lanDraft[role])
      upsertPrinter(printer)
      tapFeedback('success')
      setToast(`LAN tiskárna uložena: ${printer.address}`)
      setLanDraft((d) => ({ ...d, [role]: '' }))
    } catch (e) {
      tapFeedback('alert')
      setToast(e instanceof Error ? e.message : 'LAN párování selhalo')
    } finally {
      setPairingRole(null)
    }
  }

  const onRename = (printer: PosPrinter) => {
    tapFeedback()
    try {
      const next = renamePosPrinter(
        printer,
        renameDraft[printer.id] ?? printer.name,
      )
      upsertPrinter(next)
      tapFeedback('success')
      setToast(`Tiskárna přejmenována: ${next.name}`)
    } catch (e) {
      tapFeedback('alert')
      setToast(e instanceof Error ? e.message : 'Přejmenování selhalo')
    }
  }

  const onSaveApiKey = () => {
    tapFeedback()
    const raw = apiKeyDraft.trim()
    if (!raw) {
      tapFeedback('alert')
      setToast('Zadejte API klíč platebního terminálu')
      return
    }
    setApiKey(raw)
    setApiKeyDraft('')
    tapFeedback('success')
    setToast(
      `API připojení uloženo (${provider === 'sumup' ? 'SumUp' : 'Stripe Terminal'})`,
    )
  }

  const onTestHandshake = async () => {
    if (handshakeBusy) return
    tapFeedback()
    const amount = Math.round(Number(String(testAmount).replace(/\s/g, '')) || 0)
    if (amount <= 0) {
      tapFeedback('alert')
      setToast('Zadejte testovací částku v Kč')
      return
    }
    setHandshakeBusy(true)
    setHandshakeStatus('Odesílám automatický handshake ceny…')
    try {
      const result = await runTerminalHandshake({
        amountCzK: amount,
        provider,
        onStatus: (session) => setHandshakeStatus(session.message),
        force: 'approved',
      })
      pushLog({
        provider,
        amountCzk: amount,
        approved: result.approved,
        authCode: result.authCode,
        message: result.session.message,
        kind: 'handshake_test',
      })
      if (result.approved) {
        tapFeedback('success')
        setToast(
          `Handshake OK — ${formatCurrency(amount)} · ${result.authCode || 'AUTH'}`,
        )
      } else {
        tapFeedback('alert')
        setToast(result.declineReason || 'Handshake zamítnut')
      }
    } catch (e) {
      tapFeedback('alert')
      setToast(e instanceof Error ? e.message : 'Test handshake selhal')
    } finally {
      setHandshakeBusy(false)
    }
  }

  const launchMonitor = async (
    path: DisplayPath | null,
    screenIndex: number,
    view?: 'cctv',
  ) => {
    tapFeedback('success')
    if (view === 'cctv') {
      setView('cctv')
      setToast('CCTV Office Wall — otevřeno v admin rozhraní')
      return
    }
    if (!path) return
    await openPosDisplayWindow(path, screenIndex)
    setToast(`Externí obrazovka spuštěna: ${path}`)
  }

  return (
    <div
      className={`hardware-pos-centrum${embedded ? ' is-embedded' : ''}`}
      style={{ animation: embedded ? undefined : 'fadeUp 0.4s ease' }}
    >
      {!embedded && (
        <div style={{ marginBottom: 22 }}>
          <h1 className="section-title gold-text">Hardware & POS Centrum</h1>
          <p className="section-sub">
            Bezpečná správa tiskáren, platebních terminálů a externích obrazovek —
            pouze pro majitele / manažera. Personální terminál zůstává čistý.
          </p>
        </div>
      )}

      {embedded && (
        <div className="hw-embedded-head">
          <div>
            <h2 className="gold-text" style={{ margin: 0, fontSize: '1.45rem' }}>
              Hardware & POS Centrum
            </h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Konfigurace hardwaru mimo personální terminál — tiskárny, terminály, monitory.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-gold"
            style={{ minHeight: 48 }}
            onClick={() => {
              tapFeedback()
              setView('hardware')
            }}
          >
            <Settings2 size={15} /> Otevřít celé centrum
          </button>
        </div>
      )}

      {/* —— Printers —— */}
      <section className="panel hw-section">
        <div className="hw-section-title">
          <Printer size={18} color="var(--gold)" />
          <div>
            <h3>Konfigurace tiskáren</h3>
            <p>Přidání, přejmenování a párování Bluetooth / LAN (Bar, Kuchyň, Zákazník).</p>
          </div>
        </div>

        <div className="hw-printer-grid">
          {PRINTER_ROLES.map((role) => {
            const printer = printerFor(role)
            return (
              <div key={role} className="hw-printer-card">
                <div className="hw-printer-card-head">
                  <span className="badge badge-gold">{stationLabel(role)}</span>
                  {printer?.paired ? (
                    <span className="hw-status ok">Spárováno</span>
                  ) : (
                    <span className="hw-status warn">Nepřiřazeno</span>
                  )}
                </div>
                <div className="hw-printer-name">{printer?.name || roleLabel(role)}</div>
                <div className="hw-printer-meta">
                  {printer
                    ? `${printer.connection.toUpperCase()} · ${printer.address}`
                    : 'Žádná tiskárna — spárujte BT nebo LAN'}
                </div>

                <label className="label">Přejmenovat</label>
                <div className="hw-inline-row">
                  <input
                    className="input"
                    value={renameDraft[printer?.id || role] ?? printer?.name ?? ''}
                    placeholder="Název tiskárny"
                    onChange={(e) =>
                      setRenameDraft((d) => ({
                        ...d,
                        [printer?.id || role]: e.target.value,
                      }))
                    }
                    disabled={!printer}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 44 }}
                    disabled={!printer}
                    onClick={() => printer && onRename(printer)}
                  >
                    Uložit
                  </button>
                </div>

                <div className="hw-btn-stack">
                  <button
                    type="button"
                    className="btn btn-gold"
                    style={{ minHeight: 48 }}
                    disabled={pairingRole === role}
                    onClick={() => void onPairBluetooth(role)}
                  >
                    <Bluetooth size={15} />
                    {pairingRole === role ? 'Páruji Bluetooth…' : 'Spárovat Bluetooth'}
                  </button>
                  <div className="hw-inline-row">
                    <input
                      className="input"
                      value={lanDraft[role]}
                      placeholder="192.168.1.50:9100"
                      onChange={(e) =>
                        setLanDraft((d) => ({ ...d, [role]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 44 }}
                      disabled={pairingRole === role}
                      onClick={() => void onPairLan(role)}
                    >
                      <Cable size={15} /> LAN
                    </button>
                  </div>
                  {printer && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 44, color: 'var(--danger)' }}
                      onClick={() => {
                        tapFeedback('alert')
                        removePrinter(printer.id)
                        setToast(`Tiskárna odebrána: ${printer.name}`)
                      }}
                    >
                      <Trash2 size={14} /> Odebrat tiskárnu
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="hw-footnote">
          Jídlo → Kuchyňská bonička · Pití → Barová objednávka · Účtenka → zákaznická 80mm.
          Personál na /pos-terminal tiskne automaticky — bez přístupu ke konfiguraci.
        </p>
      </section>

      {/* —— Payment terminal —— */}
      <section className="panel hw-section">
        <div className="hw-section-title">
          <CreditCard size={18} color="var(--gold)" />
          <div>
            <h3>Integrace platebního terminálu</h3>
            <p>
              API připojení, test automatického odeslání ceny a protokol platebních handshake.
            </p>
          </div>
        </div>

        <div className="hw-terminal-grid">
          <div className="hw-terminal-config">
            <label className="label">Poskytovatel</label>
            <div className="hw-inline-row" style={{ marginBottom: 12 }}>
              {(
                [
                  ['stripe_terminal', 'Stripe Terminal'],
                  ['sumup', 'SumUp'],
                ] as Array<[TerminalProvider, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={provider === id ? 'btn btn-gold' : 'btn btn-ghost'}
                  style={{ minHeight: 44, flex: 1 }}
                  onClick={() => {
                    tapFeedback()
                    setProvider(id)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="label">API klíč / token terminálu</label>
            <div className="hw-inline-row">
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder={
                  apiKeyMasked
                    ? `Uloženo: ${apiKeyMasked}`
                    : 'sk_live_… / sumup_merchant_…'
                }
                value={apiKeyDraft}
                onChange={(e) => setApiKeyDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-gold"
                style={{ minHeight: 44 }}
                onClick={onSaveApiKey}
              >
                Uložit
              </button>
            </div>
            <div className="hw-connection-row">
              {connected ? (
                <span className="hw-status ok">
                  <CheckCircle2 size={14} /> Terminál připojen
                </span>
              ) : (
                <span className="hw-status warn">Terminál není nakonfigurován</span>
              )}
            </div>

            <label className="label" style={{ marginTop: 14 }}>
              Testovací částka (Kč)
            </label>
            <div className="hw-inline-row">
              <input
                className="input"
                inputMode="decimal"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-gold"
                style={{ minHeight: 48 }}
                disabled={handshakeBusy}
                onClick={() => void onTestHandshake()}
              >
                <RefreshCw size={15} className={handshakeBusy ? 'spin' : undefined} />
                {handshakeBusy ? 'Handshake…' : 'Test automatické ceny'}
              </button>
            </div>
            {handshakeStatus && (
              <div className="hw-handshake-status" role="status">
                {handshakeStatus}
              </div>
            )}
          </div>

          <div className="hw-terminal-logs">
            <div className="hw-logs-head">
              <h4 style={{ margin: 0 }}>Protokol plateb</h4>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 40, padding: '0.4rem 0.75rem' }}
                onClick={() => {
                  tapFeedback()
                  clearLogs()
                  setToast('Protokol plateb vymazán')
                }}
                disabled={!logs.length}
              >
                <X size={14} /> Vymazat
              </button>
            </div>
            <div className="hw-logs-list">
              {logs.length === 0 && (
                <div className="hw-logs-empty">
                  Zatím žádné záznamy — spusťte test handshake.
                </div>
              )}
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`hw-log-row ${log.approved ? 'is-ok' : 'is-fail'}`}
                >
                  <div className="hw-log-main">
                    <strong>
                      {formatCurrency(log.amountCzk)} ·{' '}
                      {log.provider === 'sumup' ? 'SumUp' : 'Stripe'}
                    </strong>
                    <span>{log.message}</span>
                  </div>
                  <div className="hw-log-meta">
                    {formatCzechDateTime(log.at)}
                    {log.authCode ? ` · ${log.authCode}` : ''}
                    {log.kind === 'handshake_test' ? ' · test' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* —— Multi-monitor —— */}
      <section className="panel hw-section">
        <div className="hw-section-title">
          <Monitor size={18} color="var(--gold)" />
          <div>
            <h3>Správa více monitorů</h3>
            <p>
              Centrální spouštění samostatných obrazovek — Kitchen KDS, Bar KDS,
              Customer-Facing Display a CCTV Office Wall.
            </p>
          </div>
        </div>
        <div className="hw-monitor-grid">
          {MONITORS.map((m) => {
            const Icon = m.icon
            return (
              <div key={m.id} className="hw-monitor-card">
                <Icon size={22} color="var(--gold)" />
                <div className="hw-monitor-title">{m.title}</div>
                <div className="hw-monitor-sub">{m.subtitle}</div>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ width: '100%', minHeight: 48, marginTop: 'auto' }}
                  onClick={() =>
                    void launchMonitor(
                      m.path,
                      m.screenIndex,
                      'view' in m ? m.view : undefined,
                    )
                  }
                >
                  Spustit obrazovku
                </button>
              </div>
            )
          })}
        </div>
        <p className="hw-footnote">
          Tyto spouštěče nejsou dostupné v Terminálu personálu — obsluha pracuje jen s mapou
          stolů, rychlým prodejem a uzávěrkou pod PIN.
        </p>
      </section>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
