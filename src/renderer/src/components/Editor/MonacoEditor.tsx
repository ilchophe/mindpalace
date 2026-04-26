import React, { useCallback, useEffect, useRef } from 'react'
import { Editor, loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useEditorStore } from '../../stores/editorStore'

// Use the locally bundled monaco-editor instead of the CDN default
loader.config({ monaco })

const SAVE_DELAY_MS = 1000

type IEditor = Parameters<OnMount>[0]

export default function MonacoEditor(): React.JSX.Element | null {
  const { tabs, activeTabId, setContent, saveTab } = useEditorStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<IEditor | null>(null)
  // Always reflects the current tab so the paste handler (registered once per mount) stays fresh
  const tabRef = useRef(tab)
  const pasteCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  // Clear pending save on unmount; also clean up paste listener
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      pasteCleanupRef.current?.()
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

  const handleMount = useCallback((editor: IEditor) => {
    editorRef.current = editor
    const domNode = editor.getDomNode()
    if (!domNode) return

    const onPaste = async (e: ClipboardEvent): Promise<void> => {
      const currentTab = tabRef.current
      if (!currentTab) return
      const items = Array.from(e.clipboardData?.items ?? [])
      const imgItem = items.find((item) => item.type.startsWith('image/'))
      if (!imgItem) return

      e.preventDefault()
      e.stopPropagation()

      const blob = imgItem.getAsFile()
      if (!blob) return

      // Convert blob → base64 without URL.createObjectURL to stay in memory
      const ab = await blob.arrayBuffer()
      const bytes = new Uint8Array(ab)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)

      try {
        const relPath = await window.api.images.paste(currentTab.relativePath, base64, imgItem.type)
        const position = editor.getPosition()
        if (position) {
          editor.executeEdits('', [
            {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
              text: `![](${relPath})`,
            },
          ])
        }
      } catch (err) {
        console.error('[MonacoEditor] image paste failed:', err)
      }
    }

    // Use capture so we intercept before Monaco's own paste handler
    domNode.addEventListener('paste', onPaste, true)
    pasteCleanupRef.current = () => domNode.removeEventListener('paste', onPaste, true)
  }, []) // stable ref — tabRef handles tab identity without re-registering

  if (!tab) return null

  return (
    <Editor
      key={tab.id}
      height="100%"
      defaultLanguage="markdown"
      defaultValue={tab.content}
      onChange={handleChange}
      onMount={handleMount}
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
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        automaticLayout: true,
      }}
    />
  )
}
