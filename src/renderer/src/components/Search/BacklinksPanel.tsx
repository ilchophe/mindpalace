import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

export default function BacklinksPanel(): React.JSX.Element | null {
  const { tabs, activeTabId, openTab } = useEditorStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const [backlinks, setBacklinks] = useState<string[]>([])
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!activeTab) { setBacklinks([]); return }
    let cancelled = false
    window.api.search.getBacklinks(activeTab.relativePath).then((links) => {
      if (!cancelled) setBacklinks(links)
    }).catch(() => {
      if (!cancelled) setBacklinks([])
    })
    return () => { cancelled = true }
  }, [activeTab?.relativePath])

  if (!activeTab || backlinks.length === 0) return null

  function titleFromPath(relPath: string): string {
    return relPath.split('/').pop()?.replace(/\.md$/, '') ?? relPath
  }

  async function handleClick(relPath: string): Promise<void> {
    await openTab({
      id: relPath, // temp; openTab checks by id — will re-read file
      relativePath: relPath,
      title: titleFromPath(relPath),
      tags: [], aliases: [], frontmatter: {}, outlinks: [], inlinks: [],
      wordCount: 0, createdAt: '', modifiedAt: ''
    })
  }

  return (
    <div className="border-t border-vault-border bg-vault-surface flex-shrink-0">
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-vault-muted hover:text-vault-text transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span>Backlinks ({backlinks.length})</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <ul className="max-h-32 overflow-y-auto pb-1">
          {backlinks.map((relPath) => (
            <li key={relPath}>
              <button
                className="w-full text-left px-4 py-0.5 text-xs text-vault-accent hover:underline truncate"
                onClick={() => handleClick(relPath)}
              >
                {titleFromPath(relPath)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
