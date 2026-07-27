import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Building2,
  Check,
  CreditCard,
  Crown,
  KeyRound,
  Loader2,
  Lock,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Unlock,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useStaffLockStore } from '../../store/useStaffLockStore'
import { SUBSCRIPTION_PLANS, TIER_RANK } from '../../lib/subscriptions'
import { fetchAresByIco } from '../../lib/aresLookup'
import { startStripeBillingSession } from '../../lib/stripeBilling'
import { registerOnboardingAccount } from '../../lib/onboardingAuth'
import { formatCurrency } from '../../lib/documentIds'
import { tapFeedback } from '../../lib/touchFeedback'
import { Modal } from '../Modal'
import { ManagerPinKeypadModal } from '../staff-terminal/ManagerPinKeypadModal'
import { Logo } from '../Logo'
import type { AgencyProfile, SubscriptionTier } from '../../types'

type OnboardingStep = 1 | 2 | 3 | 4

const LOCKED_KEY_MASK = '••••••••••••••••••••••••'
const STEPS: Array<{ id: OnboardingStep; label: string; title: string }> = [
  { id: 1, label: 'Registrace', title: 'Registrace & souhlas' },
  { id: 2, label: 'Předplatné', title: 'Stripe Paywall' },
  { id: 3, label: 'Provozovna', title: 'Nastavení provozovny' },
  { id: 4, label: 'AI Engine', title: 'Secure AI Engine Lock' },
]

/**
 * Gold-standard SaaS onboarding — first launch / fresh profile gate.
 * Krok 1 Auth+GDPR/VOP/LLM → 2 Stripe tiers → 3 Venue+ARES → 4 AI key lock → Dashboard.
 */
