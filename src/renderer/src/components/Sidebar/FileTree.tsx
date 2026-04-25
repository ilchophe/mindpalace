import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { NoteMetadata } from '@shared'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '../../stores/editorStore'

interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  children: TreeNode[]
  note?: NoteMetadata
}

function buildTree(notes: NoteMetadata[], emptyFolders: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] }

  function ensurePath(parts: string[]): TreeNode {
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const path = parts.slice(0, i + 1).join('/')
      let child = node.children.find((c) => c.name === name)
      if (!child) {
        child = { name, path, isFolder: true, children: [] }
        node.children.push(child)
      }
      node = child
    }
    return node
  }

  for (const note of notes) {
    const parts = note.relativePath.split('/')
    const parentParts = parts.slice(0, -1)
    const parentNode = parentParts.length ? ensurePath(parentParts) : root
    const name = parts[parts.length - 1]
    const existing = parentNode.children.find((c) => c.name === name)
    if (!existing) {
      parentNode.children.push({ name, path: note.relativePath, isFolder: false, children: [], note })
    }
  }

  // Ensure explicitly created empty folders exist in the tree
  for (const folderPath of emptyFolders) {
    const parts = folderPath.split('/').filter(Boolean)
    if (parts.length) ensurePath(parts)
  }

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
  const indent = depth * 16

  if (node.isFolder) {
    return (
      <div>
        <button
          style={{ paddingLeft: `${indent + 6}px` }}
          className="flex items-center gap-1 w-full py-[3px] pr-2 text-left text-sm text-vault-muted hover:text-vault-text hover:bg-vault-border/30 rounded transition-colors"
          onClick={() => setOpen((o) => !o)}
        >
          <span
            className="text-[10px] text-vault-muted/70 transition-transform duration-100 inline-block"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ›
          </span>
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
      style={{ paddingLeft: `${indent + 18}px` }}
      className={[
        'flex items-center w-full py-[3px] pr-2 text-left text-sm rounded transition-colors',
        isSelected
          ? 'bg-vault-accent/20 text-vault-accent'
          : 'text-vault-text hover:bg-vault-border/30'
      ].join(' ')}
      onClick={() => node.note && onSelect(node.note)}
    >
      <span className="truncate">{node.name.replace(/\.md$/, '')}</span>
    </button>
  )
}

export default function FileTree(): React.JSX.Element {
  const { notes, selectedNote, setSelectedNote, loadNotes, activeConfig } = useVaultStore()
  const openTab = useEditorStore((s) => s.openTab)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<'note' | 'folder' | null>(null)
  const [newName, setNewName] = useState('')
  const newNameRef = useRef<HTMLInputElement>(null)
  // Track explicitly created empty folders so they appear before any notes are added
  const [emptyFolders, setEmptyFolders] = useState<string[]>([])

  useEffect(() => {
    if (creating) newNameRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (activeConfig) loadNotes()
  }, [activeConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const off1 = window.api.vault.onFileCreated(() => loadNotes())
    const off2 = window.api.vault.onFileDeleted(() => loadNotes())
    const off3 = window.api.vault.onFileChanged(() => loadNotes())
    return () => { off1(); off2(); off3() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Drop an empty-folder entry once it has notes in it
  useEffect(() => {
    setEmptyFolders((prev) =>
      prev.filter((f) => !notes.some((n) => n.relativePath.startsWith(f + '/')))
    )
  }, [notes])

  function handleNoteSelect(note: NoteMetadata): void {
    setSelectedNote(note)
    openTab(note)
  }

  function getCreateParent(): string {
    if (!selectedNote) return ''
    const parts = selectedNote.relativePath.split('/')
    return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  }

  function startCreating(type: 'note' | 'folder'): void {
    setNewName('')
    setCreating(type)
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) { setCreating(null); return }
    const parent = getCreateParent()
    const relPath = parent ? `${parent}/${trimmed}` : trimmed

    try {
      if (creating === 'note') {
        const notePath = relPath.endsWith('.md') ? relPath : `${relPath}.md`
        await window.api.notes.write(notePath, '')
        await loadNotes()
        const newNote = useVaultStore.getState().notes.find((n) => n.relativePath === notePath)
        if (newNote) {
          setSelectedNote(newNote)
          openTab(newNote)
        }
      } else {
        await window.api.notes.createFolder(relPath)
        setEmptyFolders((prev) => [...prev, relPath])
        await loadNotes()
      }
    } catch (err) {
      console.error('Failed to create:', err)
    }
    setCreating(null)
    setNewName('')
  }

  function cancelCreate(): void {
    setCreating(null)
    setNewName('')
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.toLowerCase()
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.relativePath.toLowerCase().includes(q))
  }, [notes, search])

  const tree = useMemo(() => buildTree(filtered, emptyFolders), [filtered, emptyFolders])

  const createParent = getCreateParent()

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-vault-border flex items-center justify-between">
        <span className="text-xs font-semibold text-vault-muted uppercase tracking-wider">
          {activeConfig?.name ?? 'Vault'}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-vault-muted mr-1">{notes.length}</span>
          {activeConfig && (
            <>
              <button
                onClick={() => startCreating('note')}
                title="New note"
                className="text-vault-muted hover:text-vault-text hover:bg-vault-border/40 rounded px-1 py-0.5 text-xs transition-colors"
              >
                📄+
              </button>
              <button
                onClick={() => startCreating('folder')}
                title="New folder"
                className="text-vault-muted hover:text-vault-text hover:bg-vault-border/40 rounded px-1 py-0.5 text-xs transition-colors"
              >
                📁+
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline create input */}
      {creating && (
        <div className="px-2 py-1.5 border-b border-vault-border bg-vault-surface/50">
          <div className="text-xs text-vault-muted mb-1">
            {creating === 'note' ? 'New note' : 'New folder'}
            {createParent ? ` in ${createParent}/` : ' in vault root'}
          </div>
          <form onSubmit={handleCreate} className="flex gap-1">
            <input
              ref={newNameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && cancelCreate()}
              placeholder={creating === 'note' ? 'note-name' : 'folder-name'}
              className="flex-1 rounded border border-vault-accent bg-vault-bg px-2 py-1 text-xs text-vault-text outline-none placeholder:text-vault-muted"
            />
            <button
              type="submit"
              className="rounded bg-vault-accent/20 hover:bg-vault-accent/30 px-2 py-1 text-xs text-vault-accent transition-colors"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={cancelCreate}
              className="rounded hover:bg-vault-border/40 px-2 py-1 text-xs text-vault-muted transition-colors"
            >
              ✕
            </button>
          </form>
        </div>
      )}

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
              onSelect={handleNoteSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}
