import React, { useEffect } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import FileTree from '../Sidebar/FileTree'
import VaultManagerScreen from '../VaultManager/VaultManagerScreen'

export default function MainLayout(): React.JSX.Element {
  const { isManagerOpen, openManager, activeVault, activeConfig } = useVaultStore()

  // Ctrl+Shift+V opens the Vault Manager
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') openManager()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openManager])

  return (
    <div className="flex h-screen w-screen bg-vault-bg text-vault-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-vault-border flex flex-col bg-vault-surface">
        {/* Vault switcher button */}
        <button
          className="flex items-center gap-2 px-3 py-2 border-b border-vault-border hover:bg-vault-border/40 transition-colors text-sm text-vault-text"
          onClick={openManager}
          title="Switch vault (Ctrl+Shift+V)"
        >
          <span className="text-vault-accent">🗄</span>
          <span className="flex-1 font-medium truncate">{activeVault?.name ?? 'No vault'}</span>
          <span className="text-vault-muted text-xs">⌃⇧V</span>
        </button>

        <div className="flex-1 overflow-hidden">
          <FileTree />
        </div>
      </aside>

      {/* Main content area — Phase 2 adds Monaco here */}
      <main className="flex-1 flex flex-col items-center justify-center gap-3 text-vault-muted">
        {activeConfig ? (
          <>
            <p className="text-4xl">📝</p>
            <p className="text-lg font-medium text-vault-text">{activeConfig.name}</p>
            <p className="text-sm">Select a note from the sidebar to start editing.</p>
            <p className="text-xs opacity-50">Monaco editor arrives in Phase 2.</p>
          </>
        ) : (
          <>
            <p className="text-4xl">🗄</p>
            <p className="text-lg font-medium text-vault-text">No vault open</p>
            <button className="btn-primary mt-2" onClick={openManager}>
              Open Vault Manager
            </button>
          </>
        )}
      </main>

      {/* Vault Manager overlay */}
      {isManagerOpen && <VaultManagerScreen />}
    </div>
  )
}
