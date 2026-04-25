import React, { useEffect, useMemo, useState } from 'react'
import type { NoteMetadata } from '@shared'
import { useVaultStore } from '../../stores/vaultStore'

interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  children: TreeNode[]
  note?: NoteMetadata
}

function buildTree(notes: NoteMetadata[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] }

  for (const note of notes) {
    const parts = note.relativePath.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      let child = node.children.find((c) => c.name === name)
      if (!child) {
        const path = parts.slice(0, i + 1).join('/')
        child = { name, path, isFolder: !isLast, children: [] }
        if (isLast) child.note = note
        node.children.push(child)
      }
      node = child
    }
  }

  // Sort: folders first, then files, both alphabetically
  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((n) => ({ ...n, children: sortNodes(n.children) }))
  }

  return sortNodes(root.children)
}

interface TreeItemProps {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (note: NoteMetadata) => void
}

function TreeItem({ node, depth, selectedPath, onSelect }: TreeItemProps): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const isSelected = !node.isFolder && selectedPath === node.path
  const indent = depth * 12

  if (node.isFolder) {
    return (
      <div>
        <button
          style={{ paddingLeft: `${indent + 8}px` }}
          className="flex items-center gap-1.5 w-full py-0.5 pr-2 text-left text-sm text-vault-muted hover:text-vault-text hover:bg-vault-surface/50 rounded transition-colors"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-xs">{open ? '▾' : '▸'}</span>
          <span className="text-vault-muted">📁</span>
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      style={{ paddingLeft: `${indent + 8}px` }}
      className={[
        'flex items-center gap-1.5 w-full py-0.5 pr-2 text-left text-sm rounded transition-colors',
        isSelected
          ? 'bg-vault-accent/20 text-vault-accent'
          : 'text-vault-text hover:bg-vault-surface/50'
      ].join(' ')}
      onClick={() => node.note && onSelect(node.note)}
    >
      <span className="text-vault-muted text-xs">📄</span>
      <span className="truncate">{node.name.replace(/\.md$/, '')}</span>
    </button>
  )
}

export default function FileTree(): React.JSX.Element {
  const { notes, selectedNote, setSelectedNote, loadNotes, activeConfig } = useVaultStore()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (activeConfig) loadNotes()
  }, [activeConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to file-system events
  useEffect(() => {
    const off1 = window.api.vault.onFileCreated(() => loadNotes())
    const off2 = window.api.vault.onFileDeleted(() => loadNotes())
    const off3 = window.api.vault.onFileChanged(() => loadNotes())
    return () => { off1(); off2(); off3() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.toLowerCase()
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.relativePath.toLowerCase().includes(q))
  }, [notes, search])

  const tree = useMemo(() => buildTree(filtered), [filtered])

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-vault-border flex items-center justify-between">
        <span className="text-xs font-semibold text-vault-muted uppercase tracking-wider">
          {activeConfig?.name ?? 'Vault'}
        </span>
        <span className="text-xs text-vault-muted">{notes.length}</span>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter notes…"
          className="w-full rounded border border-vault-border bg-vault-bg px-2 py-1 text-xs text-vault-text outline-none focus:border-vault-accent placeholder:text-vault-muted"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <p className="text-xs text-vault-muted px-3 py-4 text-center">
            {notes.length === 0 ? 'No notes yet' : 'No matches'}
          </p>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedNote?.relativePath ?? null}
              onSelect={setSelectedNote}
            />
          ))
        )}
      </div>
    </div>
  )
}
