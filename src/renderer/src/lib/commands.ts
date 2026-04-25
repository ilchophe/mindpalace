import { useEditorStore } from '../stores/editorStore'
import { useVaultStore } from '../stores/vaultStore'
import { useSyncStore } from '../stores/syncStore'
import { useUIStore } from '../stores/uiStore'

export interface Command {
  id: string
  label: string
  description?: string
  shortcut?: string
  action: () => void
}

/** Returns the current command list, reading from Zustand stores at call time. */
export function getAllCommands(): Command[] {
  const editor = useEditorStore.getState()
  const vault = useVaultStore.getState()
  const sync = useSyncStore.getState()
  const ui = useUIStore.getState()

  const cmds: Command[] = [
    {
      id: 'vault:manager',
      label: 'Open Vault Manager',
      shortcut: 'Ctrl+Shift+V',
      action: () => vault.openManager(),
    },
    {
      id: 'ui:settings',
      label: 'Open Settings',
      shortcut: 'Ctrl+,',
      action: () => ui.openSettings(),
    },
    {
      id: 'ui:graph',
      label: 'Toggle Graph View',
      shortcut: 'Ctrl+Shift+G',
      action: () => ui.toggleGraph(),
    },
    {
      id: 'ui:theme',
      label: `Switch to ${ui.theme === 'dark' ? 'light' : 'dark'} theme`,
      action: () => ui.toggleTheme(),
    },
    {
      id: 'editor:view-edit',
      label: 'View: Edit only',
      action: () => editor.setViewMode('edit'),
    },
    {
      id: 'editor:view-split',
      label: 'View: Split (editor + preview)',
      action: () => editor.setViewMode('split'),
    },
    {
      id: 'editor:view-preview',
      label: 'View: Preview only',
      action: () => editor.setViewMode('preview'),
    },
    {
      id: 'editor:close-all',
      label: 'Close all open tabs',
      action: () => editor.closeAllTabs(),
    },
    {
      id: 'vault:reindex',
      label: 'Reindex vault (rebuild search index)',
      action: () => window.api.search.reindexVault(),
    },
  ]

  if (vault.activeConfig?.githubRepo && sync.authStatus?.isAuthenticated) {
    cmds.splice(2, 0, {
      id: 'vault:sync',
      label: 'Sync vault now',
      action: () => sync.syncNow(),
    })
  }

  return cmds
}
