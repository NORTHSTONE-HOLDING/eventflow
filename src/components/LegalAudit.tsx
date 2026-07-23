import { useMemo, useState } from 'react'
import {
  Lock,
  Scale,
  Loader2,
  MessageCircle,
  FileWarning,
  Search,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore, selectActiveProject, migrateProject } from '../store/useAppStore'
import { hasFeature } from '../lib/subscriptions'
import {
  COLLECTION_TEMPLATES,
  generateDebtNotice,
  auditContractText,
} from '../lib/legalAudit'
import {
  analyzeReceivableWithAI,
  buildPredzalobniWhatsAppMessage,
  type DebtLegalAnalysis,
} from '../lib/debtLegalEngine'
import {
  getProjectReceivable,
  listActiveReceivables,
  type ProjectReceivable,
} from '../lib/receivables'
import { openWhatsApp } from '../lib/whatsapp'
import { formatCurrency } from '../lib/documentIds'

export function LegalAudit() {
  const subscription = useAppStore((s) => s.profile.subscription)
  const activeRaw = useAppStore(selectActiveProject)
  const projects = useAppStore((s) => s.projects)
  const legalRisks = useAppStore((s) => s.legalRisks)
  const legalLoading = useAppStore((s) => s.legalLoading)
  const runLegalAudit = useAppStore((s) => s.runLegalAudit)
  const setView = useAppStore((s) => s.setView)
  const setToast = useAppStore((s) => s.setToast)
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const updateProject = useAppStore((s) => s.updateProject)
  const profile = useAppStore((s) => s.profile)

  const project = useMemo(() => migrateProject(activeRaw), [activeRaw])

  const receivables = useMemo(
    () =>
      listActiveReceivables(
        (projects ?? []).map((p) => migrateProject(p)!).filter(Boolean),
        profile
      ),
    [projects, profile]
  )

  const activeDebt = useMemo(
    () => (project ? getProjectReceivable(project, profile) : null),
    [project, profile]
  )

  const [contractText, setContractText] = useState(
    `Smlouva o dílo\n\nObjednatel a Zhotovitel sjednávají smluvní pokutu ve výši 50 000 Kč za každý den prodlení.\nZhotovitel nese neomezenou odpovědnost za veškerou škodu.\nPlatební podmínky: splatnost 60 dnů po akci, záloha 10 %.\nStorno: objednatel může odstoupit bez sankce 7 dní před akcí.\nForce majeure: pandemie není zahrnuta.\nGDPR: zpracování osobních údajů hostů bez DPA.`
  )
  const [collectionDoc, setCollectionDoc] = useState<keyof typeof COLLECTION_TEMPLATES | null>(
    null
  )
  const [debtPhone, setDebtPhone] = useState('')
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [debtAnalysis, setDebtAnalysis] = useState<DebtLegalAnalysis | null>(
    project?.debtLegalAnalysis
      ? {
          projectId: project.id,
          invoiceId: project.documents?.faktura || '',
          generatedAt: project.debtLegalAnalysis.generatedAt,
          sectionBreach: project.debtLegalAnalysis.sectionBreach,
          sectionPreAction: project.debtLegalAnalysis.sectionPreAction,
          whatsappNotice: project.debtLegalAnalysis.whatsappNotice,
          model: project.debtLegalAnalysis.model,
          source: project.debtLegalAnalysis.source,
        }
      : null
  )

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

  const amount = activeDebt?.amountDue ?? project?.totalRevenue ?? 450000
  const invoice = activeDebt?.invoiceId ?? project?.documents.faktura ?? 'F2026001'
  const clientName = project?.clientName || activeDebt?.clientName || 'Dlužník'

  const runAudit = async () => {
    await runLegalAudit(contractText)
    setToast('AI Právní Audit smlouvy dokončen')
  }

  const loadProjectDocsIntoEditor = (debt: ProjectReceivable) => {
    setContractText(
      `${debt.contractText}\n\n————————\n\n${debt.protocolText}`
    )
    setActiveProject(debt.projectId)
    setDebtPhone(debt.clientPhone || '')
    setToast(`Načtena Smlouva ${debt.contractId} + Protokol ${debt.protocolId}`)
  }

  const runDebtAnalysis = async (debt: ProjectReceivable) => {
    setAnalyzingId(debt.projectId)
    setActiveProject(debt.projectId)
    setDebtPhone(debt.clientPhone || '')
    try {
      setToast('AI skenuje Smlouvu o dílo a Předávací protokol…')
      const analysis = await analyzeReceivableWithAI(debt, profile)
      setDebtAnalysis(analysis)
      updateProject(debt.projectId, {
        debtLegalAnalysis: {
          generatedAt: analysis.generatedAt,
          sectionBreach: analysis.sectionBreach,
          sectionPreAction: analysis.sectionPreAction,
          whatsappNotice: analysis.whatsappNotice,
          model: analysis.model,
          source: analysis.source,
        },
      })
      // Also feed contract risk engine with linked docs
      const risks = await auditContractText(`${debt.contractText}\n${debt.protocolText}`)
      useAppStore.setState({ legalRisks: risks })
      setToast(
        analysis.source === 'openai'
          ? 'AI Právní analýza pohledávky hotova (OpenAI)'
          : 'AI Právní analýza pohledávky hotova (simulační engine)'
      )
    } catch {
      setToast('Analýza pohledávky selhala')
    } finally {
      setAnalyzingId(null)
    }
  }

  const sendPredzalobniWhatsApp = (debt: ProjectReceivable, analysis: DebtLegalAnalysis | null) => {
    const phone = (debtPhone || debt.clientPhone || '').trim()
    if (!phone) {
      setToast('Zadejte telefon klienta / neplatiče')
      return
    }
    const msg = analysis
      ? buildPredzalobniWhatsAppMessage(analysis)
      : generateDebtNotice(debt.clientName, debt.amountDue, debt.invoiceId, debt.dueDateLabel) +
        `\n\n💳 OKAMŽITÁ PLATBA:\n${debt.paymentLink}`
    openWhatsApp(phone, msg)
    setToast('Předžalobní výzva připravena ve WhatsApp')
  }

  const markPaid = (projectId: string) => {
    updateProject(projectId, { finalPaymentPaid: true })
    setToast('Pohledávka označena jako uhrazená')
  }

  const high = legalRisks.filter((r) => r.level === 'high')
  const medium = legalRisks.filter((r) => r.level === 'medium')
  const summary = legalRisks.filter((r) => r.level === 'summary')

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h1 className="section-title gold-text">🛡️ AI Právní Audit</h1>
      <p className="section-sub">
        Kontrola smluv · vymáhání pohledávek · předžalobní výzvy § 142a OSŘ · dark slate / gold
      </p>

      {/* ——— Unpaid invoices / receivables ——— */}
      <div
        className="panel"
        style={{
          marginBottom: 20,
          borderColor: '#D4AF37',
          background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(15,23,42,0.9))',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', color: '#D4AF37', fontWeight: 900, margin: 0 }}>
              Boj s neplatiči · aktivní pohledávky
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 4 }}>
              Propojení se Smlouvou o dílo a digitálně podepsaným Předávacím protokolem
            </p>
          </div>
          <span className="badge badge-gold">{receivables.length} aktivních</span>
        </div>

        {receivables.length === 0 ? (
          <div
            style={{
              padding: '1.25rem',
              borderRadius: 12,
              border: '1px dashed #475569',
              background: '#1e293b',
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            Žádné otevřené / po splatnosti pohledávky. (Podmínka: podpis + uhrazená záloha +
            neuhrazený doplatek.)
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {receivables.map((debt) => {
              const isActive = project?.id === debt.projectId
              const busy = analyzingId === debt.projectId
              return (
                <div
                  key={debt.projectId}
                  style={{
                    borderRadius: 14,
                    border: `1px solid ${isActive ? '#D4AF37' : '#334155'}`,
                    background: '#1e293b',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.05rem' }}>
                        {debt.projectName}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                        {debt.clientName} · {debt.invoiceId} · SOD {debt.contractId} · PP{' '}
                        {debt.protocolId}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#D4AF37', fontWeight: 900, fontSize: '1.2rem' }}>
                        {formatCurrency(debt.amountDue)}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          color: debt.status === 'overdue' ? '#fca5a5' : '#fbbf24',
                        }}
                      >
                        {debt.status === 'overdue'
                          ? `PO SPLATNOSTI · ${debt.daysOverdue} dnů`
                          : `Splatnost ${debt.dueDateLabel}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-gold"
                      style={{
                        minHeight: 48,
                        fontWeight: 900,
                        touchAction: 'manipulation',
                      }}
                      disabled={busy}
                      onClick={() => runDebtAnalysis(debt)}
                    >
                      {busy ? (
                        <>
                          <Loader2 size={16} className="spin" /> Analyzuji…
                        </>
                      ) : (
                        <>
                          <Search size={16} /> 🔍 Spustit AI Právní analýzu pohledávky
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 48, touchAction: 'manipulation' }}
                      onClick={() => loadProjectDocsIntoEditor(debt)}
                    >
                      <FileWarning size={15} /> Načíst smlouvu + protokol
                    </button>
                    <button
                      type="button"
                      style={{
                        minHeight: 48,
                        padding: '0.7rem 1.1rem',
                        borderRadius: 10,
                        border: 'none',
                        background: '#10b981',
                        color: '#042f1a',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        touchAction: 'manipulation',
                      }}
                      onClick={() =>
                        sendPredzalobniWhatsApp(
                          debt,
                          debtAnalysis?.projectId === debt.projectId ? debtAnalysis : null
                        )
                      }
                    >
                      <MessageCircle size={16} /> 📱 Odeslat Předžalobní výzvu na WhatsApp klienta
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ minHeight: 48 }}
                      onClick={() => markPaid(debt.projectId)}
                    >
                      <CheckCircle2 size={15} /> Označit uhrazeno
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {(activeDebt?.status === 'open' || activeDebt?.status === 'overdue') && (
          <div style={{ marginTop: 14 }}>
            <label className="label">Telefon klienta pro WhatsApp</label>
            <input
              className="input"
              value={debtPhone}
              onChange={(e) => setDebtPhone(e.target.value)}
              placeholder={activeDebt.clientPhone || '+420…'}
              style={{ minHeight: 48, background: '#0f172a', borderColor: '#334155' }}
            />
          </div>
        )}
      </div>

      {/* ——— AI debt analysis output ——— */}
      {debtAnalysis && (
        <div style={{ display: 'grid', gap: 14, marginBottom: 24 }}>
          <motion.div
            className="panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              borderColor: 'rgba(239,68,68,0.55)',
              background: 'rgba(239,68,68,0.08)',
              whiteSpace: 'pre-wrap',
              fontSize: '0.9rem',
              lineHeight: 1.65,
              color: '#e2e8f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 10,
                flexWrap: 'wrap',
              }}
            >
              <span className="badge" style={{ border: '1px solid rgba(239,68,68,0.5)' }}>
                <AlertTriangle size={12} /> AI výstup
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {debtAnalysis.source === 'openai' ? 'OpenAI' : 'Simulace'} · {debtAnalysis.model}
              </span>
            </div>
            {debtAnalysis.sectionBreach}
          </motion.div>

          <motion.div
            className="panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              borderColor: '#D4AF37',
              background: 'rgba(212,175,55,0.08)',
              whiteSpace: 'pre-wrap',
              fontSize: '0.9rem',
              lineHeight: 1.65,
              color: '#e2e8f0',
            }}
          >
            {debtAnalysis.sectionPreAction}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${debtAnalysis.sectionBreach}\n\n${debtAnalysis.sectionPreAction}`
                  )
                  setToast('Analýza zkopírována')
                }}
              >
                Kopírovat celý výstup
              </button>
              {activeDebt && (
                <button
                  type="button"
                  style={{
                    minHeight: 48,
                    padding: '0.7rem 1.1rem',
                    borderRadius: 10,
                    border: 'none',
                    background: '#10b981',
                    color: '#042f1a',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    touchAction: 'manipulation',
                  }}
                  onClick={() => sendPredzalobniWhatsApp(activeDebt, debtAnalysis)}
                >
                  <MessageCircle size={16} /> 📱 Odeslat Předžalobní výzvu na WhatsApp klienta
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <label className="label">Text smlouvy / smlouvy o dílo (+ protokol)</label>
        <textarea
          className="textarea"
          value={contractText}
          onChange={(e) => setContractText(e.target.value)}
          style={{ minHeight: 160, background: '#0f172a', borderColor: '#334155' }}
        />
        <button
          className="btn btn-gold"
          style={{ marginTop: 12, minHeight: 48 }}
          onClick={runAudit}
          disabled={legalLoading}
        >
          {legalLoading ? (
            <>
              <Loader2 size={16} className="spin" /> Analyzuji…
            </>
          ) : (
            <>
              <Scale size={16} /> Spustit AI Právní Audit smlouvy
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {(Object.keys(COLLECTION_TEMPLATES) as Array<keyof typeof COLLECTION_TEMPLATES>).map(
          (key) => (
            <button
              key={key}
              type="button"
              className="panel glass-glow"
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                color: 'inherit',
                borderColor: collectionDoc === key ? 'var(--gold)' : undefined,
                minHeight: 44,
                touchAction: 'manipulation',
              }}
              onClick={() => setCollectionDoc(key)}
            >
              <FileWarning size={18} color="var(--gold)" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                {COLLECTION_TEMPLATES[key].title}
              </div>
            </button>
          )
        )}
      </div>

      {collectionDoc && (
        <motion.div
          className="panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 20,
            whiteSpace: 'pre-wrap',
            fontSize: '0.9rem',
            color: 'var(--text-muted)',
            lineHeight: 1.7,
          }}
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
    high: {
      label: '🔴 VELKÁ RIZIKA',
      border: 'rgba(239,68,68,0.5)',
      bg: 'rgba(239,68,68,0.08)',
    },
    medium: {
      label: '🟡 UPOZORNĚNÍ',
      border: 'rgba(240,180,41,0.5)',
      bg: 'rgba(240,180,41,0.08)',
    },
    summary: {
      label: '🟢 SHRNUTÍ LIDSKOU ŘEČÍ',
      border: 'rgba(62,207,142,0.5)',
      bg: 'rgba(62,207,142,0.08)',
    },
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
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 8 }}>
        {risk.description}
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--gold)' }}>→ {risk.recommendation}</p>
    </motion.div>
  )
}
