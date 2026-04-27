import React, { useState, useMemo } from 'react'
import { FolderOpen, Plus, X, Database, Upload } from 'lucide-react'
import type { VaultSummary } from '@shared'
import { slugify } from '@shared'
import { useVaultStore } from '../../stores/vaultStore'
import VaultCard from './VaultCard'
import DeleteVaultModal from './DeleteVaultModal'
import ImportFolderModal from './ImportFolderModal'
import WindowControls from '../shared/WindowControls'

type SortKey = 'lastOpened' | 'name' | 'noteCount' | 'created'

function sortVaults(vaults: VaultSummary[], key: SortKey): VaultSummary[] {
  const pinned = vaults.filter((v) => v.isPinned)
  const rest = vaults.filter((v) => !v.isPinned)
  const compare = (a: VaultSummary, b: VaultSummary): number => {
    switch (key) {
      case 'name': return a.name.localeCompare(b.name)
      case 'noteCount': return b.noteCount - a.noteCount
      case 'created': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      default: {
        const ta = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0
        const tb = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0
        return tb - ta
      }
    }
  }
  return [...pinned.sort(compare), ...rest.sort(compare)]
}

interface NewVaultFormState { name: string; parentDir: string; }

export default function VaultManagerScreen(): React.JSX.Element {
  const { vaults, activeVault, closeManager, openVault, createVault } = useVaultStore()

  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('lastOpened')
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VaultSummary | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newVault, setNewVault] = useState<NewVaultFormState>({ name: '', parentDir: '' })
  const [newVaultError, setNewVaultError] = useState('')

  // Collect all unique labels
  const allLabels = useMemo(() => {
    const s = new Set<string>()
    vaults.forEach((v) => v.labels.forEach((l) => s.add(l)))
    return [...s].sort()
  }, [vaults])

  const filtered = useMemo(() => {
    let list = vaults
    if (filter.trim()) {
      const q = filter.toLowerCase()
      list = list.filter((v) => v.name.toLowerCase().includes(q) || v.labels.some((l) => l.includes(q)))
    }
    if (activeLabel) list = list.filter((v) => v.labels.includes(activeLabel))
    return sortVaults(list, sortKey)
  }, [vaults, filter, sortKey, activeLabel])

  async function handlePickAndOpen(): Promise<void> {
    const path = await window.api.vault.pickFolder()
    if (path) openVault(path)
  }

  async function handlePickParentDir(): Promise<void> {
    const path = await window.api.vault.pickFolder()
    if (path) setNewVault((s) => ({ ...s, parentDir: path }))
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setNewVaultError('')
    if (!newVault.name.trim()) { setNewVaultError('Vault name is required'); return }
    if (!newVault.parentDir.trim()) { setNewVaultError('Choose a folder location'); return }
    try {
      await createVault(newVault.name.trim(), newVault.parentDir)
      setShowNewForm(false)
      setNewVault({ name: '', parentDir: '' })
    } catch (err) {
      setNewVaultError((err as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-vault-bg">
      {/* Drag region + window controls (needed because TabBar is hidden behind this overlay) */}
      <div className="app-drag flex items-stretch h-9 flex-shrink-0 border-b border-vault-border/40">
        <div className="flex-1" />
        <WindowControls />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-vault-border">
        <h1 className="text-xl font-bold text-vault-text">MindPalace Vaults</h1>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-1.5" onClick={handlePickAndOpen}>
            <FolderOpen size={14} />
            Open existing
          </button>
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={() => setShowImportModal(true)}
          >
            <Upload size={14} />
            Import folder
          </button>
          <button className="btn-primary flex items-center gap-1.5" onClick={() => setShowNewForm(true)}>
            <Plus size={14} />
            New vault
          </button>
          {activeVault && (
            <button className="btn-ghost flex items-center gap-1.5" onClick={closeManager}>
              <X size={14} />
              Close
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-3 flex flex-wrap items-center gap-3 border-b border-vault-border">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or label…"
          className="flex-1 min-w-48 rounded-lg border border-vault-border bg-vault-surface px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent placeholder:text-vault-muted"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-vault-border bg-vault-surface px-3 py-1.5 text-sm text-vault-text outline-none"
        >
          <option value="lastOpened">Last opened</option>
          <option value="name">Name A→Z</option>
          <option value="noteCount">Note count</option>
          <option value="created">Created date</option>
        </select>

        {allLabels.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              className={`label-chip ${activeLabel === null ? 'label-chip-active' : ''}`}
              onClick={() => setActiveLabel(null)}
            >
              All
            </button>
            {allLabels.map((l) => (
              <button
                key={l}
                className={`label-chip ${activeLabel === l ? 'label-chip-active' : ''}`}
                onClick={() => setActiveLabel(activeLabel === l ? null : l)}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New vault form */}
      {showNewForm && (
        <div className="px-8 py-4 border-b border-vault-border bg-vault-surface">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-vault-muted">Vault name</label>
              <input
                autoFocus
                type="text"
                value={newVault.name}
                onChange={(e) => setNewVault((s) => ({ ...s, name: e.target.value }))}
                placeholder="My Notes"
                className="rounded-lg border border-vault-border bg-vault-bg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent w-52"
              />
              {newVault.name && (
                <p className="text-[10px] text-vault-muted">slug: {slugify(newVault.name)}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-vault-muted">Location</label>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={newVault.parentDir}
                  placeholder="Choose folder…"
                  className="rounded-lg border border-vault-border bg-vault-bg px-3 py-1.5 text-sm text-vault-text outline-none w-64 cursor-pointer"
                  onClick={handlePickParentDir}
                />
                <button type="button" className="btn-secondary text-xs" onClick={handlePickParentDir}>
                  Browse
                </button>
              </div>
            </div>
            {newVaultError && <p className="w-full text-sm text-red-400">{newVaultError}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Create</button>
              <button type="button" className="btn-ghost" onClick={() => setShowNewForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Vault grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-vault-muted">
            {vaults.length === 0 ? (
              <>
                <Database size={48} className="text-vault-border" />
                <p className="text-lg font-medium text-vault-text">No vaults yet</p>
                <p className="text-sm">Create a new vault or open an existing folder to get started.</p>
              </>
            ) : (
              <p className="text-sm">No vaults match your filter.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {filtered.map((v) => (
              <VaultCard
                key={v.id}
                vault={v}
                isActive={v.id === activeVault?.id}
                onDeleteRequest={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Deletion modal */}
      {deleteTarget && (
        <DeleteVaultModal
          vault={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Import folder modal */}
      {showImportModal && (
        <ImportFolderModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  )
}
