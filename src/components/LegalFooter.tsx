import { useState } from 'react'
import { Modal } from './Modal'

export function LegalFooter() {
  const [modal, setModal] = useState<'vop' | 'gdpr' | null>(null)

  return (
    <>
      <footer
        className="no-print"
        style={{
          borderTop: '1px solid var(--border)',
          padding: '1.5rem 2rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--text-dim)',
          fontSize: '0.8rem',
          background: 'var(--bg-base)',
        }}
      >
        <div>
          © 2026 EventFlow — The AI Operating System for Events. Všechna práva vyhrazena.
        </div>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <button
            type="button"
            onClick={() => setModal('vop')}
            style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            VOP
          </button>
          <button
            type="button"
            onClick={() => setModal('gdpr')}
            style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            GDPR
          </button>
          <a href="/vop.pdf" download style={{ color: 'var(--text-muted)' }}>
            Stáhnout VOP (PDF)
          </a>
          <a href="/gdpr.pdf" download style={{ color: 'var(--text-muted)' }}>
            Stáhnout GDPR (PDF)
          </a>
        </div>
      </footer>

      <Modal open={modal === 'vop'} onClose={() => setModal(null)} title="Všeobecné obchodní podmínky">
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>
          <p style={{ marginBottom: '1rem' }}>
            1. EventFlow poskytuje SaaS platformu pro plánování a provoz eventů. Používáním služby
            souhlasíte s těmito podmínkami.
          </p>
          <p style={{ marginBottom: '1rem' }}>
            2. Předplatné se účtuje měsíčně dle zvoleného tarifu (LITE / TEAM / BUSINESS / ENTERPRISE).
            Zrušení je možné kdykoli ke konci zúčtovacího období.
          </p>
          <p style={{ marginBottom: '1rem' }}>
            3. AI výstupy (plány, audity, skeny) mají doporučující charakter. Za finální rozhodnutí
            a právní dokumenty odpovídá uživatel.
          </p>
          <p style={{ marginBottom: '1rem' }}>
            4. Data agentury a klientů jsou zpracována dle GDPR. Enterprise tarif zahrnuje full
            Supabase backup.
          </p>
          <p>
            5. Kontakt: legal@eventflow.cz · IČO bude doplněno z profilu agentury.
          </p>
          <a
            href="/vop.pdf"
            download
            className="btn btn-gold"
            style={{ marginTop: '1.5rem', display: 'inline-flex' }}
          >
            Stáhnout VOP PDF
          </a>
        </div>
      </Modal>

      <Modal open={modal === 'gdpr'} onClose={() => setModal(null)} title="Zásady ochrany osobních údajů (GDPR)">
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>
          <p style={{ marginBottom: '1rem' }}>
            Správce: EventFlow. Zpracováváme údaje nezbytné pro provoz služby — kontaktní údaje,
            firemní identifikátory (IČO, DIČ), údaje o akcích a personálu.
          </p>
          <p style={{ marginBottom: '1rem' }}>
            Právní základ: plnění smlouvy (čl. 6 odst. 1 písm. b GDPR) a oprávněný zájem.
          </p>
          <p style={{ marginBottom: '1rem' }}>
            Máte právo na přístup, opravu, výmaz, omezení zpracování a přenositelnost. Námitky
            zasílejte na privacy@eventflow.cz.
          </p>
          <p>
            Údaje nejsou prodávány třetím stranám. WhatsApp sdílení probíhá na vaši aktivní akci.
          </p>
          <a
            href="/gdpr.pdf"
            download
            className="btn btn-gold"
            style={{ marginTop: '1.5rem', display: 'inline-flex' }}
          >
            Stáhnout GDPR PDF
          </a>
        </div>
      </Modal>
    </>
  )
}
