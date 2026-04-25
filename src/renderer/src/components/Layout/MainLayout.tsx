import React, { useEffect, useState } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useSyncStore } from '../../stores/syncStore'
import FileTree from '../Sidebar/FileTree'
import VaultManagerScreen from '../VaultManager/VaultManagerScreen'
import EditorPane from '../Editor/EditorPane'
import SyncPanel from '../Sync/SyncPanel'
import ConnectGitHubModal from '../Auth/ConnectGitHubModal'
import ConflictModal from '../Sync/ConflictModal'
import QuickSwitcher from '../Search/QuickSwitcher'
import GraphView from '../Graph/GraphView'
import DailyNoteButton from '../DailyNotes/DailyNoteButton'

export default function MainLayout(): React.JSX.Element {
  const { isManagerOpen, openManager, activeVault } = useVaultStore()
  const { isConnectModalOpen, isConflictModalOpen } = useSyncStore()
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') { openManager(); return }
      if (e.ctrlKey && e.shiftKey && e.key === 'G') { e.preventDefault(); setIsGraphOpen((v) => !v); return }
      if (e.ctrlKey && !e.shiftKey && e.key === 'p') { e.preventDefault(); setIsQuickSwitcherOpen(true) }
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

        {/* Quick actions: daily note + graph view */}
        {activeVault && (
          <div className="flex-shrink-0 border-t border-vault-border">
            <DailyNoteButton />
            <button
              onClick={() => setIsGraphOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-vault-muted hover:text-vault-text hover:bg-vault-border/40 transition-colors w-full text-left"
              title="Open graph view (Ctrl+Shift+G)"
            >
              <span>🕸</span>
              <span>Graph View</span>
            </button>
          </div>
        )}

        <SyncPanel />
      </aside>

      {/* Editor area */}
      <main className="flex-1 overflow-hidden">
        <EditorPane />
      </main>

      {isManagerOpen && <VaultManagerScreen />}
      {isConnectModalOpen && <ConnectGitHubModal />}
      {isConflictModalOpen && <ConflictModal />}
      {isQuickSwitcherOpen && <QuickSwitcher onClose={() => setIsQuickSwitcherOpen(false)} />}
      {isGraphOpen && <GraphView onClose={() => setIsGraphOpen(false)} />}
    </div>
  )
}
