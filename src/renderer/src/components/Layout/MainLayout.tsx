import React, { useEffect } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useSyncStore } from '../../stores/syncStore'
import FileTree from '../Sidebar/FileTree'
import VaultManagerScreen from '../VaultManager/VaultManagerScreen'
import EditorPane from '../Editor/EditorPane'
import SyncPanel from '../Sync/SyncPanel'
import ConnectGitHubModal from '../Auth/ConnectGitHubModal'
import ConflictModal from '../Sync/ConflictModal'

export default function MainLayout(): React.JSX.Element {
  const { isManagerOpen, openManager, activeVault } = useVaultStore()
  const { isConnectModalOpen, isConflictModalOpen } = useSyncStore()

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
        <button
          className="flex items-center gap-2 px-3 py-2 border-b border-vault-border hover:bg-vault-border/40 transition-colors text-sm text-vault-text flex-shrink-0"
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
        <SyncPanel />
      </aside>

      {/* Editor area */}
      <main className="flex-1 overflow-hidden">
        <EditorPane />
      </main>

      {isManagerOpen && <VaultManagerScreen />}
      {isConnectModalOpen && <ConnectGitHubModal />}
      {isConflictModalOpen && <ConflictModal />}
    </div>
  )
}
