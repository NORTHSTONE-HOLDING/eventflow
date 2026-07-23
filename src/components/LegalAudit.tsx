import { useState } from 'react'
import { Lock, Scale, Loader2, MessageCircle, FileWarning } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import {
  COLLECTION_TEMPLATES,
  generateDebtNotice,
} from '../lib/legalAudit'
import { openWhatsApp } from '../lib/whatsapp'
import { formatCurrency } from '../lib/documentIds'

export function LegalAudit() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const project = useAppStore((s) => s.getActiveProject())
  const legalRisks = useAppStore((s) => s.legalRisks)
  const legalLoading = useAppStore((s) => s.legalLoading)
  const runLegalAudit = useAppStore((s) => s.runLegalAudit)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)
  const profile = useAppStore((s) => s.profile)

  const [contractText, setContractText] = useState(
    `Smlouva o dílo\n\nObjednatel a Zhotovitel sjednávají smluvní pokutu ve výši 50 000 Kč za každý den prodlení.\nZhotovitel nese neomezenou odpovědnost za veškerou škodu.\nPlatební podmínky: splatnost 60 dnů po akci, záloha 10 %.\nStorno: objednatel může odstoupit bez sankce 7 dní před akcí.\nForce majeure: pandemie není zahrnuta.\nGDPR: zpracování osobních údajů hostů bez DPA.`
  )
  const [collectionDoc, setCollectionDoc] = useState<keyof typeof COLLECTION_TEMPLATES | null>(null)
  const [debtPhone, setDebtPhone] = useState('')

  const unlocked = hasFeature(subscription, 'BUSINESS')

  if (!unlocked) {
    return (
      <div style={{ animation: 'fadeUp 0.4s ease' }}>
        <h1 className="section-title gold-text">AI Právní Audit</h1>
        <div className="locked-overlay" style={{ position: 'relative', minHeight: 300 }}>
          <Lock size={32} color="var(--gold)" />
          <div>Právní audit a inkasní formuláře = BUSINESS+</div>
          <button className="btn btn-gold" onClick={() => setView('profile')}>
            Upgradovat
          </button>
        </div>
      </div>
    )
  }

  const amount = project?.totalRevenue ?? 450000
  const invoice = project?.documents.faktura ?? 'F2026001'
  const clientName = project?.clientName || 'Dlužník'

  const runAudit = async () => {
    await runLegalAudit(contractText)
    setToast('AI Právní Audit dokončen')
  }

  const urgeDebtor = () => {
    if (!debtPhone.trim()) {
      setToast('Zadejte telefon neplatiče')
      return
    }
    const notice = generateDebtNotice(
      clientName,
      amount,
      invoice,
      new Date(Date.now() - 14 * 86400000).toLocaleDateString('cs-CZ')
    )
    openWhatsApp(debtPhone, notice)
    setToast('Formální urgencí odeslána přes WhatsApp')
  }

  const high = legalRisks.filter((r) => r.level === 'high')
  const medium = legalRisks.filter((r) => r.level === 'medium')
  const summary = legalRisks.filter((r) => r.level === 'summary')

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="section-title gold-text">🛡️ AI Právní Audit</h1>
      <p className="section-sub">
        Vložte text smlouvy — AI rozdělí rizika do tří lokalizovaných karet.
      </p>

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="label">Text smlouvy / smlouvy o dílo</label>
        <textarea
          className="textarea"
          value={contractText}
          onChange={(e) => setContractText(e.target.value)}
          style={{ minHeight: 160 }}
        />
        <button className="btn btn-gold" style={{ marginTop: 12 }} onClick={runAudit} disabled={legalLoading}>
          {legalLoading ? (
            <>
              <Loader2 size={16} className="spin" /> Analyzuji…
            </>
          ) : (
            <>
              <Scale size={16} /> Spustit AI Právní Audit
            </>
          )}
        </button>
      </div>

      {legalRisks.length > 0 && (
        <div style={{ display: 'grid', gap: 14, marginBottom: 28 }}>
          {high.map((r, i) => (
            <RiskCard key={`h${i}`} tone="high" risk={r} />
          ))}
          {medium.map((r, i) => (
            <RiskCard key={`m${i}`} tone="medium" risk={r} />
          ))}
          {summary.map((r, i) => (
            <RiskCard key={`s${i}`} tone="summary" risk={r} />
          ))}
        </div>
      )}

      <h2 style={{ fontSize: '1.4rem', marginBottom: 8 }} className="gold-text">
        Inkasní dokumenty
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 14, fontSize: '0.9rem' }}>
        Rozšířené formuláře pro pozdní platby klientů · {profile.companyName || 'Vaše agentura'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
        {(Object.keys(COLLECTION_TEMPLATES) as Array<keyof typeof COLLECTION_TEMPLATES>).map((key) => (
          <button
            key={key}
            type="button"
            className="panel glass-glow"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              color: 'inherit',
              borderColor: collectionDoc === key ? 'var(--gold)' : undefined,
            }}
            onClick={() => setCollectionDoc(key)}
          >
            <FileWarning size={18} color="var(--gold)" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>
              {COLLECTION_TEMPLATES[key].title}
            </div>
          </button>
        ))}
      </div>

      {collectionDoc && (
        <motion.div
          className="panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 20, whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7 }}
        >
          <h3 style={{ color: 'var(--text)', marginBottom: 12 }}>
            {COLLECTION_TEMPLATES[collectionDoc].title}
          </h3>
          {COLLECTION_TEMPLATES[collectionDoc].body(clientName, amount, invoice)}
          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                navigator.clipboard.writeText(
                  COLLECTION_TEMPLATES[collectionDoc!].body(clientName, amount, invoice)
                )
                setToast('Dokument zkopírován do schránky')
              }}
            >
              Kopírovat text
            </button>
          </div>
        </motion.div>
      )}

      <div
        className="panel"
        style={{
          background: 'linear-gradient(135deg, rgba(239,68,68,0.08), transparent)',
          borderColor: 'rgba(239,68,68,0.3)',
        }}
      >
        <h3 style={{ marginBottom: 8 }}>🤖 Urgovat neplatiče přes AI</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
          Formální výzva k úhradě {formatCurrency(amount)} · faktura {invoice}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Telefon neplatiče +420…"
            value={debtPhone}
            onChange={(e) => setDebtPhone(e.target.value)}
          />
          <button className="btn btn-wa" onClick={urgeDebtor}>
            <MessageCircle size={16} /> Odeslat WhatsApp urgenci
          </button>
        </div>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function RiskCard({
  tone,
  risk,
}: {
  tone: 'high' | 'medium' | 'summary'
  risk: { title: string; description: string; recommendation: string }
}) {
  const meta = {
    high: { label: '🔴 VELKÁ RIZIKA', border: 'rgba(239,68,68,0.5)', bg: 'rgba(239,68,68,0.08)' },
    medium: { label: '🟡 UPOZORNĚNÍ', border: 'rgba(240,180,41,0.5)', bg: 'rgba(240,180,41,0.08)' },
    summary: { label: '🟢 SHRNUTÍ LIDSKOU ŘEČÍ', border: 'rgba(62,207,142,0.5)', bg: 'rgba(62,207,142,0.08)' },
  }[tone]

  return (
    <motion.div
      className="panel"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      style={{ borderColor: meta.border, background: meta.bg }}
    >
      <div className="badge" style={{ marginBottom: 10, border: `1px solid ${meta.border}` }}>
        {meta.label}
      </div>
      <h4 style={{ fontSize: '1.15rem', marginBottom: 6 }}>{risk.title}</h4>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 8 }}>{risk.description}</p>
      <p style={{ fontSize: '0.85rem', color: 'var(--gold)' }}>→ {risk.recommendation}</p>
    </motion.div>
  )
}
