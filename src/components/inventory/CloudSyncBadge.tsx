import { useEffect } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import {
  useInventoryStore,
  wireInventoryConnectivity,
} from '../../store/useInventoryStore'

/** Discreet header badge: cloud sync vs local protected mode. */
export function CloudSyncBadge() {
  const cloudStatus = useInventoryStore((s) => s.cloudStatus)
  const pendingQueue = useInventoryStore((s) => s.pendingQueue)
  const refreshSyncStatus = useInventoryStore((s) => s.refreshSyncStatus)
  const flushQueue = useInventoryStore((s) => s.flushQueue)

  useEffect(() => {
    wireInventoryConnectivity()
    void refreshSyncStatus()
  }, [refreshSyncStatus])

  const synced = cloudStatus === 'synced'
  const label = synced
    ? '🟢 Synchronizováno s cloudem'
    : cloudStatus === 'pending'
      ? `🟡 Fronta ${pendingQueue} · synchronizuji…`
      : cloudStatus === 'error'
        ? '🟡 Cloud nedostupný (Data chráněna)'
        : '🟡 Pracuji v lokálním režimu (Data chráněna)'

  return (
    <button
      type="button"
      className="cloud-sync-badge"
      title="Klepnutím obnovíte synchronizaci"
      onClick={() => {
        void refreshSyncStatus()
        void flushQueue()
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: '1px solid var(--border)',
        background: synced ? 'rgba(16,185,129,0.1)' : 'rgba(240,180,41,0.1)',
        color: synced ? 'var(--emerald-light)' : 'var(--warning)',
        borderRadius: 999,
        padding: '0.35rem 0.7rem',
        fontSize: '0.72rem',
        fontWeight: 600,
        cursor: 'pointer',
        maxWidth: '100%',
      }}
    >
      {synced ? <Cloud size={12} /> : <CloudOff size={12} />}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <RefreshCw size={11} opacity={0.7} />
    </button>
  )
}
