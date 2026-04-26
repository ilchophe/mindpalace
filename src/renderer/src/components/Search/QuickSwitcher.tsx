import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Search, FileText } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import type { SearchResult } from '@shared'

interface Props {
  onClose: () => void
}

export default function QuickSwitcher({ onClose }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTab = useEditorStore((s) => s.openTab)

  useEffect(() => {
    inputRef.current?.focus()
    // Default: recently modified notes (empty query → list)
    loadRecent()
  }, [])

  async function loadRecent(): Promise<void> {
    try {
      const notes = await window.api.notes.list()
      setResults(
        notes.slice(0, 20).map((n) => ({
          id: n.id,
          relativePath: n.relativePath,
          title: n.title,
          snippet: n.relativePath,
          score: 0
        }))
      )
    } catch {
      setResults([])
    }
  }

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      loadRecent()
      return
    }
    try {
      const hits = await window.api.search.query(q)
      setResults(hits)
    } catch {
      setResults([])
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const q = e.target.value
    setQuery(q)
    setSelected(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q), 150)
  }

  async function openResult(result: SearchResult): Promise<void> {
    // openTab needs a NoteMetadata-like object; use fields from SearchResult
    await openTab({
      id: result.id,
      relativePath: result.relativePath,
      title: result.title,
      tags: [],
      aliases: [],
      frontmatter: {},
      outlinks: [],
      inlinks: [],
      wordCount: 0,
      createdAt: '',
      modifiedAt: ''
    })
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return }
    if (e.key === 'Enter' && results[selected]) { openResult(results[selected]); return }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl bg-vault-surface border border-vault-border rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center border-b border-vault-border px-4">
          <Search size={14} className="text-vault-muted flex-shrink-0 mr-2" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search notes…"
            className="flex-1 py-3 bg-transparent text-vault-text placeholder-vault-muted text-sm outline-none"
          />
        </div>

        {results.length > 0 ? (
          <ul className="max-h-80 overflow-y-auto">
            {results.map((r, i) => (
              <li
                key={r.id}
                className={[
                  'px-4 py-2 cursor-pointer flex items-start gap-2.5',
                  i === selected ? 'bg-vault-accent/20' : 'hover:bg-vault-border/40'
                ].join(' ')}
                onClick={() => openResult(r)}
                onMouseEnter={() => setSelected(i)}
              >
                <FileText size={13} className="text-vault-muted flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm text-vault-text font-medium truncate">{r.title}</span>
                <span
                  className="text-xs text-vault-muted truncate"
                  // snippet may contain <mark> tags from FTS5
                  dangerouslySetInnerHTML={{ __html: r.snippet || r.relativePath }}
                />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-vault-muted">
            {query ? 'No results' : 'No notes yet'}
          </p>
        )}

        <div className="px-4 py-1.5 border-t border-vault-border flex gap-3 text-xs text-vault-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
