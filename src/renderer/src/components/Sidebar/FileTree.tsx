import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus, FolderPlus, ChevronRight, FileText, Folder, Image, File } from 'lucide-react'
import type { NoteMetadata } from '@shared'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '../../stores/editorStore'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  children: TreeNode[]
  note?: NoteMetadata
  assetExt?: string   // set for non-md asset files (images, PDFs…)
}

const IMAGE_EXTS_SET = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])

function buildTree(notes: NoteMetadata[], emptyFolders: string[], assets: string[]): TreeNode[] {
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
    if (!parentNode.children.find((c) => c.name === name)) {
      parentNode.children.push({ name, path: note.relativePath, isFolder: false, children: [], note })
    }
  }

  for (const assetPath of assets) {
    const parts = assetPath.split('/')
    const parentParts = parts.slice(0, -1)
    const parentNode = parentParts.length ? ensurePath(parentParts) : root
    const name = parts[parts.length - 1]
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
    if (!parentNode.children.find((c) => c.name === name)) {
      parentNode.children.push({ name, path: assetPath, isFolder: false, children: [], assetExt: ext })
    }
  }

  for (const folderPath of emptyFolders) {
    const parts = folderPath.split('/').filter(Boolean)
    if (parts.length) ensurePath(parts)
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        // Within same type: notes before assets, then alphabetical
        if (!a.isFolder && !b.isFolder) {
          const aIsAsset = !!a.assetExt
          const bIsAsset = !!b.assetExt
          if (aIsAsset !== bIsAsset) return aIsAsset ? 1 : -1
        }
        return a.name.localeCompare(b.name)
      })
      .map((n) => ({ ...n, children: sortNodes(n.children) }))
  }

  return sortNodes(root.children)
}

interface DragHandlers {
  onDragStart: (e: React.DragEvent, path: string) => void
  onDragOver: (e: React.DragEvent, path: string) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, node: TreeNode) => void
  dragOverPath: string | null
}

interface TreeItemProps {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (note: NoteMetadata) => void
  onOpenAsset: (relPath: string) => void
  drag: DragHandlers
  renamingPath: string | null
  onRenameSubmit: (oldPath: string, newName: string) => void
  onRenameCancel: () => void
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
}

const INDENT_PX = 20

function IndentGuides({ depth }: { depth: number }): React.JSX.Element | null {
  if (depth === 0) return null
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="absolute inset-y-0 pointer-events-none"
          style={{
            left: `${i * INDENT_PX + 10}px`,
            width: '1px',
            background: '#555555',
            opacity: 1,
          }}
        />
      ))}
    </>
  )
}

function FolderIcon({ open: _open }: { open: boolean }): React.JSX.Element {
  return <Folder size={14} className="flex-shrink-0 text-vault-accent/80" />
}

function ChevronIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <ChevronRight
      size={12}
      className="flex-shrink-0 transition-transform duration-150 text-vault-muted/60"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    />
  )
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  onOpenAsset,
  drag,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  onContextMenu,
}: TreeItemProps): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const isSelected = !node.isFolder && selectedPath === node.path
  const isDragOver = drag.dragOverPath === node.path
  const indent = depth * INDENT_PX
  const isRenaming = renamingPath === node.path

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(node.name.replace(/\.md$/, ''))
      setTimeout(() => renameInputRef.current?.select(), 0)
    }
  }, [isRenaming, node.name])

  const baseClass =
    'relative flex items-center gap-1.5 w-full py-[3px] pr-2 text-left text-sm rounded transition-colors cursor-default'
  const dragOverClass = isDragOver ? 'bg-vault-accent/20 ring-1 ring-vault-accent/50' : ''

  const nameDisplay = (
    <>
      <IndentGuides depth={depth} />
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onRenameSubmit(node.path, renameValue) }
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={() => onRenameCancel()}
          className="flex-1 rounded border border-vault-accent bg-vault-bg px-1.5 py-0 text-xs text-vault-text outline-none min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : null}
    </>
  )

  if (node.isFolder) {
    return (
      <div
        onDragLeave={drag.onDragLeave}
        onDrop={(e) => drag.onDrop(e, node)}
      >
        <button
          draggable={!isRenaming}
          style={{ paddingLeft: `${indent + 4}px` }}
          className={[baseClass, dragOverClass, 'text-vault-muted hover:text-vault-text hover:bg-white/[0.06]'].join(' ')}
          onDragStart={(e) => drag.onDragStart(e, node.path)}
          onDragOver={(e) => drag.onDragOver(e, node.path)}
          onDrop={(e) => drag.onDrop(e, node)}
          onContextMenu={(e) => onContextMenu(e, node)}
          onClick={() => !isRenaming && setOpen((o) => !o)}
        >
          {nameDisplay}
          {!isRenaming && (
            <>
              <ChevronIcon open={open} />
              <FolderIcon open={open} />
              <span className="truncate">{node.name}</span>
            </>
          )}
        </button>
        {open &&
          node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpenAsset={onOpenAsset}
              drag={drag}
              renamingPath={renamingPath}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onContextMenu={onContextMenu}
            />
          ))}
      </div>
    )
  }

  return (
    <button
      draggable={!isRenaming}
      style={{ paddingLeft: `${indent + 8}px` }}
      className={[
        baseClass,
        dragOverClass,
        node.assetExt
          ? 'text-vault-muted/80 hover:bg-white/[0.06]'
          : isSelected
            ? 'bg-white/[0.10] text-vault-text'
            : 'text-vault-text hover:bg-white/[0.06]',
      ].join(' ')}
      onDragStart={(e) => drag.onDragStart(e, node.path)}
      onDragOver={(e) => drag.onDragOver(e, node.path)}
      onDragLeave={drag.onDragLeave}
      onDrop={(e) => drag.onDrop(e, node)}
      onContextMenu={(e) => onContextMenu(e, node)}
      onClick={() => {
        if (isRenaming) return
        if (node.note) onSelect(node.note)
        else if (node.assetExt) {
          // Images open inline in the editor; other assets open in Explorer
          if (IMAGE_EXTS_SET.has(node.assetExt)) onOpenAsset(node.path)
          else window.api.notes.showInExplorer(node.path)
        }
      }}
    >
      <IndentGuides depth={depth} />
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onRenameSubmit(node.path, renameValue) }
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={() => onRenameCancel()}
          className="flex-1 rounded border border-vault-accent bg-vault-bg px-1.5 py-0 text-xs text-vault-text outline-none min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : node.assetExt ? (
        <>
          {IMAGE_EXTS_SET.has(node.assetExt)
            ? <Image size={13} className="flex-shrink-0 text-vault-muted/40" />
            : <File size={13} className="flex-shrink-0 text-vault-muted/40" />
          }
          <span className="truncate text-vault-muted/80">{node.name}</span>
          <span className="ml-auto flex-shrink-0 text-[9px] font-medium uppercase text-vault-muted/50 tracking-wider">
            {node.assetExt.slice(1)}
          </span>
        </>
      ) : (
        <>
          <FileText size={13} className="flex-shrink-0 text-vault-muted/60" />
          <span className="truncate">{node.name.replace(/\.md$/, '')}</span>
        </>
      )}
    </button>
  )
}

