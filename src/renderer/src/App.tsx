import React, { useEffect } from 'react'
import { useVaultStore } from './stores/vaultStore'
import { useSyncStore } from './stores/syncStore'
import MainLayout from './components/Layout/MainLayout'
import type { SyncStatusPayload } from '@shared'

export default function App(): React.JSX.Element {
  const { loadRegistry, openManager } = useVaultStore()
  const { loadAuthStatus, handleSyncStatus, handleConflictDetected } = useSyncStore()

  useEffect(() => {
    // Load registry and auth status in parallel
    Promise.all([
      loadRegistry().then(() => {
        const { activeVault } = useVaultStore.getState()
        if (!activeVault) openManager()
      }),
      loadAuthStatus()
    ])

    // Subscribe to registry changes
    const offRegistry = window.api.vault.onRegistryChanged(() => loadRegistry())

    // Subscribe to git sync status events from main process
    const offSync = window.api.git.onSyncStatus((payload) =>
      handleSyncStatus(payload as SyncStatusPayload)
    )

    // Subscribe to conflict detection
    const offConflict = window.api.git.onConflictDetected((conflicts) =>
      handleConflictDetected(conflicts)
    )

    return () => {
      offRegistry()
      offSync()
      offConflict()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <MainLayout />
}
