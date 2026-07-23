import { motion } from 'framer-motion'
import { Logo } from './Logo'
import { useAppStore } from '../store/useAppStore'
import { Utensils, Wallet, Calendar, Sparkles } from 'lucide-react'

const CARDS = [
  { title: 'Catering', desc: 'Receptury, alergeny, inventář', icon: Utensils, delay: 0 },
  { title: 'Budget', desc: 'DPH, marže, food cost', icon: Wallet, delay: 0.15 },
  { title: 'Schedule', desc: 'Drag & drop harmonogram', icon: Calendar, delay: 0.3 },
  { title: 'AI Planner', desc: 'Český prompt → celá akce', icon: Sparkles, delay: 0.45 },
]

export function HeroScreen() {
  const dismissHero = useAppStore((s) => s.dismissHero)
  const setView = useAppStore((s) => s.setView)

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        overflow: 'hidden',
      }}
    >
      <div className="gradient-mesh" />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 30%, transparent 0%, var(--bg-deep) 70%)',
          zIndex: 1,
        }}
      />

      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 960 }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}
        >
          <Logo size="xl" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            color: 'var(--gold)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontSize: '0.8rem',
            marginBottom: '1rem',
          }}
        >
          The AI Operating System for Events
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          className="gold-text"
          style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            lineHeight: 1.1,
            marginBottom: '1.25rem',
            fontWeight: 600,
          }}
        >
          AI Event Operating System
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          style={{
            color: 'var(--text-muted)',
            fontSize: '1.15rem',
            maxWidth: 560,
            margin: '0 auto 2.5rem',
          }}
        >
          Plánujte, rozpočítávejte a automatizujte eventy v prémiovém workspace inspirovaném Linear a Raycast.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3.5rem' }}
        >
          <button className="btn btn-gold" onClick={dismissHero} style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}>
            Vstoupit do EventFlow
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              dismissHero()
              setView('profile')
            }}
          >
            Registrace agentury
          </button>
        </motion.div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          {CARDS.map((card, i) => {
            const Icon = card.icon
            return (
              <motion.button
                key={card.title}
                type="button"
                className="glass glass-glow"
                onClick={() => {
                  dismissHero()
                  setView(i === 3 ? 'planner' : 'dashboard')
                }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + card.delay, duration: 0.5 }}
                style={{
                  padding: '1.25rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  animation: `floatCard ${4 + i * 0.6}s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                  color: 'inherit',
                }}
              >
                <Icon size={22} color="var(--gold)" style={{ marginBottom: 10 }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: 4 }}>
                  {card.title}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{card.desc}</div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
