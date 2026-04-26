import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { renderMarkdown } from '../../lib/markdownPipeline'

export default function MarkdownPreview(): React.JSX.Element | null {
  const { tabs, activeTabId } = useEditorStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!tab) {
      setHtml('')
      return
    }
    let cancelled = false
    renderMarkdown(tab.content).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [tab?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!tab) return null

  return (
    <div
      className="markdown-preview h-full overflow-y-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
