import { motion } from 'framer-motion'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showWordmark?: boolean
}

const sizes = { sm: 28, md: 40, lg: 64, xl: 96 }

export function Logo({ size = 'md', showWordmark = true }: LogoProps) {
  const s = sizes[size]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'xl' ? 16 : 10 }}>
      <motion.svg
        width={s}
        height={s}
        viewBox="0 0 64 64"
        fill="none"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        aria-label="EventFlow logo"
      >
        <rect width="64" height="64" rx="14" fill="#0B0F14" stroke="#D4AF37" strokeWidth="1.5" />
        <path
          d="M16 14h32v5.5H24.5v9H44v5.5H24.5v14.5H16V14z"
          fill="#D4AF37"
        />
        <motion.path
          d="M48 8l1.5 4.5L54 14l-4.5 1.5L48 20l-1.5-4.5L42 14l4.5-1.5L48 8z"
          fill="#E8C86A"
          animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
          style={{ transformOrigin: '48px 14px' }}
        />
      </motion.svg>
      {showWordmark && (
        <div>
          <div
            className="gold-text"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: size === 'xl' ? '2.5rem' : size === 'lg' ? '1.75rem' : '1.15rem',
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '0.04em',
            }}
          >
            EventFlow
          </div>
          {size !== 'sm' && (
            <div
              style={{
                fontSize: size === 'xl' ? '0.85rem' : '0.65rem',
                color: 'var(--text-muted)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              Plan. Budget. Cater. Automate.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
