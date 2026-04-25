import React, { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  livePreviewPlugin,
  markdownHighlightStyle,
  mindpalaceTheme
} from '../../lib/livePreviewPlugin'
import { useEditorStore } from '../../stores/editorStore'

const SAVE_DELAY_MS = 1000

export default function CodeMirrorEditor(): React.JSX.Element | null {
  const { tabs, activeTabId, setContent, saveTab } = useEditorStore()
  const tab = tabs.find(t => t.id === activeTabId)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Always points to the current tab so closures registered once stay fresh
  const tabRef = useRef(tab)
  // Prevents the update listener from firing during programmatic doc replacement
  const suppressUpdateRef = useRef(false)

  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  // ── Create / destroy editor when the active tab changes ────────────────────
  useEffect(() => {
    if (!containerRef.current || !tab) return

    const view = new EditorView({
      state: EditorState.create({
        doc: tab.content,
        extensions: [
          history(),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                const t = tabRef.current
                if (!t) return false
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
                saveTab(t.id)
                return true
              }
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap
          ]),
          markdown({ base: markdownLanguage }),
          markdownHighlightStyle,
          livePreviewPlugin,
          mindpalaceTheme,
          EditorView.lineWrapping,
          EditorView.domEventHandlers({
            paste(event, pasteView) {
              const items = Array.from(event.clipboardData?.items ?? [])
              const imgItem = items.find(i => i.type.startsWith('image/'))
              if (!imgItem) return false

              event.preventDefault()
              const blob = imgItem.getAsFile()
              if (!blob) return true

              const reader = new FileReader()
              reader.onload = async () => {
                const dataUrl = reader.result as string
                const base64 = dataUrl.split(',')[1]
                const currentTab = tabRef.current
                if (!currentTab) return
                try {
                  const relPath = await window.api.images.paste(
                    currentTab.relativePath,
                    base64,
                    imgItem.type
                  )
                  const pos = pasteView.state.selection.main.from
                  const insertText = `![](${relPath})`
                  pasteView.dispatch({
                    changes: { from: pos, insert: insertText },
                    selection: { anchor: pos + insertText.length }
                  })
                } catch (err) {
                  console.error('[CodeMirrorEditor] image paste failed:', err)
                }
              }
              reader.readAsDataURL(blob)
              return true
            }
          }),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || suppressUpdateRef.current) return
            const content = update.state.doc.toString()
            const t = tabRef.current
            if (!t) return
            setContent(t.id, content)
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            saveTimerRef.current = setTimeout(() => saveTab(t.id), SAVE_DELAY_MS)
          })
        ]
      }),
      parent: containerRef.current
    })

    viewRef.current = view

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      view.destroy()
      viewRef.current = null
    }
  }, [tab?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync doc when content changes externally (e.g. git sync) ──────────────
  useEffect(() => {
    const view = viewRef.current
    if (!view || !tab) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc === tab.content) return

    suppressUpdateRef.current = true
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: tab.content }
    })
    suppressUpdateRef.current = false
  }, [tab?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!tab) return null

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-auto bg-vault-bg"
      style={{ contain: 'strict' }}
    />
  )
}