export default function FileTree(): React.JSX.Element {
  const { notes, assets, selectedNote, setSelectedNote, loadNotes, loadAssets, activeConfig } = useVaultStore()
  const { openTab, openAssetTab, renameItemPath, closeTab, tabs } = useEditorStore()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<'note' | 'folder' | null>(null)
  const [newName, setNewName] = useState('')
  // createTarget: explicit parent folder for context-menu triggered create
  // (overrides getCreateParent's selectedNote-based logic)
  const [createTarget, setCreateTarget] = useState<string | null>(null)
  const newNameRef = useRef<HTMLInputElement>(null)
  const [emptyFolders, setEmptyFolders] = useState<string[]>([])
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const dragSrcRef = useRef<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null)

  useEffect(() => {
    if (creating) newNameRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (activeConfig) { loadNotes(); loadAssets() }
  }, [activeConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const reload = (): void => { loadNotes(); loadAssets() }
    const off1 = window.api.vault.onFileCreated(reload)
    const off2 = window.api.vault.onFileDeleted(reload)
    const off3 = window.api.vault.onFileChanged(reload)
    const off4 = window.api.vault.onRegistryChanged(reload) // picks up post-import reindex
    return () => { off1(); off2(); off3(); off4() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (createTarget !== null) return createTarget
    if (!selectedNote) return ''
    const parts = selectedNote.relativePath.split('/')
    return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  }

  function startCreating(type: 'note' | 'folder', targetFolder?: string): void {
    setNewName('')
    setCreateTarget(targetFolder ?? null)
    setCreating(type)
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) { setCreating(null); setCreateTarget(null); return }
    const parent = getCreateParent()
    const relPath = parent ? `${parent}/${trimmed}` : trimmed

    try {
      if (creating === 'note') {
        const notePath = relPath.endsWith('.md') ? relPath : `${relPath}.md`
        await window.api.notes.write(notePath, '')
        await loadNotes()
        const newNote = useVaultStore.getState().notes.find((n) => n.relativePath === notePath)
        if (newNote) { setSelectedNote(newNote); openTab(newNote) }
      } else {
        await window.api.notes.createFolder(relPath)
        setEmptyFolders((prev) => [...prev, relPath])
        await loadNotes()
      }
    } catch (err) {
      console.error('Failed to create:', err)
    }
    setCreating(null)
    setCreateTarget(null)
    setNewName('')
  }

  function cancelCreate(): void {
    setCreating(null)
    setCreateTarget(null)
    setNewName('')
  }

  // ── Inline rename ────────────────────────────────────────────────────────

  function startRename(path: string): void {
    setRenamingPath(path)
  }

  async function handleRenameSubmit(oldPath: string, newName: string): Promise<void> {
    setRenamingPath(null)
    const trimmed = newName.trim()
    if (!trimmed) return
    const parts = oldPath.split('/')
    const isFile = oldPath.endsWith('.md')
    const newBaseName = isFile
      ? (trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
      : trimmed
    parts[parts.length - 1] = newBaseName
    const newPath = parts.join('/')
    if (newPath === oldPath) return
    try {
      await window.api.notes.rename(oldPath, newPath)
      renameItemPath(oldPath, newPath)
      await loadNotes()
    } catch (err) {
      console.error('Rename failed:', err)
    }
  }

  function handleRenameCancel(): void {
    setRenamingPath(null)
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(node: TreeNode): Promise<void> {
    const label = node.isFolder ? `folder "${node.name}" and all its contents` : `"${node.name.replace(/\.md$/, '')}"`
    const confirmed = await window.api.notes.confirm(`Delete ${label}?\n\nThis cannot be undone.`)
    if (!confirmed) return
    try {
      await window.api.notes.delete(node.path)
      // Close any open tabs for deleted item
      if (!node.isFolder) {
        const tab = tabs.find((t) => t.relativePath === node.path)
        if (tab) closeTab(tab.id)
      } else {
        tabs.filter((t) => t.relativePath.startsWith(node.path + '/')).forEach((t) => closeTab(t.id))
      }
      await loadNotes()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  // ── Context menu ─────────────────────────────────────────────────────────

  function openContextMenu(e: React.MouseEvent, node: TreeNode): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  function buildContextItems(node: TreeNode): ContextMenuItem[] {
    const folderForNew = node.isFolder
      ? node.path
      : node.path.split('/').slice(0, -1).join('/')

    const items: ContextMenuItem[] = []

    // Create in same folder
    items.push({
      label: 'New note',
      icon: 'file-text',
      onClick: () => startCreating('note', folderForNew)
    })
    items.push({
      label: 'New folder',
      icon: 'folder-plus',
      onClick: () => startCreating('folder', folderForNew)
    })

    items.push({ separator: true, label: '' })

    items.push({
      label: 'Rename…',
      icon: 'pencil',
      onClick: () => startRename(node.path)
    })

    items.push({ separator: true, label: '' })

    items.push({
      label: 'Copy path',
      icon: 'copy',
      onClick: () => navigator.clipboard.writeText(node.path)
    })

    items.push({
      label: 'Show in Explorer',
      icon: 'folder-open',
      onClick: () => window.api.notes.showInExplorer(node.path)
    })

    items.push({ separator: true, label: '' })

    items.push({
      label: 'Delete',
      icon: 'trash',
      danger: true,
      onClick: () => handleDelete(node)
    })

    return items
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, path: string): void {
    dragSrcRef.current = path
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, path: string): void {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverPath(path)
  }

  function handleDragLeave(e: React.DragEvent): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverPath(null)
    }
  }

  async function handleDrop(e: React.DragEvent, targetNode: TreeNode): Promise<void> {
    e.preventDefault()
    e.stopPropagation()
    setDragOverPath(null)

    const src = dragSrcRef.current
    dragSrcRef.current = null
    if (!src) return

    const destFolder = targetNode.isFolder
      ? targetNode.path
      : targetNode.path.split('/').slice(0, -1).join('/')

    const srcName = src.split('/').pop()!
    const newPath = destFolder ? `${destFolder}/${srcName}` : srcName

    if (src === newPath) return
    if (newPath.startsWith(src + '/')) return

    try {
      await window.api.notes.rename(src, newPath)
      renameItemPath(src, newPath)
      await loadNotes()
    } catch (err) {
      console.error('Move failed:', err)
    }
  }

  const dragHandlers: DragHandlers = {
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    dragOverPath,
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.toLowerCase()
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.relativePath.toLowerCase().includes(q))
  }, [notes, search])

  const tree = useMemo(() => buildTree(filtered, emptyFolders, assets), [filtered, emptyFolders, assets])

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
                className="text-vault-muted hover:text-vault-text hover:bg-vault-border/40 rounded p-1 transition-colors"
              >
                <FilePlus size={14} />
              </button>
              <button
                onClick={() => startCreating('folder')}
                title="New folder"
                className="text-vault-muted hover:text-vault-text hover:bg-vault-border/40 rounded p-1 transition-colors"
              >
                <FolderPlus size={14} />
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
            <button type="submit" className="rounded bg-vault-accent/20 hover:bg-vault-accent/30 px-2 py-1 text-xs text-vault-accent transition-colors flex items-center">✓</button>
            <button type="button" onClick={cancelCreate} className="rounded hover:bg-vault-border/40 px-2 py-1 text-xs text-vault-muted transition-colors flex items-center">✕</button>
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
      <div
        className="flex-1 overflow-y-auto py-1"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
        onDrop={async (e) => {
          e.preventDefault()
          const src = dragSrcRef.current
          dragSrcRef.current = null
          setDragOverPath(null)
          if (!src) return
          const srcName = src.split('/').pop()!
          if (src === srcName) return
          try {
            await window.api.notes.rename(src, srcName)
            renameItemPath(src, srcName)
            await loadNotes()
          } catch (err) { console.error('Move failed:', err) }
        }}
      >
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
              onOpenAsset={openAssetTab}
              drag={dragHandlers}
              renamingPath={renamingPath}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={handleRenameCancel}
              onContextMenu={openContextMenu}
            />
          ))
        )}
      </div>

      {/* Context menu portal */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
