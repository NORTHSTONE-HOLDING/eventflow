interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
}

const SIZES: Record<'sm' | 'md' | 'lg', { box: number; text: string }> = {
  sm: { box: 28, text: 'text-lg' },
  md: { box: 36, text: 'text-2xl' },
  lg: { box: 52, text: 'text-4xl' },
}

export function Logo({ size = 'md' }: LogoProps) {
  const s = SIZES[size]
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 shadow-gold"
        style={{ width: s.box, height: s.box }}
      >
        <span className="font-display font-bold text-slate-950" style={{ fontSize: s.box * 0.5 }}>
          E
        </span>
      </div>
      <span className={`font-display font-semibold tracking-tight text-white ${s.text}`}>
        Event<span className="text-gold">Flow</span>
      </span>
    </div>
  )
}
