import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { PRICING_PLANS } from '../../lib/constants'
import { formatCZK } from '../../lib/format'
import { lookupAres } from '../../lib/ares'
import { PinGate } from '../common/PinGate'
import { Logo } from '../layout/Logo'
import type { Consents } from '../../lib/types'

const STEP_LABELS = ['Účet', 'Tarif', 'Firma', 'AI klíč']

function StepDots({ index }: { index: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-3">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              i <= index ? 'bg-gold text-slate-950' : 'bg-slate-800 text-slate-500'
            }`}
          >
            {i + 1}
          </div>
          <span className={`hidden text-sm sm:inline ${i <= index ? 'text-white' : 'text-slate-500'}`}>
            {label}
          </span>
          {i < STEP_LABELS.length - 1 && <span className="text-slate-700">—</span>}
        </div>
      ))}
    </div>
  )
}

function AuthStep() {
  const signIn = useAuthStore((s) => s.signIn)
  const consents = useAuthStore((s) => s.consents)
  const setConsent = useAuthStore((s) => s.setConsent)
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const allConsented = consents.gdpr && consents.vop && consents.llm
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  const canSubmit = emailValid && password.length >= 4 && allConsented

  const checks: { key: keyof Consents; label: string }[] = [
    { key: 'gdpr', label: 'Souhlasím se zpracováním osobních údajů dle GDPR.' },
    { key: 'vop', label: 'Přečetl/a jsem a přijímám Všeobecné obchodní podmínky (VOP).' },
    { key: 'llm', label: 'Souhlasím se zpracováním dat pomocí AI / LLM modelů.' },
  ]

  return (
    <div className="animate-fadeUp">
      <div className="mb-6 flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            mode === 'signin' ? 'bg-gold text-slate-950' : 'text-slate-400'
          }`}
        >
          Přihlášení
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            mode === 'signup' ? 'bg-gold text-slate-950' : 'text-slate-400'
          }`}
        >
          Registrace
        </button>
      </div>

      <label className="label">Pracovní e-mail</label>
      <input
        className="input mb-4"
        type="email"
        placeholder="jmeno@agentura.cz"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="label">Heslo</label>
      <input
        className="input mb-5"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className="mb-6 space-y-3">
        {checks.map((c) => (
          <label key={c.key} className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={consents[c.key]}
              onChange={(e) => setConsent(c.key, e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-gold"
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => signIn(email)}
        className="btn btn-gold w-full disabled:cursor-not-allowed disabled:opacity-40"
      >
        {mode === 'signup' ? 'Vytvořit účet a pokračovat' : 'Přihlásit se'} →
      </button>
      {!allConsented && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Pro pokračování je nutné potvrdit všechny tři souhlasy.
        </p>
      )}
    </div>
  )
}

function PaywallStep() {
  const choosePlan = useAuthStore((s) => s.choosePlan)
  return (
    <div className="animate-fadeUp">
      <p className="mb-6 text-center text-slate-400">
        Vyberte tarif. Všechny plány zahrnují 14denní bezplatnou zkušební verzi.
      </p>
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-4">
        {PRICING_PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-2xl border p-5 transition-all hover:-translate-y-1 ${
              plan.highlight
                ? 'border-gold bg-gradient-to-b from-gold/10 to-slate-900/60 shadow-gold'
                : 'border-slate-800 bg-slate-900/60 hover:border-blue-400/50 hover:shadow-glow'
            }`}
          >
            {plan.highlight && (
              <span className="badge badge-gold mb-2 self-start">Nejoblíbenější</span>
            )}
            <h3 className="font-display text-2xl text-white">{plan.name}</h3>
            <p className="mt-1 text-xs text-slate-400">{plan.tagline}</p>
            <div className="my-4">
              <span className="text-3xl font-bold text-gold">{formatCZK(plan.price)}</span>
              <span className="ml-1 text-xs text-slate-500">/ měsíc</span>
            </div>
            <ul className="mb-5 flex-1 space-y-2 text-sm text-slate-300">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-gold">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => choosePlan(plan.id)}
              className={`btn mt-auto w-full ${plan.highlight ? 'btn-gold' : 'btn-ghost'}`}
            >
              Vybrat {plan.name}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompanyStep() {
  const company = useAuthStore((s) => s.company)
  const setCompany = useAuthStore((s) => s.setCompany)
  const confirmCompany = useAuthStore((s) => s.confirmCompany)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const fetchAres = async () => {
    setLoading(true)
    setNote(null)
    try {
      const r = await lookupAres(company.ico)
      setCompany({
        companyName: r.companyName,
        dic: r.dic,
        address: r.address,
        city: r.city,
        zip: r.zip,
        vatPayer: r.vatPayer,
      })
      setNote(
        r.source === 'ares'
          ? '✅ Údaje načteny živě z registru ARES.'
          : 'ℹ️ ARES není dostupný (offline/CORS) — použita lokální simulace.',
      )
    } catch (e) {
      setNote(`⚠️ ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const canContinue = company.companyName.trim().length > 1 && /^\d{8}$/.test(company.ico)

  return (
    <div className="animate-fadeUp space-y-4">
      <p className="text-center text-slate-400">
        Zadejte IČO a načtěte fakturační údaje z českého registru ARES.
      </p>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label">IČO</label>
          <input
            className="input"
            inputMode="numeric"
            placeholder="např. 27604977"
            value={company.ico}
            onChange={(e) => setCompany({ ico: e.target.value.replace(/\D/g, '').slice(0, 8) })}
          />
        </div>
        <button
          type="button"
          onClick={fetchAres}
          disabled={loading || company.ico.length !== 8}
          className="btn btn-gold mt-6 shrink-0 disabled:opacity-40"
        >
          {loading ? 'Načítám…' : '🔎 Načíst z ARES'}
        </button>
      </div>
      {note && <p className="text-sm text-slate-300">{note}</p>}

      <div>
        <label className="label">Název společnosti</label>
        <input
          className="input"
          value={company.companyName}
          onChange={(e) => setCompany({ companyName: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">DIČ</label>
          <input
            className="input"
            value={company.dic}
            onChange={(e) => setCompany({ dic: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Plátce DPH</label>
          <select
            className="input"
            value={company.vatPayer ? 'yes' : 'no'}
            onChange={(e) => setCompany({ vatPayer: e.target.value === 'yes' })}
          >
            <option value="yes">Plátce DPH</option>
            <option value="no">Neplátce DPH</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Adresa sídla</label>
        <input
          className="input"
          value={company.address}
          onChange={(e) => setCompany({ address: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Město</label>
          <input
            className="input"
            value={company.city}
            onChange={(e) => setCompany({ city: e.target.value })}
          />
        </div>
        <div>
          <label className="label">PSČ</label>
          <input
            className="input"
            value={company.zip}
            onChange={(e) => setCompany({ zip: e.target.value })}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={!canContinue}
        onClick={confirmCompany}
        className="btn btn-gold w-full disabled:opacity-40"
      >
        Pokračovat na zabezpečení AI →
      </button>
    </div>
  )
}

function AiKeyStep() {
  const aiKey = useAuthStore((s) => s.aiKey)
  const setAiKey = useAuthStore((s) => s.setAiKey)
  const keyLocked = useAuthStore((s) => s.keyLocked)
  const lockKey = useAuthStore((s) => s.lockKey)
  const unlockKey = useAuthStore((s) => s.unlockKey)
  const finishOnboarding = useAuthStore((s) => s.finishOnboarding)
  const [pinOpen, setPinOpen] = useState(false)

  return (
    <div className="animate-fadeUp space-y-5">
      <p className="text-center text-slate-400">
        Vložte svůj OpenAI API klíč. Po uzamčení se maskuje a je chráněn manažerským PINem.
      </p>
      <div>
        <label className="label">OpenAI API klíč</label>
        <input
          className="input font-mono"
          type={keyLocked ? 'password' : 'text'}
          value={keyLocked ? '••••••••••••••••••••' : aiKey}
          disabled={keyLocked}
          placeholder="sk-..."
          onChange={(e) => setAiKey(e.target.value)}
        />
      </div>

      {keyLocked ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300">
          <span>🔒 Klíč je uzamčen a zabezpečen.</span>
          <button type="button" onClick={() => setPinOpen(true)} className="btn btn-ghost">
            Odemknout (PIN)
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!aiKey.trim()}
          onClick={lockKey}
          className="btn btn-gold w-full disabled:opacity-40"
        >
          🔒 Uložit a uzamknout
        </button>
      )}

      <button
        type="button"
        onClick={finishOnboarding}
        className="btn btn-ghost w-full"
      >
        {aiKey.trim() ? 'Dokončit a spustit EventFlow →' : 'Přeskočit (offline AI simulace) →'}
      </button>

      <PinGate
        open={pinOpen}
        reason="Odemčení AI klíče vyžaduje manažerský PIN."
        onClose={() => setPinOpen(false)}
        onSuccess={() => {
          unlockKey()
          setPinOpen(false)
        }}
      />
    </div>
  )
}

export function OnboardingWizard() {
  const step = useAuthStore((s) => s.step)
  const stepIndex = step === 'auth' ? 0 : step === 'paywall' ? 1 : step === 'company' ? 2 : 3
  const wide = step === 'paywall'

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-md'}`}>
        <div className="mb-8 flex flex-col items-center">
          <Logo size="lg" />
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-gold">
            The AI Event Operating System
          </p>
        </div>
        <div className="card p-6 sm:p-8">
          <StepDots index={stepIndex} />
          {step === 'auth' && <AuthStep />}
          {step === 'paywall' && <PaywallStep />}
          {step === 'company' && <CompanyStep />}
          {step === 'aikey' && <AiKeyStep />}
        </div>
      </div>
    </div>
  )
}
