import { Loader2, Martini, Package, UtensilsCrossed } from 'lucide-react'
import type { CateringItem } from '../../types'
import { formatCurrency } from '../../lib/documentIds'

const GOLD = '#D4AF37'

function CategoryIcon({ category }: { category: string }) {
  const c = (category || '').toLowerCase()
  if (c === 'beverage' || c.includes('pit') || c.includes('drink')) {
    return <Martini size={42} color={GOLD} strokeWidth={1.35} />
  }
  if (c === 'food' || c === 'raw' || c.includes('jid') || c.includes('jíd')) {
    return <UtensilsCrossed size={42} color={GOLD} strokeWidth={1.35} />
  }
  return <Package size={42} color={GOLD} strokeWidth={1.35} />
}

export function PosProductTile({
  item,
  imageUrl,
  isFetching,
  lowStock,
  onAdd,
}: {
  item: CateringItem
  imageUrl: string | null
  isFetching: boolean
  lowStock?: boolean
  onAdd: () => void
}) {
  const sold = item.soldPortions || 0
  const planned = item.plannedPortions || item.portion || 1
  const showPlaceholder = !imageUrl

  return (
    <button
      type="button"
      onClick={onAdd}
      className="pos-item-card"
      style={{
        minHeight: 168,
        minWidth: 44,
        padding: 0,
        background: '#0f172a',
        border: `1px solid ${lowStock ? 'rgba(239,68,68,0.65)' : 'rgba(212,175,55,0.35)'}`,
        borderRadius: 16,
        cursor: 'pointer',
        textAlign: 'left',
        color: '#fff',
        position: 'relative',
        touchAction: 'manipulation',
        boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={item.name}
          loading="lazy"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
          }}
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            background:
              'radial-gradient(circle at 30% 20%, #1e293b 0%, #020617 70%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 12,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              border: `1.5px solid ${GOLD}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15,23,42,0.65)',
              boxShadow: `0 0 0 1px rgba(212,175,55,0.15) inset`,
            }}
          >
            <CategoryIcon category={item.category} />
          </div>
          <div
            style={{
              fontSize: '0.72rem',
              color: '#cbd5e1',
              fontWeight: 700,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {(isFetching || showPlaceholder) && (
              <Loader2 className="spin" size={12} color={GOLD} />
            )}
            AI vyhledává foto...
          </div>
        </div>
      )}

      {imageUrl && isFetching && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            background: 'rgba(2,6,23,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#fef3c7',
            fontWeight: 700,
            fontSize: '0.78rem',
          }}
        >
          <Loader2 className="spin" size={16} color={GOLD} />
          AI vyhledává produktové foto...
        </div>
      )}

      {lowStock && (
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 3,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 10px rgba(239,68,68,0.8)',
          }}
        />
      )}

      <div
        className="pos-item-overlay"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          marginTop: 'auto',
          padding: '0.7rem 0.75rem 0.65rem',
          background: 'rgba(2, 6, 23, 0.7)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          borderTop: '1px solid rgba(148,163,184,0.18)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.98rem',
            lineHeight: 1.2,
            color: '#ffffff',
            fontWeight: 800,
            textShadow: '0 2px 8px rgba(0,0,0,0.85)',
            marginBottom: 4,
          }}
        >
          {item.name}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <div
            style={{
              color: GOLD,
              fontWeight: 900,
              fontSize: '1.12rem',
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            }}
          >
            {formatCurrency(item.sellPrice || 0)}
          </div>
          <div
            style={{
              fontSize: '0.68rem',
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            {sold}/{planned} porcí
          </div>
        </div>
      </div>
    </button>
  )
}
