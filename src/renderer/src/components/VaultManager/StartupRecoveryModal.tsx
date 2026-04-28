import React, { useState } from 'react'
import { FolderOpen, AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'

/**
 * Shown on startup when the last-used vault can't be opened automatically.
 * Two variants:
 *   path_missing — folder has moved, been deleted, or is on an unmounted drive.
 *   open_failed  — folder exists but VaultService.open() threw an unexpected error.
 */
export default function StartupRecoveryModal(): React.JSX.Element | null {
  const { startupError, clearStartupError, openManager, openVault } = useVaultStore()
  const [retrying, setRetrying]     = useState(false)
  const [locating, setLocating]     = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  if (!startupError) return null
  // Capture in a stable local so async callbacks inside this render stay narrowed
  const error = startupError
  const isPathMissing = error.reason === 'path_missing'

  async function handleLocate(): Promise<void> {
    setLocating(true)
    setRetryError(null)
    try {
      const chosen = await window.api.vault.pickFolder()
      if (!chosen) return
      await openVault(chosen)      // openVault clears isLoading & navigates into vault
      clearStartupError()
    } catch (err) {
      setRetryError((err as Error).message ?? 'Could not open the selected folder.')
    } finally {
      setLocating(false)
    }
  }

  async function handleRetry(): Promise<void> {
    setRetrying(true)
    setRetryError(null)
    try {
      // Re-run auto-open with the same path — catches transient errors like a
      // drive that just finished mounting or a network share that reconnected.
      await openVault(error.vaultPath)
      clearStartupError()
    } catch (err) {
      setRetryError((err as Error).message ?? 'Still unable to open the vault.')
    } finally {
      setRetrying(false)
    }
  }

  function handleOpenDifferent(): void {
    clearStartupError()
    openManager()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[480px] flex flex-col bg-vault-surface rounded-xl border border-vault-border shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-vault-border">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-vault-text">
              {isPathMissing ? 'Vault folder not found' : 'Could not open vault'}
            </h2>
            <p className="text-xs text-vault-muted mt-0.5 truncate">{error.vaultName}</p>
          </div>
          <button
            onClick={handleOpenDifferent}
            className="text-vault-muted hover:text-vault-text transition-colors p-1 rounded flex-shrink-0"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {isPathMissing ? (
            <p className="text-sm text-vault-text leading-relaxed">
              The folder for <span className="font-medium">{error.vaultName}</span> could
              not be found. It may have been moved, deleted, or is on a drive that isn't currently
              connected.
            </p>
          ) : (
            <p className="text-sm text-vault-text leading-relaxed">
              MindPalace found <span className="font-medium">{error.vaultName}</span> but
              ran into an error while opening it.
            </p>
          )}

          {/* Path display */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-vault-bg border border-vault-border">
            <FolderOpen size={14} className="text-vault-muted flex-shrink-0 mt-0.5" />
            <span className="text-xs text-vault-muted break-all font-mono leading-relaxed">
              {error.vaultPath}
            </span>
          </div>

          {/* Error detail for open_failed */}
          {!isPathMissing && 'message' in startupError && (
            <div className="px-3 py-2.5 rounded-lg bg-red-950/30 border border-red-900/40">
              <p className="text-xs text-red-300 font-mono break-all leading-relaxed">
                {error.message}
              </p>
            </div>
          )}

          {/* Inline retry error */}
          {retryError && (
            <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/40">
              <p className="text-xs text-red-300">{retryError}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 flex flex-col gap-2">
          {isPathMissing ? (
            <>
              <button
                className="btn-primary w-full justify-center flex items-center gap-2"
                onClick={handleLocate}
                disabled={locating}
              >
                <FolderOpen size={14} />
                {locating ? 'Opening…' : 'Find new location…'}
              </button>
              <button className="btn-secondary w-full" onClick={handleOpenDifferent}>
                Open a different vault
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-primary w-full justify-center flex items-center gap-2"
                onClick={handleRetry}
                disabled={retrying}
              >
                <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
                {retrying ? 'Retrying…' : 'Try again'}
              </button>
              <button
                className="btn-secondary w-full justify-center flex items-center gap-2"
                onClick={handleLocate}
                disabled={locating}
              >
                <FolderOpen size={14} />
                {locating ? 'Opening…' : 'Open from a different location…'}
              </button>
              <button className="btn-ghost w-full text-center" onClick={handleOpenDifferent}>
                Open a different vault
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
