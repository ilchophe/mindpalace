import React, { useEffect, useRef, useState, useMemo } from 'react'
import { getAllCommands, type Command } from '../../lib/commands'

interface Props {
  onClose: () => void
}

export default function CommandPalette({ onClose }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Snapshot commands once when palette opens — avoids jitter during typing
  const commands = useMemo(() => getAllCommands(), [])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    )
  }, [query, commands])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelected(0) }, [query])

  function run(cmd: Command): void {
    onClose()
    cmd.action()
  }

  function onKey(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      const cmd = filtered[selected]
      if (cmd) run(cmd)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[18vh]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-h-[500px] bg-vault-surface border border-vault-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-vault-border flex-shrink-0">
          <span className="text-vault-muted text-sm select-none">›</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-vault-text text-sm outline-none placeholder:text-vault-muted"
          />
          <kbd className="text-xs text-vault-muted bg-vault-bg px-1.5 py-0.5 rounded border border-vault-border select-none">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-vault-muted text-sm">
              No commands match &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                className={[
                  'w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors',
                  i === selected
                    ? 'bg-vault-accent/10 text-vault-text'
                    : 'text-vault-text hover:bg-vault-border/40',
                ].join(' ')}
                onClick={() => run(cmd)}
                onMouseEnter={() => setSelected(i)}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm truncate">{cmd.label}</span>
                  {cmd.description && (
                    <span className="text-xs text-vault-muted truncate">{cmd.description}</span>
                  )}
                </div>
                {cmd.shortcut && (
                  <kbd className="text-xs text-vault-muted shrink-0 ml-4 whitespace-nowrap">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-vault-border flex-shrink-0 flex items-center gap-3 text-[10px] text-vault-muted select-none">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
