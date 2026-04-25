# skill: monaco-editor-setup

## Purpose
Embed Monaco Editor (VS Code engine) inside an Electron/React renderer with auto-save, tab management, and a split edit/preview layout.

## Key Packages
| Package | Role |
|---|---|
| `@monaco-editor/react` | React wrapper for Monaco |
| `zustand` | `editorStore` — open tabs, active tab, view mode, dirty state |

## Key Components
| Component | File |
|---|---|
| `MonacoEditor` | `src/renderer/src/components/Editor/MonacoEditor.tsx` |
| `TabBar` | `src/renderer/src/components/Editor/TabBar.tsx` |
| `EditorPane` | `src/renderer/src/components/Editor/EditorPane.tsx` |
| `editorStore` | `src/renderer/src/stores/editorStore.ts` |

## Core Patterns

### Uncontrolled Monaco with tab switching
```tsx
// key={tab.id} remounts Monaco when active tab changes,
// loading the correct defaultValue without fighting the internal model.
<Editor
  key={tab.id}
  height="100%"
  defaultLanguage="markdown"
  defaultValue={tab.content}
  onChange={handleChange}
  theme="vs-dark"
  options={{ automaticLayout: true, wordWrap: 'on', minimap: { enabled: false } }}
/>
```

### Auto-save debounce (1000ms minimum)
```tsx
const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleChange = useCallback((value: string | undefined) => {
  if (!activeTabId || value === undefined) return
  setContent(activeTabId, value)
  if (saveTimer.current) clearTimeout(saveTimer.current)
  saveTimer.current = setTimeout(() => saveTab(activeTabId), 1000)
}, [activeTabId, setContent, saveTab])

// Clear on unmount
useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])
```

### Monaco sizing in flex layout
```tsx
// Absolute positioning wrapper makes Monaco size itself correctly inside flex parent
<div className="relative flex-1 overflow-hidden">
  <div className="absolute inset-0">
    <MonacoEditor />
  </div>
</div>
```

### editorStore open tab
```typescript
openTab: async (note) => {
  if (get().tabs.find(t => t.id === note.id)) {
    set({ activeTabId: note.id })
    return
  }
  const content = await window.api.notes.read(note.relativePath)
  set(s => ({
    tabs: [...s.tabs, { id: note.id, relativePath, title, content, isDirty: false }],
    activeTabId: note.id
  }))
}
```

### Tab close — activate nearest neighbour
```typescript
closeTab: (id) => {
  set((s) => {
    const tabs = s.tabs.filter(t => t.id !== id)
    let activeTabId = s.activeTabId
    if (activeTabId === id) {
      const idx = s.tabs.findIndex(t => t.id === id)
      activeTabId = tabs[Math.max(0, idx - 1)]?.id ?? null
    }
    return { tabs, activeTabId }
  })
}
```

## CSP Note
Monaco requires `'unsafe-eval'` in Content-Security-Policy. Already set in `src/renderer/index.html`.

## Reuse Notes
- Close all tabs on vault switch: `useEditorStore.getState().closeAllTabs()` — call from `vaultStore.switchVault`
- Wire FileTree note clicks: `openTab(note)` alongside `setSelectedNote(note)` in `FileTree.tsx`
- View mode toggle (`edit` / `split` / `preview`) lives in `editorStore.viewMode`
