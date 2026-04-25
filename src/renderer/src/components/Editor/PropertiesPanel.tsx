import React, { useEffect, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { parseFrontmatter, stringifyFrontmatter } from '../../lib/frontmatterParser'

type KVPair = [string, string]

export default function PropertiesPanel(): React.JSX.Element | null {
  const { tabs, activeTabId, setContent } = useEditorStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  const [fields, setFields] = useState<KVPair[]>([])
  const [open, setOpen] = useState(false)

  // Reparse frontmatter only when the active tab changes (not on every keystroke)
  useEffect(() => {
    if (!tab) return
    const { frontmatter } = parseFrontmatter(tab.content)
    const pairs = Object.entries(frontmatter).map(
      ([k, v]): KVPair => [k, String(v ?? '')]
    )
    setFields(pairs)
    setOpen(pairs.length > 0)
  }, [tab?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!tab) return null

  function applyChange(newFields: KVPair[]): void {
    if (!tab) return
    const { body } = parseFrontmatter(tab.content)
    const fm: Record<string, unknown> = Object.fromEntries(
      newFields.filter(([k]) => k.trim())
    )
    const updated = stringifyFrontmatter(fm, body)
    setContent(tab.id, updated)
    setFields(newFields)
  }

  return (
    <div className="border-t border-vault-border bg-vault-surface flex-shrink-0">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-vault-muted hover:text-vault-text transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="font-semibold uppercase tracking-wide">Properties</span>
        {fields.length > 0 && (
          <span className="ml-auto text-vault-accent">{fields.length}</span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-1.5">
          {fields.map(([key, value], i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className="w-28 px-2 py-1 text-xs bg-vault-bg border border-vault-border rounded text-vault-text placeholder:text-vault-muted outline-none focus:border-vault-accent"
                placeholder="key"
                value={key}
                onChange={(e) => {
                  const updated = [...fields] as KVPair[]
                  updated[i] = [e.target.value, value]
                  applyChange(updated)
                }}
              />
              <input
                className="flex-1 px-2 py-1 text-xs bg-vault-bg border border-vault-border rounded text-vault-text outline-none focus:border-vault-accent"
                value={value}
                onChange={(e) => {
                  const updated = [...fields] as KVPair[]
                  updated[i] = [key, e.target.value]
                  applyChange(updated)
                }}
              />
              <button
                className="px-1 text-vault-muted hover:text-red-400 text-sm leading-none transition-colors"
                onClick={() =>
                  applyChange(fields.filter((_, j) => j !== i) as KVPair[])
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="text-xs text-vault-accent hover:opacity-80 text-left transition-opacity mt-0.5"
            onClick={() => applyChange([...fields, ['', '']])}
          >
            + Add property
          </button>
        </div>
      )}
    </div>
  )
}
