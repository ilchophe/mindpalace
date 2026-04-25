import React, { useEffect } from 'react'
import { useVaultStore } from '../../stores/vaultStore'
import { useSyncStore } from '../../stores/syncStore'
import { useUIStore } from '../../stores/uiStore'
import FileTree from '../Sidebar/FileTree'
import VaultManagerScreen from '../VaultManager/VaultManagerScreen'
import EditorPane from '../Editor/EditorPane'
import SyncPanel from '../Sync/SyncPanel'
import ConnectGitHubModal from '../Auth/ConnectGitHubModal'
import ConflictModal from '../Sync/ConflictModal'
import QuickSwitcher from '../Search/QuickSwitcher'
import GraphView from '../Graph/GraphView'
import DailyNoteButton from '../DailyNotes/DailyNoteButton'
import CommandPalette from '../CommandPalette/CommandPalette'
import SettingsPanel from '../Settings/SettingsPanel'

export default function MainLayout(): React.JSX.Element {
  const { isManagerOpen, openManager, activeVault } = useVaultStore()
  const { isConnectModalOpen, isConflictModalOpen } = useSyncStore()
  const {
    isGraphOpen, closeGraph, openGraph,
    isSettingsOpen, openSettings,
    isCommandPaletteOpen, openCommandPalette, closeCommandPalette,
  } = useUIStore()

  // QuickSwitcher (Ctrl+P) lives in local state since it's a separate concept from command palette
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = React.useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.shiftKey && e.key === 'V') { openManager(); return }
      if (ctrl && e.shiftKey && e.key === 'G') { e.preventDefault(); openGraph(); return }
      if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); openCommandPalette(); return }
      if (ctrl && !e.shiftKey && e.key === ',') { e.preventDefault(); openSettings(); return }
      if (ctrl && !e.shiftKey && e.key === 'p') { e.preventDefault(); setIsQuickSwitcherOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openManager, openGraph, openCommandPalette, openSettings])

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

        {/* Quick action buttons */}
        {activeVault && (
          <div className="flex-shrink-0 border-t border-vault-border">
            <DailyNoteButton />
            <button
              onClick={openGraph}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-vault-muted hover:text-vault-text hover:bg-vault-border/40 transition-colors w-full text-left"
              title="Graph view (Ctrl+Shift+G)"
            >
              <span>🕸</span>
              <span>Graph View</span>
            </button>
            <button
              onClick={openSettings}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-vault-muted hover:text-vault-text hover:bg-vault-border/40 transition-colors w-full text-left"
              title="Settings (Ctrl+,)"
            >
              <span>⚙</span>
              <span>Settings</span>
            </button>
          </div>
        )}

        <SyncPanel />
      </aside>

      {/* Editor area */}
      <main className="flex-1 overflow-hidden">
        <EditorPane />
      </main>

      {/* Overlays */}
      {isManagerOpen && <VaultManagerScreen />}
      {isConnectModalOpen && <ConnectGitHubModal />}
      {isConflictModalOpen && <ConflictModal />}
      {isQuickSwitcherOpen && <QuickSwitcher onClose={() => setIsQuickSwitcherOpen(false)} />}
      {isGraphOpen && <GraphView onClose={closeGraph} />}
      {isCommandPaletteOpen && <CommandPalette onClose={closeCommandPalette} />}
      {isSettingsOpen && <SettingsPanel />}
    </div>
  )
}
