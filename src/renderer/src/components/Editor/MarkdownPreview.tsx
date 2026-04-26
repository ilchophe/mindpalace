import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { renderMarkdown } from '../../lib/markdownPipeline'

export default function MarkdownPreview(): React.JSX.Element | null {
  const { tabs, activeTabId } = useEditorStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  const activeVault = useVaultStore((s) => s.activeVault)
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!tab) {
      setHtml('')
      return
    }
    const ctx = activeVault
      ? { vaultPath: activeVault.localPath, noteRelPath: tab.relativePath }
      : undefined
    let cancelled = false
    renderMarkdown(tab.content, ctx).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [tab?.content, activeVault?.localPath]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!tab) return null

  return (
    <div
      className="markdown-preview h-full overflow-y-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
