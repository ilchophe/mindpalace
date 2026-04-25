import React, { useCallback, useEffect, useRef } from 'react'
import { Editor } from '@monaco-editor/react'
import { useEditorStore } from '../../stores/editorStore'

const SAVE_DELAY_MS = 1000

export default function MonacoEditor(): React.JSX.Element | null {
  const { tabs, activeTabId, setContent, saveTab } = useEditorStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!activeTabId || value === undefined) return
      setContent(activeTabId, value)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveTab(activeTabId), SAVE_DELAY_MS)
    },
    [activeTabId, setContent, saveTab]
  )

  if (!tab) return null

  return (
    <Editor
      key={tab.id}
      height="100%"
      defaultLanguage="markdown"
      defaultValue={tab.content}
      onChange={handleChange}
      theme="vs-dark"
      options={{
        fontSize: 14,
        lineHeight: 22,
        wordWrap: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        padding: { top: 16, bottom: 16 },
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontLigatures: true,
        bracketPairColorization: { enabled: false },
        lineNumbers: 'on',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 3,
        automaticLayout: true,
      }}
    />
  )
}