export function SaaSOnboarding() {
  const profile = useAppStore((s) => s.profile)
  const completeOnboarding = useAppStore((s) => s.completeOnboarding)
  const setToast = useAppStore((s) => s.setToast)
  const setManagerPin = useStaffLockStore((s) => s.setManagerPin)

  const [step, setStep] = useState<OnboardingStep>(1)
  const [form, setForm] = useState<AgencyProfile>({ ...profile })
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [aresBusy, setAresBusy] = useState(false)
  const [payBusy, setPayBusy] = useState(false)
  const [aiKeyDraft, setAiKeyDraft] = useState(() => String(profile.openaiApiKey ?? ''))
  const [aiKeySessionUnlocked, setAiKeySessionUnlocked] = useState(false)
  const [unlockPinOpen, setUnlockPinOpen] = useState(false)
  const [showVop, setShowVop] = useState(false)
  const [showGdpr, setShowGdpr] = useState(false)
  const [authMode, setAuthMode] = useState<'supabase' | 'local' | null>(null)

  const keyLocked = Boolean(form.openaiApiKeyLocked) && !aiKeySessionUnlocked
  const paid = Boolean(form.subscriptionPaid)

  const set = <K extends keyof AgencyProfile>(key: K, value: AgencyProfile[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const goStep = (next: OnboardingStep) => {
    tapFeedback()
    setErrors([])
    setStep(next)
  }

  const validateStep1 = async () => {
    const errs: string[] = []
    if (!form.email.trim() || !form.email.includes('@')) errs.push('Zadejte platný e-mail')
    if (password.length < 6) errs.push('Heslo musí mít alespoň 6 znaků')
    if (password !== password2) errs.push('Hesla se neshodují')
    if (!form.vopAccepted) errs.push('Musíte souhlasit s VOP (nezaškrtnuto)')
    if (!form.gdprAccepted) errs.push('Musíte souhlasit s GDPR (nezaškrtnuto)')
    if (!form.llmDataProcessingAccepted) {
      errs.push('Musíte souhlasit se zpracováním dat automatizovaným LLM')
    }
    setErrors(errs)
    if (errs.length) {
      tapFeedback('alert')
      return
    }
    setBusy(true)
    try {
      const auth = await registerOnboardingAccount({
        email: form.email,
        password,
        companyHint: form.companyName,
      })
      if (!auth.ok) {
        setErrors([auth.message])
        tapFeedback('alert')
        return
      }
      setAuthMode(auth.mode)
      setForm((f) => ({
        ...f,
        authEmail: auth.email,
        authUserId: auth.userId,
        email: auth.email,
      }))
      tapFeedback('success')
      setToast(auth.message)
      goStep(2)
    } finally {
      setBusy(false)
    }
  }

  const activateTier = async (tier: SubscriptionTier) => {
    if (payBusy) return
    tapFeedback()
    setPayBusy(true)
    setErrors([])
    try {
      const result = await startStripeBillingSession(tier)
      if (!result.ok) {
        tapFeedback('alert')
        setErrors([result.message])
        return
      }
      setForm((f) => ({
        ...f,
        subscription: tier,
        subscriptionPaid: true,
        subscriptionPaidAt: new Date().toISOString(),
        stripeSessionId: result.sessionId,
      }))
      tapFeedback('success')
      setToast(result.message)
    } catch (e) {
      tapFeedback('alert')
      setErrors([e instanceof Error ? e.message : 'Stripe platba selhala'])
    } finally {
      setPayBusy(false)
    }
  }

  const validateStep2 = () => {
    if (!form.subscriptionPaid) {
      tapFeedback('alert')
      setErrors([
        'Přístup je zamčen — aktivujte tarif přes Stripe (Aktivovat). Bez úhrady nelze pokračovat.',
      ])
      return
    }
    tapFeedback('success')
    goStep(3)
  }

  const runAres = async () => {
    tapFeedback()
    setAresBusy(true)
    setErrors([])
    try {
      const data = await fetchAresByIco(form.ico)
      setForm((f) => ({
        ...f,
        ico: data.ico,
        dic: data.dic || f.dic,
        companyName: data.companyName || f.companyName,
        street: data.street || f.street,
        city: data.city || f.city,
        zip: data.zip || f.zip,
      }))
      tapFeedback('success')
      setToast(
        data.source === 'ares'
          ? `ARES: načteno ${data.companyName}`
          : `ARES simulace: ${data.companyName}`,
      )
    } catch (e) {
      tapFeedback('alert')
      setErrors([e instanceof Error ? e.message : 'ARES lookup selhal'])
    } finally {
      setAresBusy(false)
    }
  }

  const validateStep3 = () => {
    const errs: string[] = []
    if (!form.companyName.trim()) errs.push('Vyplňte název společnosti / provozovny')
    if (!form.ico.trim() || form.ico.replace(/\D/g, '').length !== 8) {
      errs.push('IČO musí mít 8 číslic')
    }
    if (!form.bankAccount.trim()) errs.push('Vyplňte číslo účtu')
    const margin = Number(form.defaultMarginPercent)
    if (!Number.isFinite(margin) || margin < 0 || margin > 90) {
      errs.push('Výchozí marže musí být 0–90 %')
    }
    setErrors(errs)
    if (errs.length) {
      tapFeedback('alert')
      return
    }
    tapFeedback('success')
    goStep(4)
  }

  const handleLockAiKey = () => {
    tapFeedback('success')
    const key = aiKeyDraft.trim()
    if (!key) {
      tapFeedback('alert')
      setErrors(['Nejdříve vložte OpenAI API klíč, poté jej uzamkněte'])
      return
    }
    setForm((f) => ({
      ...f,
      openaiApiKey: key,
      openaiApiKeyLocked: true,
    }))
    setAiKeySessionUnlocked(false)
    setErrors([])
    setToast('Klíč AI asistenta uložen a uzamčen')
  }

  const launchEventFlow = () => {
    if (!form.subscriptionPaid) {
      tapFeedback('alert')
      setErrors(['Bez uhrazeného předplatného nelze spustit EventFlow OS'])
      setStep(2)
      return
    }
    if (!form.openaiApiKeyLocked || !String(form.openaiApiKey || '').trim()) {
      tapFeedback('alert')
      setErrors(['Uzamkněte OpenAI API klíč přes „Uložit a uzamknout“'])
      return
    }
    tapFeedback('success')
    const pin = String(form.managerPin || '2580').replace(/\D/g, '').slice(0, 8)
    if (pin.length >= 4) setManagerPin(pin)
    completeOnboarding({
      ...form,
      openaiApiKey: form.openaiApiKey,
      openaiApiKeyLocked: true,
      onboardingCompleted: true,
      subscriptionPaid: true,
      registeredAt: new Date().toISOString(),
    })
    setToast('🚀 EventFlow OS spuštěn — vítejte v Dashboardu')
  }

  return (
    <div className="saas-onboarding">
      <div className="gradient-mesh" style={{ opacity: 0.35 }} />
      <div className="saas-onboarding-inner">
        <header className="saas-onboarding-head">
          <Logo size="md" />
          <div>
            <h1 className="gold-text" style={{ margin: 0, fontSize: '2rem' }}>
              EventFlow OS — Onboarding
            </h1>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
              Globální SaaS pipeline · Web · české účetnictví & gastro ERP
            </p>
          </div>
        </header>

        <nav className="saas-stepper" aria-label="Kroky onboarding">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`saas-step${step === s.id ? ' is-active' : ''}${
                step > s.id ? ' is-done' : ''
              }`}
              onClick={() => {
                if (s.id < step) goStep(s.id)
                if (s.id === 2 && form.subscriptionPaid) goStep(2)
              }}
            >
              <span className="saas-step-num">
                {step > s.id ? <Check size={14} /> : s.id}
              </span>
              <span className="saas-step-label">Krok {s.id}: {s.label}</span>
            </button>
          ))}
        </nav>

        {errors.length > 0 && (
          <div className="saas-errors" role="alert">
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="panel saas-step-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
          >
            {step === 1 && (
              <>
                <h2 className="saas-step-title">
                  <Shield size={20} color="#D4AF37" /> Krok 1 — Registrace & souhlas
                </h2>
                <p className="saas-step-sub">
                  Supabase Auth účet agentury. Všechna tří souhlasová pole musí zůstat
                  výchozí nezaškrtnutá — explicitní opt-in.
                </p>
                <div className="saas-form-grid">
                  <div>
                    <label className="label">E-mail (přihlášení)</label>
                    <input
                      className="input"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => set('email', e.target.value)}
                      placeholder="provozovna@firma.cz"
                    />
                  </div>
                  <div>
                    <label className="label">Kontaktní osoba</label>
                    <input
                      className="input"
                      value={form.contactPerson}
                      onChange={(e) => set('contactPerson', e.target.value)}
                      placeholder="Jan Novák"
                    />
                  </div>
                  <div>
                    <label className="label">Heslo</label>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="min. 6 znaků"
                    />
                  </div>
                  <div>
                    <label className="label">Heslo znovu</label>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                    />
                  </div>
                </div>

                <div className="saas-consent-box">
                  <label className="saas-check">
                    <input
                      type="checkbox"
                      checked={Boolean(form.vopAccepted)}
                      onChange={(e) => set('vopAccepted', e.target.checked)}
                    />
                    <span>
                      Souhlasím s{' '}
                      <button type="button" className="saas-link" onClick={() => setShowVop(true)}>
                        Všeobecnými obchodními podmínkami (VOP)
                      </button>
                    </span>
                  </label>
                  <label className="saas-check">
                    <input
                      type="checkbox"
                      checked={Boolean(form.gdprAccepted)}
                      onChange={(e) => set('gdprAccepted', e.target.checked)}
                    />
                    <span>
                      Souhlasím se zpracováním osobních údajů dle{' '}
                      <button type="button" className="saas-link" onClick={() => setShowGdpr(true)}>
                        GDPR
                      </button>
                    </span>
                  </label>
                  <label className="saas-check">
                    <input
                      type="checkbox"
                      checked={Boolean(form.llmDataProcessingAccepted)}
                      onChange={(e) =>
                        set('llmDataProcessingAccepted', e.target.checked)
                      }
                    />
                    <span>
                      Souhlasím s automatizovaným zpracováním provozních dat pomocí LLM
                      (AI Planner, Vision, Legal) — výstupy mají doporučující charakter.
                    </span>
                  </label>
                </div>

                <div className="saas-actions">
                  <button
                    type="button"
                    className="btn btn-gold"
                    style={{ minHeight: 52 }}
                    disabled={busy}
                    onClick={() => void validateStep1()}
                  >
                    {busy ? (
                      <>
                        <Loader2 size={16} className="spin" /> Registruji…
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} /> Pokračovat na předplatné
                      </>
                    )}
                  </button>
                  {authMode && (
                    <span className="badge badge-gold">
                      Auth: {authMode === 'supabase' ? 'Supabase' : 'Lokální'}
                    </span>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="saas-step-title">
                  <CreditCard size={20} color="#D4AF37" /> Krok 2 — Stripe Paywall
                </h2>
                <p className="saas-step-sub">
                  Vyberte tarif a klepněte na <strong>Aktivovat</strong>. Bez uhrazeného
                  předplatného zůstává EventFlow OS zamčený.
                </p>
                {!paid && (
                  <div className="saas-paywall-lock" role="status">
                    <Lock size={16} /> Přístup k ERP je zmražen do dokončení Stripe platby
                  </div>
                )}
                {paid && (
                  <div className="saas-paywall-ok" role="status">
                    <Check size={16} /> Tarif {form.subscription} aktivní · session{' '}
                    {form.stripeSessionId || '—'}
                  </div>
                )}

                <div className="pricing-tier-grid saas-pricing-grid">
                  {SUBSCRIPTION_PLANS.map((plan) => {
                    const active = form.subscription === plan.id && paid
                    const isUpgrade =
                      (TIER_RANK[plan.id] ?? 0) > (TIER_RANK[form.subscription] ?? 0)
                    return (
                      <motion.div
                        key={plan.id}
                        className="panel glass-glow pricing-tier-card"
                        whileHover={{ y: -4 }}
                        style={{
                          borderColor: active ? 'var(--gold)' : undefined,
                          boxShadow: active ? 'var(--shadow-gold)' : undefined,
                        }}
                      >
                        {plan.highlight && (
                          <div
                            className="badge badge-gold"
                            style={{ position: 'absolute', top: 12, right: 12 }}
                          >
                            <Crown size={10} /> Popular
                          </div>
                        )}
                        <div className="pricing-tier-body">
                          <div
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '1.4rem',
                              color: 'var(--gold)',
                            }}
                          >
                            {plan.name}
                          </div>
                          <div style={{ margin: '8px 0 16px' }}>
                            <span style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                              {formatCurrency(plan.price)}
                            </span>
                            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                              {' '}
                              / {plan.period}
                            </span>
                          </div>
                          <ul className="pricing-tier-features">
                            {plan.features.map((f) => (
                              <li
                                key={f}
                                style={{
                                  display: 'flex',
                                  gap: 8,
                                  fontSize: '0.82rem',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <Check
                                  size={14}
                                  color="var(--gold)"
                                  style={{ flexShrink: 0, marginTop: 2 }}
                                />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          type="button"
                          className={active ? 'btn btn-ghost' : 'btn btn-gold'}
                          style={{ width: '100%', marginTop: 'auto', minHeight: 48 }}
                          disabled={payBusy || active}
                          onClick={() => void activateTier(plan.id)}
                        >
                          {payBusy ? (
                            <>
                              <Loader2 size={14} className="spin" /> Stripe…
                            </>
                          ) : active ? (
                            'Aktivní'
                          ) : isUpgrade && paid ? (
                            'Upgrade'
                          ) : (
                            'Aktivovat'
                          )}
                        </button>
                      </motion.div>
                    )
                  })}
                </div>

                <div className="saas-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 48 }}
                    onClick={() => goStep(1)}
                  >
                    Zpět
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold"
                    style={{ minHeight: 52 }}
                    disabled={!paid}
                    onClick={validateStep2}
                  >
                    Pokračovat na provozovnu
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="saas-step-title">
                  <Building2 size={20} color="#D4AF37" /> Krok 3 — Nastavení provozovny
                </h2>
                <p className="saas-step-sub">
                  Firemní údaje s automatickým načtením z ARES (IČO). Bankovní účet a výchozí
                  provozní marže pro plánování.
                </p>

                <div className="saas-form-grid">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="label">IČO · ARES lookup</label>
                    <div className="saas-inline">
                      <input
                        className="input"
                        value={form.ico}
                        onChange={(e) =>
                          set('ico', e.target.value.replace(/\D/g, '').slice(0, 8))
                        }
                        placeholder="12345678"
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        className="btn btn-gold"
                        style={{ minHeight: 48 }}
                        disabled={aresBusy}
                        onClick={() => void runAres()}
                      >
                        {aresBusy ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Search size={15} />
                        )}
                        Načíst z ARES
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">Název společnosti / provozovny</label>
                    <input
                      className="input"
                      value={form.companyName}
                      onChange={(e) => set('companyName', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">DIČ</label>
                    <input
                      className="input"
                      value={form.dic}
                      onChange={(e) => set('dic', e.target.value)}
                      placeholder="CZ12345678"
                    />
                  </div>
                  <div>
                    <label className="label">Ulice</label>
                    <input
                      className="input"
                      value={form.street}
                      onChange={(e) => set('street', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Město</label>
                    <input
                      className="input"
                      value={form.city}
                      onChange={(e) => set('city', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">PSČ</label>
                    <input
                      className="input"
                      value={form.zip}
                      onChange={(e) => set('zip', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Telefon</label>
                    <input
                      className="input"
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Číslo účtu</label>
                    <input
                      className="input"
                      value={form.bankAccount}
                      onChange={(e) => set('bankAccount', e.target.value)}
                      placeholder="123456789/0100"
                    />
                  </div>
                  <div>
                    <label className="label">Kód banky</label>
                    <input
                      className="input"
                      value={form.bankCode}
                      onChange={(e) => set('bankCode', e.target.value)}
                      placeholder="0100"
                    />
                  </div>
                  <div>
                    <label className="label">IBAN</label>
                    <input
                      className="input"
                      value={form.iban}
                      onChange={(e) => set('iban', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Výchozí provozní marže (%)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={90}
                      value={form.defaultMarginPercent ?? 28}
                      onChange={(e) =>
                        set('defaultMarginPercent', Number(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Manažerský PIN (odemknutí AI / admin)</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={form.managerPin || ''}
                      onChange={(e) =>
                        set(
                          'managerPin',
                          e.target.value.replace(/\D/g, '').slice(0, 8),
                        )
                      }
                      placeholder="2580"
                    />
                  </div>
                </div>

                <div className="saas-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 48 }}
                    onClick={() => goStep(2)}
                  >
                    Zpět
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold"
                    style={{ minHeight: 52 }}
                    onClick={validateStep3}
                  >
                    Pokračovat na AI Engine
                  </button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="saas-step-title">
                  <KeyRound size={20} color="#D4AF37" /> Krok 4 — Secure AI Engine Lock
                </h2>
                <p className="saas-step-sub">
                  Vložte OpenAI API klíč provozovny a uzamkněte jej. Odemčení vyžaduje
                  Manažerský PIN (profil nebo demo <strong>1234</strong>).
                </p>

                <div className="ai-key-row" style={{ marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label className="label">OpenAI API klíč (gpt-4o-mini / Vision)</label>
                    <input
                      className="input"
                      type={keyLocked ? 'password' : 'text'}
                      autoComplete="off"
                      disabled={keyLocked}
                      readOnly={keyLocked}
                      value={keyLocked ? LOCKED_KEY_MASK : aiKeyDraft}
                      onChange={(e) => {
                        if (!keyLocked) setAiKeyDraft(e.target.value)
                      }}
                      placeholder="sk-…"
                    />
                  </div>
                  {keyLocked ? (
                    <button
                      type="button"
                      className="btn btn-ghost ai-key-unlock-btn"
                      style={{ minHeight: 48 }}
                      onClick={() => {
                        tapFeedback()
                        setUnlockPinOpen(true)
                      }}
                    >
                      <Unlock size={15} /> Odemknout
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-gold ai-key-lock-btn"
                      style={{ minHeight: 48 }}
                      onClick={handleLockAiKey}
                    >
                      <Lock size={15} /> 🔒 Uložit a uzamknout
                    </button>
                  )}
                </div>

                {form.openaiApiKeyLocked && !aiKeySessionUnlocked && (
                  <div className="ai-key-secured-badge" style={{ marginBottom: 18 }}>
                    🔒 AI Engine zabezpečen
                  </div>
                )}

                <div className="saas-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 48 }}
                    onClick={() => goStep(3)}
                  >
                    Zpět
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold"
                    style={{ minHeight: 56, fontWeight: 900, fontSize: '1.05rem' }}
                    onClick={launchEventFlow}
                  >
                    <Rocket size={18} /> 🚀 Spustit EventFlow OS
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Modal open={showVop} onClose={() => setShowVop(false)} title="Všeobecné obchodní podmínky">
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Kompletní VOP EventFlow SaaS. Předplatné, AI výstupy doporučujícího charakteru,
          odpovědnost uživatele za právní dokumenty, zrušení tarifu ke konci období.
        </p>
        <a href="./vop.pdf" download className="btn btn-gold">
          Stáhnout VOP PDF
        </a>
      </Modal>
      <Modal open={showGdpr} onClose={() => setShowGdpr(false)} title="GDPR — ochrana údajů">
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Zpracování IČO, DIČ, kontaktů, údajů personálu a klientů dle čl. 6 GDPR. Práva
          subjektů údajů, retence a zabezpečení provozních dat včetně LLM zpracování.
        </p>
        <a href="./gdpr.pdf" download className="btn btn-gold">
          Stáhnout GDPR PDF
        </a>
      </Modal>

      <ManagerPinKeypadModal
        open={unlockPinOpen}
        title="Zadejte Manažerský PIN pro úpravu klíče"
        subtitle="Odemčení AI Engine — PIN z nastavení provozovny nebo demo 1234."
        expectedPin={form.managerPin}
        confirmLabel="Odemknout klíč"
        onSuccess={() => {
          setUnlockPinOpen(false)
          setAiKeySessionUnlocked(true)
          setAiKeyDraft(String(form.openaiApiKey ?? ''))
          setToast('Klíč odemčen — po úpravě znovu uzamkněte')
        }}
        onCancel={() => setUnlockPinOpen(false)}
      />

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
