import { useRef, useState, useEffect, useCallback } from 'react'
import { Lock, MessageCircle, PenLine, CreditCard } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, selectActiveProject } from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import { buildClientWhatsAppMessage, openWhatsApp } from '../lib/whatsapp'
import { formatCurrency } from '../lib/documentIds'
import { formatCzechDate } from '../lib/czechDate'

export function ClientPortal() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const profile = useAppStore((s) => s.profile)
  const project = useAppStore(selectActiveProject)
  const updateProject = useAppStore((s) => s.updateProject)
  const setClientSignature = useAppStore((s) => s.setClientSignature)
  const markDepositPaid = useAppStore((s) => s.markDepositPaid)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)

  const unlocked = hasFeature(subscription, 'BUSINESS')
  const [phone, setPhone] = useState(project?.clientPhone ?? '')
  const [clientName, setClientName] = useState(project?.clientName ?? '')
  const [step, setStep] = useState<'review' | 'sign' | 'invoice'>(
    project?.clientSigned ? 'invoice' : 'review'
  )

  useEffect(() => {
    if (project?.clientSigned) setStep('invoice')
  }, [project?.clientSigned])

  if (!unlocked) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">Klientský portál</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 300 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Klientský portál, podpis a Smart-Faktura = BUSINESS+</div>
          <button className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat
          </button>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
        Nejdřív vytvořte nabídku v AI Planneru.
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-gold" onClick={() => setView('planner')}>
            AI Planner
          </button>
        </div>
      </div>
    )
  }

  const sendToClient = () => {
    if (!phone.trim()) {
      setToast('Zadejte telefon klienta')
      return
    }
    updateProject(project.id, { clientPhone: phone, clientName })
    const msg = buildClientWhatsAppMessage({
      clientName,
      eventName: project.name,
      quoteId: project.documents.nabidka,
      portalUrl: `${window.location.origin}/portal?event=${project.id}`,
    })
    openWhatsApp(phone, msg)
    setToast('Nabídka odeslána na WhatsApp klienta')
    setStep('sign')
  }

  const deposit = Math.round(project.totalRevenue * 0.5)

  // Czech QR Platba SPD format
  const spd = [
    'SPD*1.0',
    `ACC:${profile.iban || 'CZ6508000000192000145399'}`,
    `AM:${deposit.toFixed(2)}`,
    'CC:CZK',
    `X-VS:${project.documents.faktura.replace(/\D/g, '')}`,
    `MSG:Zaloha ${project.documents.nabidka}`,
  ].join('*')

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="section-title gold-text">Klientský portál</h1>
      <p className="section-sub">
        WhatsApp share · digitální podpis · Smart-Faktura s QR Platbou
      </p>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label className="label">Jméno klienta</label>
            <input
              className="input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Jan Novák / Firma s.r.o."
            />
          </div>
          <div>
            <label className="label">Telefon klienta</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+420777123456"
            />
          </div>
          <button className="btn btn-wa" onClick={sendToClient}>
            <MessageCircle size={16} /> 📱 Poslat klientovi na WhatsApp
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['review', 'sign', 'invoice'] as const).map((s) => (
          <button
            key={s}
            className={step === s ? 'btn btn-gold' : 'btn btn-ghost'}
            onClick={() => {
              if (s === 'invoice' && !project.clientSigned) return
              setStep(s)
            }}
            disabled={s === 'invoice' && !project.clientSigned}
          >
            {s === 'review' ? 'Nabídka / Smlouva' : s === 'sign' ? 'Podpis' : 'Smart-Faktura'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 'review' && (
          <motion.div
            key="review"
            className="panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                {profile.companyName || 'EventFlow Agency'}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                IČO {profile.ico || '—'} · DIČ {profile.dic || '—'} · {profile.bankAccount || '—'}/{profile.bankCode || '—'}
              </div>
            </div>
            <h3 style={{ marginBottom: 8 }}>
              Nabídka {project.documents.nabidka} / Smlouva {project.documents.smlouva}
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
              {project.name} · {formatCzechDate(project.date)} · {project.guests} hostů · {project.location}
            </p>
            <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
              <tbody>
                {(project.budgetLines ?? [])
                  .filter((l) => !l.isCost)
                  .concat((project.budgetLines ?? []).filter((l) => l.isCost).slice(0, 3))
                  .map((l) => (
                    <tr key={l.id}>
                      <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        {l.description}
                      </td>
                      <td
                        style={{
                          padding: '8px 0',
                          borderBottom: '1px solid var(--border)',
                          textAlign: 'right',
                          color: 'var(--gold)',
                        }}
                      >
                        {formatCurrency(l.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.2rem',
                fontWeight: 600,
              }}
            >
              <span>Celkem</span>
              <span className="gold-text">{formatCurrency(project.totalRevenue)}</span>
            </div>
            <button className="btn btn-gold" style={{ marginTop: 20 }} onClick={() => setStep('sign')}>
              <PenLine size={16} /> Pokračovat k podpisu
            </button>
          </motion.div>
        )}

        {step === 'sign' && (
          <motion.div
            key="sign"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {project.clientSigned ? (
              <div className="panel" style={{ textAlign: 'center' }}>
                <div className="badge badge-success" style={{ marginBottom: 12 }}>
                  Podepsáno
                </div>
                {project.clientSignature && (
                  <img
                    src={project.clientSignature}
                    alt="Podpis"
                    style={{ maxWidth: 280, margin: '0 auto 16px', display: 'block', background: '#fff', borderRadius: 8 }}
                  />
                )}
                <button className="btn btn-gold" onClick={() => setStep('invoice')}>
                  Přejít na Smart-Fakturu
                </button>
              </div>
            ) : (
              <SignaturePad
                onSave={(dataUrl) => {
                  setClientSignature(project.id, dataUrl)
                  updateProject(project.id, { clientName, clientPhone: phone })
                  setToast('Dokument podepsán — přecházím na Smart-Fakturu')
                  setTimeout(() => setStep('invoice'), 600)
                }}
              />
            )}
          </motion.div>
        )}

        {step === 'invoice' && (
          <motion.div
            key="invoice"
            className="panel"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <h3 style={{ fontSize: '1.4rem', marginBottom: 4 }}>
              Smart-Faktura {project.documents.faktura}
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              Záloha 50 % · {formatCurrency(deposit)}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 24,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  padding: 16,
                  background: '#fff',
                  borderRadius: 12,
                  display: 'inline-flex',
                }}
              >
                <QRCodeSVG value={spd} size={160} level="M" />
              </div>
              <div>
                <div className="label">Česká QR Platba (SPD)</div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  Naskenujte v bankovní aplikaci. VS: {project.documents.faktura.replace(/\D/g, '')}
                  <br />
                  Účet: {profile.iban || 'CZ65 0800 0000 1920 0014 5399'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      markDepositPaid(project.id)
                      setToast('Apple Pay — simulace úspěšné platby')
                    }}
                  >
                    Apple Pay
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      markDepositPaid(project.id)
                      setToast('Stripe — simulace úspěšné platby')
                    }}
                  >
                    <CreditCard size={15} /> Stripe
                  </button>
                  <button
                    className="btn btn-gold"
                    onClick={() => {
                      markDepositPaid(project.id)
                      setToast('Záloha označena jako uhrazená')
                    }}
                  >
                    Potvrdit úhradu
                  </button>
                </div>
                {project.depositPaid && (
                  <div style={{ marginTop: 14 }}>
                    <div className="badge badge-success">Záloha uhrazena</div>
                    {project.clientSigned && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: '0.85rem 1rem',
                          background: 'var(--gold-subtle)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: 8,
                          fontSize: '0.9rem',
                        }}
                      >
                        <strong style={{ color: 'var(--gold)' }}>
                          Lifecycle krok 5 — Event POS / Kasa odemčena
                        </strong>
                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                          Prodej na akci je připraven. Extra bar sales se propíší do doplatkové faktury.
                        </div>
                        <button
                          type="button"
                          className="btn btn-gold"
                          style={{ marginTop: 10 }}
                          onClick={() => setView('pos')}
                        >
                          Otevřít Event POS / Kasu
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SignaturePad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const p = getPos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const p = getPos(e)
    ctx.strokeStyle = '#0b0f14'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const end = () => {
    drawing.current = false
  }

  const clear = useCallback(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width = canvas.offsetWidth * 2
    canvas.height = 200 * 2
    canvas.style.height = '200px'
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  return (
    <div className="panel">
      <h3 style={{ marginBottom: 8 }}>Digitální podpis</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
        Podepište se níže. Po uložení se dokument uzamkne a přejdete na Smart-Fakturu.
      </p>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 200,
          borderRadius: 10,
          border: '1px solid var(--border-strong)',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={clear}>
          Vymazat
        </button>
        <button
          className="btn btn-gold"
          onClick={() => onSave(canvasRef.current!.toDataURL('image/png'))}
        >
          Potvrdit podpis
        </button>
      </div>
    </div>
  )
}
