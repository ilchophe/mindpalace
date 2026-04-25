import React, { useEffect } from 'react'
import { useVaultStore } from './stores/vaultStore'
import { useSyncStore } from './stores/syncStore'
import { useUIStore } from './stores/uiStore'
import { loadSavedTheme, applyTheme } from './lib/themeEngine'
import MainLayout from './components/Layout/MainLayout'
import type { SyncStatusPayload } from '@shared'

export default function App(): React.JSX.Element {
  const { loadRegistry, openManager } = useVaultStore()
  const { loadAuthStatus, handleSyncStatus, handleConflictDetected } = useSyncStore()
  const { setTheme } = useUIStore()

  useEffect(() => {
    // Restore persisted theme before first paint
    const saved = loadSavedTheme()
    applyTheme(saved)
    setTheme(saved)

    Promise.all([
      loadRegistry().then(() => {
        const { activeVault } = useVaultStore.getState()
        if (!activeVault) openManager()
      }),
      loadAuthStatus(),
    ])

    const offRegistry = window.api.vault.onRegistryChanged(() => loadRegistry())
    const offSync = window.api.git.onSyncStatus((payload) =>
      handleSyncStatus(payload as SyncStatusPayload)
    )
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
