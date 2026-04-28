import React, { useState } from 'react'
import { X, Copy, GitBranch, RefreshCw } from 'lucide-react'
import type { VaultSummary } from '@shared'
import { useVaultStore } from '../../stores/vaultStore'
import { useSyncStore } from '../../stores/syncStore'

const SYNC_OPTIONS = [
  { label: 'Never',        value: 0  },
  { label: 'Every 5 min',  value: 5  },
  { label: 'Every 15 min', value: 15 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every hour',   value: 60 },
]

interface Props {
  vault: VaultSummary
  onClose: () => void
  onDeleteRequest: () => void
}

export default function VaultSettingsModal({ vault, onClose, onDeleteRequest }: Props): React.JSX.Element {
  const { activeVault, activeConfig, renameVault, updateLabels } = useVaultStore()
  const { openConnectModal } = useSyncStore()
  const isActive = vault.id === activeVault?.id

  const [name, setName]           = useState(vault.name)
  const [labels, setLabels]       = useState<string[]>([...vault.labels])
  const [labelInput, setLabelInput] = useState('')
  const [saving, setSaving]       = useState(false)
  const [copied, setCopied]       = useState(false)

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      if (name.trim() && name.trim() !== vault.name) {
        await renameVault(vault.id, name.trim())
      }
      if (JSON.stringify(labels.slice().sort()) !== JSON.stringify([...vault.labels].sort())) {
        await updateLabels(vault.id, labels)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function addLabel(): void {
    const l = labelInput.trim().toLowerCase()
    if (l && !labels.includes(l)) setLabels([...labels, l])
    setLabelInput('')
  }

  function removeLabel(l: string): void {
    setLabels(labels.filter((x) => x !== l))
  }

  async function handleCopyPath(): Promise<void> {
    await navigator.clipboard.writeText(vault.localPath)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleDisconnectGitHub(): Promise<void> {
    await window.api.vault.updateConfig({ githubRepo: null })
    // Registry-changed broadcast from main will refresh the store
  }

  async function handleSyncInterval(minutes: number): Promise<void> {
    await window.api.git.setSyncInterval(minutes)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[540px] max-h-[85vh] flex flex-col bg-vault-surface rounded-xl border border-vault-border shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border flex-shrink-0">
          <h2 className="text-base font-semibold text-vault-text">Vault Settings</h2>
          <button
            onClick={onClose}
            className="text-vault-muted hover:text-vault-text transition-colors p-0.5 rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

          {/* ── General ─────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-vault-muted uppercase tracking-wider">General</h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-vault-text">Vault name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-vault-border bg-vault-bg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent placeholder:text-vault-muted"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-vault-text">Local path</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={vault.localPath}
                  className="flex-1 rounded-lg border border-vault-border bg-vault-bg/50 px-3 py-1.5 text-sm text-vault-muted outline-none cursor-default"
                />
                <button
                  onClick={handleCopyPath}
                  className="btn-secondary px-2.5"
                  title="Copy path"
                >
                  {copied ? <RefreshCw size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </section>

          {/* ── GitHub ──────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-vault-muted uppercase tracking-wider">GitHub</h3>

            {vault.githubRepo ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-vault-border bg-vault-bg/50">
                <GitBranch size={15} className="text-vault-accent flex-shrink-0" />
                <span className="text-sm text-vault-text flex-1 truncate">{vault.githubRepo}</span>
                {isActive && (
                  <button
                    className="btn-secondary text-xs px-2.5 py-1"
                    onClick={handleDisconnectGitHub}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-vault-muted">No GitHub repository connected.</p>
                {isActive ? (
                  <button
                    className="btn-primary text-xs self-start"
                    onClick={() => { onClose(); openConnectModal() }}
                  >
                    Connect to GitHub
                  </button>
                ) : (
                  <p className="text-xs text-vault-muted italic">
                    Open this vault first to connect a GitHub repository.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* ── Auto-sync (active + connected only) ─────────────────────── */}
          {isActive && vault.githubRepo && activeConfig && (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-vault-muted uppercase tracking-wider">Auto-Sync</h3>
              <div className="flex items-center justify-between">
                <label className="text-sm text-vault-text">Sync interval</label>
                <select
                  value={activeConfig.syncIntervalMinutes ?? 0}
                  onChange={(e) => handleSyncInterval(Number(e.target.value))}
                  className="rounded-lg border border-vault-border bg-vault-surface px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent"
                >
                  {SYNC_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </section>
          )}

          {/* ── Labels ──────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-vault-muted uppercase tracking-wider">Labels</h3>

            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <span
                    key={l}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-vault-border text-xs text-vault-text"
                  >
                    {l}
                    <button
                      onClick={() => removeLabel(l)}
                      className="text-vault-muted hover:text-red-400 transition-colors"
                      aria-label={`Remove label ${l}`}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel() } }}
                placeholder="Add label…"
                className="flex-1 rounded-lg border border-vault-border bg-vault-bg px-3 py-1.5 text-sm text-vault-text outline-none focus:border-vault-accent placeholder:text-vault-muted"
              />
              <button className="btn-secondary text-sm" onClick={addLabel}>Add</button>
            </div>
          </section>

          {/* ── Danger zone ─────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-red-400/80 uppercase tracking-wider">Danger Zone</h3>
            <div className="flex items-center justify-between p-3 rounded-lg border border-red-900/40 bg-red-950/20">
              <div>
                <p className="text-sm text-vault-text">Delete vault</p>
                <p className="text-xs text-vault-muted mt-0.5">Permanently removes local files. Cannot be undone.</p>
              </div>
              <button
                className="btn-danger text-xs px-3"
                onClick={() => { onClose(); onDeleteRequest() }}
              >
                Delete…
              </button>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-vault-border flex justify-end gap-2 flex-shrink-0">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
