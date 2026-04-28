import React, { useEffect } from 'react'
import { useVaultStore } from './stores/vaultStore'
import { useEditorStore } from './stores/editorStore'
import { useSyncStore } from './stores/syncStore'
import { useUIStore } from './stores/uiStore'
import { loadSavedTheme, applyTheme } from './lib/themeEngine'
import MainLayout from './components/Layout/MainLayout'
import type { SyncStatusPayload } from '@shared'

export default function App(): React.JSX.Element {
  const { autoOpen, loadRegistry } = useVaultStore()
  const { loadAuthStatus, handleSyncStatus, handleConflictDetected } = useSyncStore()
  const { setTheme } = useUIStore()

  useEffect(() => {
    // Restore persisted theme before first paint
    const saved = loadSavedTheme()
    applyTheme(saved)
    setTheme(saved)

    Promise.all([
      autoOpen(),      // tries to reopen last vault; handles manager / error state internally
      loadAuthStatus()
    ])

    const offRegistry = window.api.vault.onRegistryChanged(() => loadRegistry())
    const offSync = window.api.git.onSyncStatus((payload) =>
      handleSyncStatus(payload as SyncStatusPayload)
    )
    const offConflict = window.api.git.onConflictDetected((conflicts) =>
      handleConflictDetected(conflicts)
    )

    // When a file changes on disk (e.g. rewriteReferencesInVault after a rename),
    // reload any open non-dirty tab so the editor reflects the updated content.
    const offChanged = window.api.vault.onFileChanged((absPath: string) => {
      const { activeVault } = useVaultStore.getState()
      if (!activeVault) return
      const vaultNorm = activeVault.localPath.replace(/\\/g, '/')
      const absNorm   = absPath.replace(/\\/g, '/')
      if (!absNorm.startsWith(vaultNorm)) return
      const relPath = absNorm.slice(vaultNorm.length).replace(/^\//, '')
      const { tabs, setContent } = useEditorStore.getState()
      const tab = tabs.find(t => t.relativePath === relPath && !t.isDirty)
      if (!tab) return
      window.api.notes.read(relPath)
        .then(content => setContent(tab.id, content, false))
        .catch(() => {/* file removed — leave tab as-is */})
    })

    return () => {
      offRegistry()
      offSync()
      offConflict()
      offChanged()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <MainLayout />
}
