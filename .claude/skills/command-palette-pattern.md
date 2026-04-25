# skill: command-palette-pattern

## Purpose
Fuzzy command palette (Ctrl+Shift+P) backed by a central command registry. Commands are plain objects read from Zustand stores at open-time; no dynamic registration or React context needed.

## Key Files
| File | Role |
|---|---|
| `src/renderer/src/lib/commands.ts` | `getAllCommands()` — returns current command list from store snapshots |
| `src/renderer/src/components/CommandPalette/CommandPalette.tsx` | Modal overlay with input, filtered list, keyboard nav |
| `src/renderer/src/stores/uiStore.ts` | `isCommandPaletteOpen`, `openCommandPalette`, `closeCommandPalette` |
| `src/renderer/src/components/Layout/MainLayout.tsx` | Ctrl+Shift+P keydown listener, renders `<CommandPalette>` conditionally |

## Command Interface
```typescript
interface Command {
  id: string
  label: string
  description?: string
  shortcut?: string
  action: () => void
}

// Read store state at call time — no stale closures
export function getAllCommands(): Command[] {
  const editor = useEditorStore.getState()
  const vault  = useVaultStore.getState()
  const ui     = useUIStore.getState()
  return [
    { id: 'ui:settings',    label: 'Open Settings',        shortcut: 'Ctrl+,', action: () => ui.openSettings() },
    { id: 'ui:graph',       label: 'Toggle Graph View',    shortcut: 'Ctrl+Shift+G', action: () => ui.toggleGraph() },
    { id: 'editor:split',   label: 'View: Split',          action: () => editor.setViewMode('split') },
    // ...
  ]
}
```

## CommandPalette Component Pattern
```tsx
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Snapshot once on open — avoids flicker while typing
  const commands = useMemo(() => getAllCommands(), [])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(q))
  }, [query, commands])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelected(0) }, [query])   // reset on every keystroke

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape')    { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s+1, filtered.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s-1, 0)) }
    if (e.key === 'Enter')     { const cmd = filtered[selected]; if (cmd) { onClose(); cmd.action() } }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[18vh]" onClick={onClose}>
      <div className="w-[560px] max-h-[500px] bg-vault-surface border rounded-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
               placeholder="Type a command…" className="px-4 py-3 bg-transparent outline-none border-b border-vault-border" />
        <div className="overflow-y-auto">
          {filtered.map((cmd, i) => (
            <button key={cmd.id}
              className={i === selected ? 'bg-vault-accent/10 w-full text-left px-4 py-2.5' : 'w-full text-left px-4 py-2.5 hover:bg-vault-border/40'}
              onClick={() => { onClose(); cmd.action() }}
              onMouseEnter={() => setSelected(i)}>
              <span className="text-sm">{cmd.label}</span>
              {cmd.shortcut && <kbd className="text-xs text-vault-muted ml-4">{cmd.shortcut}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

## Keyboard Shortcut Registration
```typescript
// In MainLayout useEffect:
function onKey(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey
  if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); openCommandPalette() }
  if (ctrl && e.key === ',')               { e.preventDefault(); openSettings() }
  if (ctrl && e.key === 'p')               { e.preventDefault(); openQuickSwitcher() }  // note-search
}
window.addEventListener('keydown', onKey)
```

## Reuse Notes
- `getAllCommands()` calls `.getState()` on Zustand stores — safe to call outside React; no hook rules apply
- `useMemo(() => getAllCommands(), [])` snapshots on mount so the list doesn't change while the palette is open
- Keep command palette (run actions) separate from quick switcher (open notes) — they have different UX and different data sources
- `onMouseEnter={() => setSelected(i)}` keeps mouse and keyboard selection in sync without extra state
- Closing before running the action (`onClose(); cmd.action()`) prevents the palette remaining visible while the action executes
- Add `Ctrl+Shift+P` (not `Ctrl+P`) for command palette to avoid conflict with browser/Monaco find
