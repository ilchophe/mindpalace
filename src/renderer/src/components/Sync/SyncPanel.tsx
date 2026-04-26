import React from 'react'
import { RefreshCw } from 'lucide-react'
import { useSyncStore } from '../../stores/syncStore'
import { useVaultStore } from '../../stores/vaultStore'

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  idle:         { dot: 'bg-green-400',  label: 'Synced' },
  pulling:      { dot: 'bg-blue-400 animate-pulse', label: 'Pulling…' },
  pushing:      { dot: 'bg-blue-400 animate-pulse', label: 'Pushing…' },
  conflict:     { dot: 'bg-yellow-400', label: 'Conflict' },
  error:        { dot: 'bg-red-400',    label: 'Error' },
  disconnected: { dot: 'bg-vault-muted', label: 'Not connected' }
}

export default function SyncPanel(): React.JSX.Element | null {
  const { authStatus, syncStatus, lastSyncedAt, openConnectModal, syncNow } = useSyncStore()
  const { activeConfig, activeVault } = useVaultStore()

  if (!activeConfig) return null

  const style = STATUS_STYLE[syncStatus.status] ?? STATUS_STYLE.disconnected
  const isConnected = Boolean(activeConfig.githubRepo)
  const isAuthenticated = Boolean(authStatus?.isAuthenticated)
  const isSyncing = syncStatus.status === 'pulling' || syncStatus.status === 'pushing'

  return (
    <div className="border-t border-vault-border px-3 py-2 flex-shrink-0">
      {isConnected ? (
        <div className="flex flex-col gap-1.5">
          {/* Repo name */}
          <p className="text-[10px] text-vault-muted truncate">{activeVault?.githubRepo ?? activeConfig.githubRepo}</p>

          {/* Status row */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
            <span className="text-xs text-vault-muted flex-1">{style.label}</span>
            {syncStatus.status === 'idle' && (
              <span className="text-[10px] text-vault-muted">{timeAgo(lastSyncedAt)}</span>
            )}
          </div>

          {syncStatus.message && (
            <p className="text-[10px] text-red-400 truncate">{syncStatus.message}</p>
          )}

          {/* Sync button */}
          {isAuthenticated && (
            <button
              className="btn-ghost text-xs py-1 w-full text-center flex items-center justify-center gap-1.5"
              onClick={syncNow}
              disabled={isSyncing}
            >
              <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}

          {!isAuthenticated && (
            <button className="btn-secondary text-xs py-1 w-full" onClick={openConnectModal}>
              Reconnect GitHub
            </button>
          )}
        </div>
      ) : (
        <button
          className="btn-secondary text-xs py-1 w-full"
          onClick={openConnectModal}
        >
          Connect to GitHub
        </button>
      )}
    </div>
  )
}
