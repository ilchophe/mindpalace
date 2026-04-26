import React, { useEffect } from 'react'
import { Database, Network, Settings, ChevronDown } from 'lucide-react'
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
import CommandPalette from '../CommandPalette/CommandPalette'
import SettingsPanel from '../Settings/SettingsPanel'

const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 224

export default function MainLayout(): React.JSX.Element {
  const { isManagerOpen, openManager, activeVault } = useVaultStore()
  const { isConnectModalOpen, isConflictModalOpen } = useSyncStore()
  const {
    isGraphOpen, closeGraph, openGraph,
    isSettingsOpen, openSettings,
    isCommandPaletteOpen, openCommandPalette, closeCommandPalette,
  } = useUIStore()

  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = React.useState(false)
  const [sidebarWidth, setSidebarWidth] = React.useState(SIDEBAR_DEFAULT)
  const isResizing = React.useRef(false)

  function onResizeStart(e: React.MouseEvent): void {
    e.preventDefault()
    isResizing.current = true

    function onMouseMove(ev: MouseEvent): void {
      if (!isResizing.current) return
      setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, ev.clientX)))
    }

    function onMouseUp(): void {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

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
      <aside
        className="relative flex-shrink-0 border-r border-vault-border flex flex-col bg-vault-surface"
        style={{ width: sidebarWidth }}
      >
        <button
          className="flex items-center gap-2 px-3 py-2 border-b border-vault-border hover:bg-vault-border/40 transition-colors text-sm text-vault-text flex-shrink-0"
          onClick={openManager}
          title="Switch vault (Ctrl+Shift+V)"
        >
          <Database size={14} className="text-vault-accent flex-shrink-0" />
          <span className="flex-1 font-medium truncate">{activeVault?.name ?? 'No vault'}</span>
          <ChevronDown size={12} className="text-vault-muted flex-shrink-0" />
        </button>

        <div className="flex-1 overflow-hidden">
          <FileTree />
        </div>

        {/* Quick action buttons */}
        {activeVault && (
          <div className="flex-shrink-0 border-t border-vault-border">
            <button
              onClick={openGraph}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-vault-muted hover:text-vault-text hover:bg-vault-border/40 transition-colors w-full text-left"
              title="Graph view (Ctrl+Shift+G)"
            >
              <Network size={14} />
              <span>Graph View</span>
            </button>
            <button
              onClick={openSettings}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-vault-muted hover:text-vault-text hover:bg-vault-border/40 transition-colors w-full text-left"
              title="Settings (Ctrl+,)"
            >
              <Settings size={14} />
              <span>Settings</span>
            </button>
          </div>
        )}

        <SyncPanel />

        {/* Drag-to-resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize group z-10"
          onMouseDown={onResizeStart}
        >
          <div className="absolute inset-y-0 right-0 w-[3px] group-hover:bg-vault-accent/40 transition-colors" />
        </div>
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
