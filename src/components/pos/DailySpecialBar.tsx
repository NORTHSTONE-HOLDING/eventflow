import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChefHat, Loader2, Sparkles, Trash2, UtensilsCrossed } from 'lucide-react'
import { useDailySpecialStore } from '../../store/useDailySpecialStore'
import { useInventoryStore } from '../../store/useInventoryStore'
import { useAppStore } from '../../store/useAppStore'
import { formatCurrency } from '../../lib/documentIds'
import { formatCzechDate } from '../../lib/czechDate'
import { localCalendarDate } from '../../lib/dailySpecials'

const GOLD = '#D4AF37'

/**
 * „Zadat polední menu“ — AI/text pipeline for temporary lunch tiles.
 * Clears automatically after midnight; transaction logs remain in POS history.
 */
export function DailySpecialBar() {
  const inventory = useInventoryStore((s) => s.items)
  const specials = useDailySpecialStore((s) => s.specials)
  const addFromText = useDailySpecialStore((s) => s.addFromText)
  const removeSpecial = useDailySpecialStore((s) => s.removeSpecial)
  const clearToday = useDailySpecialStore((s) => s.clearToday)
  const setToast = useAppStore((s) => s.setToast)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const active = useMemo(() => {
    const today = localCalendarDate()
    return (specials ?? []).filter((s) => s.validDate === today)
  }, [specials])

  const submit = async () => {
    if (!text.trim()) {
      setToast('Zadejte text poledního menu, např. „Hovězí guláš za 165 Kč“')
      return
    }
    setBusy(true)
    try {
      const res = await addFromText(text, inventory)
      setToast(res.message)
      if (res.ok) setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="panel"
      style={{
        borderColor: `${GOLD}66`,
        background: 'linear-gradient(135deg, rgba(212,175,55,0.1), #0f172a 60%)',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <ChefHat size={18} color={GOLD} />
        <strong style={{ color: GOLD }}>Zadat polední menu</strong>
        <span
          title="Dočasné prodejní dlaždice s DPH 12 %. Po půlnoci zmizí z Kasy, prodeje zůstanou v historii."
          style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}
        >
          AI pipeline · DPH 12 % · platnost do půlnoci
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Např. „Hovězí guláš za 165 Kč“ nebo „Kuřecí steak 180g za 189 Kč“'
          title="Text nebo hlasový přepis — AI vytvoří dlaždici a napáruje suroviny (kg) ze skladu"
          style={{ minHeight: 48, background: '#020617', borderColor: '#334155' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-gold"
          style={{ minHeight: 48, fontWeight: 900, minWidth: 160 }}
          disabled={busy || !text.trim()}
          title="Vytvořit dočasnou dlaždici v Kase a napojit odepis surovin"
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          Přidat do Kasy
        </button>
      </div>

      <AnimatePresence>
        {active.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 12, display: 'grid', gap: 8 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}>
                Aktivní polední menu · {formatCzechDate(active[0]?.validDate)} · {active.length}×
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 40, color: '#fca5a5', borderColor: '#7f1d1d' }}
                title="Okamžitě odstranit dnešní polední dlaždice z Kasy (historie prodejů zůstane)"
                onClick={() => {
                  clearToday()
                  setToast('Polední menu vyčištěno z Kasy')
                }}
              >
                <Trash2 size={14} /> Vymazat dnešní
              </button>
            </div>
            {active.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '0.65rem 0.75rem',
                  borderRadius: 12,
                  border: `1px solid ${GOLD}44`,
                  background: 'rgba(2,6,23,0.65)',
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: '#fff',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <UtensilsCrossed size={14} color={GOLD} />
                    {s.name}
                    <span style={{ color: GOLD }}>{formatCurrency(s.sellPrice)}</span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        background: 'rgba(212,175,55,0.18)',
                        color: '#fef3c7',
                        borderRadius: 999,
                        padding: '0.12rem 0.45rem',
                        fontWeight: 800,
                      }}
                    >
                      DPH {s.vatRate} %
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: '#94a3b8',
                      marginTop: 4,
                      fontWeight: 600,
                    }}
                    title={s.recipeNote}
                  >
                    {s.recipeNote}
                  </div>
                </div>
                <button
                  type="button"
                  title="Odstranit tuto dlaždici z Kasy"
                  onClick={() => {
                    removeSpecial(s.id)
                    setToast(`Odstraněno: ${s.name}`)
                  }}
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    borderRadius: 12,
                    border: '1px solid #ef4444',
                    background: 'rgba(127,29,29,0.35)',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
