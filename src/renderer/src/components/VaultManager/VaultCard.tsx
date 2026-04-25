import React, { useState, useRef, useEffect } from 'react'
import type { VaultSummary } from '@shared'
import { useVaultStore } from '../../stores/vaultStore'

interface Props {
  vault: VaultSummary
  isActive: boolean
  onDeleteRequest: (vault: VaultSummary) => void
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  idle:         { label: '● synced',    cls: 'text-green-400' },
  pulling:      { label: '↓ pulling',   cls: 'text-blue-400 animate-pulse' },
  pushing:      { label: '↑ pushing',   cls: 'text-blue-400 animate-pulse' },
  conflict:     { label: '⚠ conflict',  cls: 'text-yellow-400' },
  error:        { label: '✗ error',     cls: 'text-red-400' },
  disconnected: { label: '○ local only', cls: 'text-vault-muted' }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function VaultCard({ vault, isActive, onDeleteRequest }: Props): React.JSX.Element {
  const { switchVault, pinVault } = useVaultStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const badge = STATUS_BADGE[vault.syncStatus] ?? STATUS_BADGE.disconnected

  return (
    <div
      className={[
        'relative flex flex-col gap-2 rounded-xl p-4 border cursor-pointer transition-colors',
        'bg-vault-surface hover:border-vault-accent',
        isActive ? 'border-vault-accent' : 'border-vault-border'
      ].join(' ')}
      onClick={() => switchVault(vault.id)}
    >
      {/* Pin indicator */}
      {vault.isPinned && (
        <span className="absolute top-2 right-8 text-vault-accent text-xs select-none" title="Pinned">
          📌
        </span>
      )}

      {/* Context menu trigger */}
      <button
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded hover:bg-vault-border text-vault-muted hover:text-vault-text transition-colors"
        onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
        aria-label="Vault options"
      >
        ⋯
      </button>

      {/* Context menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-2 top-9 z-50 w-44 rounded-lg border border-vault-border bg-vault-surface shadow-xl py-1 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="menu-item" onClick={() => { setMenuOpen(false); switchVault(vault.id) }}>
            Open
          </button>
          <button
            className="menu-item"
            onClick={() => { setMenuOpen(false); pinVault(vault.id, !vault.isPinned) }}
          >
            {vault.isPinned ? 'Unpin' : 'Pin to top'}
          </button>
          <div className="border-t border-vault-border my-1" />
          <button
            className="menu-item text-red-400 hover:bg-red-900/20"
            onClick={() => { setMenuOpen(false); onDeleteRequest(vault) }}
          >
            Delete vault…
          </button>
        </div>
      )}

      {/* Card body */}
      <div className="pr-6">
        <p className="font-semibold text-vault-text truncate">{vault.name}</p>
        {vault.githubRepo && (
          <p className="text-xs text-vault-muted truncate mt-0.5">{vault.githubRepo}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs text-vault-muted">{vault.noteCount} notes</span>
        <span className={`text-xs ${badge.cls}`}>{badge.label}</span>
      </div>

      <p className="text-xs text-vault-muted">
        {vault.lastOpenedAt ? `opened ${timeAgo(vault.lastOpenedAt)}` : 'never opened'}
      </p>

      {/* Labels */}
      {vault.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {vault.labels.map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-full bg-vault-border text-vault-muted">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
