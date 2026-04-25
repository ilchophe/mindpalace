import React from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'

export default function DailyNoteButton(): React.JSX.Element | null {
  const { openTab } = useEditorStore()
  const { activeVault, activeConfig, loadNotes } = useVaultStore()

  if (!activeVault) return null

  const handleClick = async (): Promise<void> => {
    const today = new Date()
    const dateStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')

    const folder = activeConfig?.dailyNotesFolder || 'Daily Notes'
    const relPath = `${folder}/${dateStr}.md`

    const allNotes = await window.api.notes.list()
    const existing = allNotes.find((n) => n.relativePath === relPath)

    if (existing) {
      await openTab(existing)
      return
    }

    const template = activeConfig?.dailyNoteTemplate ?? ''
    const content = template.replace(/\{\{date\}\}/g, dateStr) || `# ${dateStr}\n\n`
    await window.api.notes.write(relPath, content)

    const fresh = await window.api.notes.list()
    const created = fresh.find((n) => n.relativePath === relPath)
    if (created) await openTab(created)
    await loadNotes()
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-1.5 text-xs text-vault-muted hover:text-vault-text hover:bg-vault-border/40 transition-colors w-full text-left"
      title="Open today's daily note (Ctrl+Shift+D)"
    >
      <span>📅</span>
      <span>Today's Note</span>
    </button>
  )
}
