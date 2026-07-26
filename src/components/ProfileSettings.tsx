import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Crown, Lock, Shield, Unlock } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useStaffLockStore } from '../store/useStaffLockStore'
import { SUBSCRIPTION_PLANS } from '../lib/subscriptions'
import { Modal } from './Modal'
import { ManagerPinKeypadModal } from './staff-terminal/ManagerPinKeypadModal'
import { tapFeedback } from '../lib/touchFeedback'
import type { AgencyProfile, SubscriptionTier } from '../types'
import { formatCurrency } from '../lib/documentIds'
import { formatCzechDate } from '../lib/czechDate'

/** Display-only mask — never bind the live key into a locked input. */
const LOCKED_KEY_MASK = '••••••••••••••••••••••••'

export function ProfileSettings() {
  const profile = useAppStore((s) => s.profile)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const registerAgency = useAppStore((s) => s.registerAgency)
  const setSubscription = useAppStore((s) => s.setSubscription)
  const setToast = useAppStore((s) => s.setToast)

  const [form, setForm] = useState<AgencyProfile>({ ...profile })
  const [showVop, setShowVop] = useState(false)
  const [showGdpr, setShowGdpr] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  /** Session unlock after Manager PIN — allows editing until lock again. */
  const [aiKeySessionUnlocked, setAiKeySessionUnlocked] = useState(false)
  const [aiKeyDraft, setAiKeyDraft] = useState(() => String(profile.openaiApiKey ?? ''))
  const [unlockPinOpen, setUnlockPinOpen] = useState(false)

  const keyLocked = Boolean(form.openaiApiKeyLocked) && !aiKeySessionUnlocked
  const hasStoredKey = Boolean(String(form.openaiApiKey || '').trim())

  useEffect(() => {
    setForm({ ...profile })
    if (!aiKeySessionUnlocked) {
      setAiKeyDraft(String(profile.openaiApiKey ?? ''))
    }
  }, [profile, aiKeySessionUnlocked])

  const set = (
    key: keyof AgencyProfile,
    value: string | boolean | SubscriptionTier | null,
  ) => setForm((f) => ({ ...f, [key]: value }))

  const handleRegister = () => {
    const errs: string[] = []
    if (!form.companyName.trim()) errs.push('Vyplňte název společnosti')
    if (!form.ico.trim()) errs.push('Vyplňte IČO')
    if (!form.email.trim()) errs.push('Vyplňte e-mail')
    if (!form.vopAccepted) errs.push('Musíte souhlasit s VOP')
    if (!form.gdprAccepted) errs.push('Musíte souhlasit s GDPR')
    setErrors(errs)
    if (errs.length) return
    registerAgency(form)
    setToast('Agentura úspěšně registrována')
  }

  const setManagerPin = useStaffLockStore((s) => s.setManagerPin)

  const handleSave = () => {
    const next = {
      ...form,
      openaiApiKey: keyLocked ? form.openaiApiKey : aiKeyDraft.trim(),
    }
    updateProfile(next)
    setForm(next)
    if (next.managerPin) setManagerPin(next.managerPin)
    setToast('Profil uložen — údaje se autofillují do hlaviček dokumentů')
  }

  const handleLockAiKey = () => {
    tapFeedback('success')
    const key = aiKeyDraft.trim()
    if (!key) {
      tapFeedback('alert')
      setToast('Nejdříve vložte klíč AI asistenta, poté jej uzamkněte')
      return
    }
    const next: AgencyProfile = {
      ...form,
      openaiApiKey: key,
      openaiApiKeyLocked: true,
    }
    updateProfile(next)
    setForm(next)
    setAiKeyDraft(key)
    setAiKeySessionUnlocked(false)
    setToast('Klíč AI asistenta uložen a uzamčen')
  }

  const requestUnlockAiKey = () => {
    tapFeedback()
    setUnlockPinOpen(true)
  }

  const onUnlockPinSuccess = () => {
    setUnlockPinOpen(false)
    setAiKeySessionUnlocked(true)
    setAiKeyDraft(String(form.openaiApiKey ?? ''))
    setToast('Klíč odemčen — můžete jej upravit. Po úpravě znovu uzamkněte.')
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease', maxWidth: 960 }}>
      <h1 className="section-title gold-text">Profil & předplatné</h1>
      <p className="section-sub">
        Firemní údaje agentury se automaticky vyplní do nabídek, smluv a faktur.
      </p>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: 16 }}>Firemní údaje</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {(
            [
              ['companyName', 'Název společnosti'],
              ['contactPerson', 'Kontaktní osoba'],
              ['ico', 'IČO'],
              ['dic', 'DIČ'],
              ['street', 'Ulice'],
              ['city', 'Město'],
              ['zip', 'PSČ'],
              ['phone', 'Telefon'],
              ['email', 'E-mail'],
              ['bankAccount', 'Číslo účtu'],
              ['bankCode', 'Kód banky'],
              ['iban', 'IBAN'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ gridColumn: key === 'companyName' || key === 'email' ? 'span 2' : undefined }}>
              <label className="label">{label}</label>
              <input
                className="input"
                value={String(form[key] ?? '')}
                onChange={(e) => set(key, e.target.value)}
                placeholder={label}
              />
            </div>
          ))}
        </div>

        {!profile.registeredAt && (
          <div
            style={{
              marginTop: 20,
              padding: 16,
              background: 'var(--bg-elevated)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          >
            <h4 style={{ marginBottom: 12, fontSize: '1rem' }}>Souhlasy pro registraci</h4>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.vopAccepted}
                onChange={(e) => set('vopAccepted', e.target.checked)}
                style={{ marginTop: 4, accentColor: 'var(--gold)' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Souhlasím s{' '}
                <button type="button" onClick={() => setShowVop(true)} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', textDecoration: 'underline' }}>
                  VOP
                </button>{' '}
                <a href="/vop.pdf" download>(stáhnout PDF)</a>
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.gdprAccepted}
                onChange={(e) => set('gdprAccepted', e.target.checked)}
                style={{ marginTop: 4, accentColor: 'var(--gold)' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Souhlasím se zpracováním osobních údajů dle{' '}
                <button type="button" onClick={() => setShowGdpr(true)} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', textDecoration: 'underline' }}>
                  GDPR
                </button>{' '}
                <a href="/gdpr.pdf" download>(stáhnout PDF)</a>
              </span>
            </label>
            {errors.length > 0 && (
              <ul style={{ color: '#fca5a5', fontSize: '0.85rem', marginBottom: 12, paddingLeft: 18 }}>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <label className="label">Manager PIN (odemknutí Admin Dashboardu z /pos-terminal)</label>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            value={String(form.managerPin ?? '2580')}
            onChange={(e) => set('managerPin', e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="2580"
            style={{ maxWidth: 220, minHeight: 48, letterSpacing: '0.25em', fontWeight: 800 }}
          />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 6 }}>
            Personál na terminálu nemůže opustit kasu bez tohoto PIN (výchozí 2580).
          </p>
        </div>

        <div
          className="panel ai-key-vault"
          style={{
            marginTop: 24,
            padding: '1.1rem 1.15rem',
            borderColor: keyLocked
              ? 'rgba(34,197,94,0.45)'
              : 'rgba(212,175,55,0.45)',
            background: keyLocked
              ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(15,23,42,0.92))'
              : 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(15,23,42,0.9))',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <Shield size={18} color="#D4AF37" />
            <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#D4AF37' }}>
              AI asistent provozovny
            </h4>
            {keyLocked && hasStoredKey && (
              <span className="ai-key-secured-badge" role="status">
                🔒 AI Engine zabezpečen
              </span>
            )}
          </div>
          <label className="label" htmlFor="openai-api-key">
            Klíč k AI asistentovi (OpenAI API Key)
          </label>
          <div className="ai-key-row">
            <input
              id="openai-api-key"
              className="input"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              disabled={keyLocked}
              readOnly={keyLocked}
              value={keyLocked ? LOCKED_KEY_MASK : aiKeyDraft}
              onChange={(e) => {
                if (keyLocked) return
                setAiKeyDraft(e.target.value)
              }}
              placeholder="sk-…"
              aria-label="Klíč k AI asistentovi"
              style={{
                minHeight: 52,
                flex: 1,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                letterSpacing: keyLocked ? '0.18em' : '0.04em',
                opacity: keyLocked ? 0.85 : 1,
                cursor: keyLocked ? 'not-allowed' : 'text',
              }}
            />
            {keyLocked ? (
              <button
                type="button"
                className="btn btn-gold ai-key-unlock-btn"
                onClick={requestUnlockAiKey}
                title="Odemknout klíč Manažerským PINem"
                aria-label="Odemknout"
              >
                <Unlock size={16} /> 🔓 Odemknout
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-gold ai-key-lock-btn"
                onClick={handleLockAiKey}
                style={{ fontWeight: 900, minHeight: 52 }}
              >
                <Lock size={16} /> 🔒 Uložit a uzamknout
              </button>
            )}
          </div>
          <p
            title="Klíč je v rozhraní maskovaný a slouží výhradně této provozovně."
            style={{
              fontSize: '0.82rem',
              color: '#fde68a',
              marginTop: 8,
              marginBottom: 0,
              lineHeight: 1.45,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <Lock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              🔒 Klíč přidělený správcem platformy EventFlow pro sledování individuální spotřeby
              vaší provozovny.
              {keyLocked
                ? ' Plaintext klíče není zobrazen — úprava vyžaduje Manažerský PIN.'
                : hasStoredKey || aiKeyDraft.trim()
                  ? ' Po uložení klíč uzamkněte, aby jej personál nemohl číst.'
                  : ' Klíč zatím není nastaven — AI poběží v simulačním režimu.'}
            </span>
          </p>
        </div>

        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gap: 14,
          }}
        >
          <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--gold)' }}>
            Branding tiskových lístků
          </h4>
          <div>
            <label className="label">Podtitulek menu (pod názvem provozovny)</label>
            <input
              className="input"
              value={String(form.menuSubtitle ?? '')}
              onChange={(e) => set('menuSubtitle', e.target.value)}
              placeholder="např. Fine dining · Praha 1"
            />
          </div>
          <div>
            <label className="label">Logo URL (https nebo data URL)</label>
            <input
              className="input"
              value={String(form.logoUrl ?? '')}
              onChange={(e) => set('logoUrl', e.target.value || null)}
              placeholder="https://…/logo.png"
            />
            {form.logoUrl ? (
              <img
                src={String(form.logoUrl)}
                alt="Logo náhled"
                style={{
                  marginTop: 10,
                  maxHeight: 64,
                  objectFit: 'contain',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  padding: 6,
                }}
              />
            ) : null}
          </div>
          <div>
            <label className="label">Uvítací text pro uzavřenou akci</label>
            <textarea
              className="input"
              rows={3}
              value={String(form.eventWelcomeMessage ?? '')}
              onChange={(e) => set('eventWelcomeMessage', e.target.value)}
              placeholder="Vážení hosté, vítejte na naší svatbě…"
              style={{ resize: 'vertical', minHeight: 80 }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(form.showEventPrices)}
              onChange={(e) => set('showEventPrices', e.target.checked)}
              style={{ accentColor: 'var(--gold)' }}
            />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Zobrazit ceny i v režimu uzavřené akce (jinak se skryjí)
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {profile.registeredAt ? (
            <button className="btn btn-gold" onClick={handleSave}>
              Uložit profil
            </button>
          ) : (
            <button className="btn btn-gold" onClick={handleRegister}>
              Registrovat agenturu
            </button>
          )}
          {profile.registeredAt && (
            <span className="badge badge-success" style={{ alignSelf: 'center' }}>
              Registrováno {formatCzechDate(profile.registeredAt)}
            </span>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: '1.35rem', marginBottom: 8 }}>Předplatné — 4 úrovně</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
        Otestujte gating funkcí změnou tarifu. Aktivní: <span className="badge badge-gold">{form.subscription}</span>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {SUBSCRIPTION_PLANS.map((plan) => {
          const active = form.subscription === plan.id
          return (
            <motion.div
              key={plan.id}
              className="panel glass-glow"
              whileHover={{ y: -4 }}
              style={{
                position: 'relative',
                borderColor: active ? 'var(--gold)' : undefined,
                boxShadow: active ? 'var(--shadow-gold)' : undefined,
              }}
            >
              {plan.highlight && (
                <div className="badge badge-gold" style={{ position: 'absolute', top: 12, right: 12 }}>
                  <Crown size={10} /> Popular
                </div>
              )}
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--gold)' }}>
                {plan.name}
              </div>
              <div style={{ margin: '8px 0 16px' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 600 }}>{formatCurrency(plan.price)}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}> / {plan.period}</span>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: 'flex', gap: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <Check size={14} color="var(--gold)" style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={active ? 'btn btn-ghost' : 'btn btn-gold'}
                style={{ width: '100%' }}
                onClick={() => {
                  set('subscription', plan.id)
                  setSubscription(plan.id)
                  updateProfile({ subscription: plan.id })
                  setToast(`Tarif ${plan.name} aktivován`)
                }}
                disabled={active}
              >
                {active ? 'Aktivní' : 'Vybrat'}
              </button>
            </motion.div>
          )
        })}
      </div>

      <div className="panel" style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Lock size={18} color="var(--gold)" />
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Feature gating: WhatsApp Staff = TEAM+, Event POS / Kasa = BUSINESS+,
          AI Vision Photo Scan & Print PDF = ENTERPRISE, AI Scanner / Legal / Portal = BUSINESS+.
        </div>
      </div>

      <Modal open={showVop} onClose={() => setShowVop(false)} title="Všeobecné obchodní podmínky">
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Kompletní VOP EventFlow SaaS. Předplatné, AI výstupy doporučujícího charakteru, odpovědnost
          uživatele za právní dokumenty, zrušení tarifu ke konci období.
        </p>
        <a href="/vop.pdf" download className="btn btn-gold">Stáhnout VOP PDF</a>
      </Modal>
      <Modal open={showGdpr} onClose={() => setShowGdpr(false)} title="GDPR — ochrana údajů">
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Zpracování IČO, DIČ, kontaktů, údajů personálu a klientů dle čl. 6 GDPR. Práva subjektů
          na privacy@eventflow.cz.
        </p>
        <a href="/gdpr.pdf" download className="btn btn-gold">Stáhnout GDPR PDF</a>
      </Modal>

      <ManagerPinKeypadModal
        open={unlockPinOpen}
        title="Zadejte Manažerský PIN pro úpravu klíče"
        subtitle="Úprava klíče AI asistenta je chráněna. Plaintext klíče smí zobrazit pouze vedoucí s platným Manažerským PINem."
        expectedPin={form.managerPin || profile.managerPin}
        confirmLabel="Odemknout klíč"
        onSuccess={onUnlockPinSuccess}
        onCancel={() => {
          tapFeedback()
          setUnlockPinOpen(false)
        }}
      />
    </div>
  )
}
