import React, { useState, useEffect, useRef } from 'react'
import type { VaultSummary } from '@shared'
import { useVaultStore } from '../../stores/vaultStore'

interface Props {
  vault: VaultSummary
  onClose: () => void
}

type Step = 'confirm' | 'final'

export default function DeleteVaultModal({ vault, onClose }: Props): React.JSX.Element {
  const { deleteVault } = useVaultStore()
  const [step, setStep] = useState<Step>('confirm')
  const [typed, setTyped] = useState('')
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [error, setError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // 3-second hold-to-confirm state for the final step
  const [holdProgress, setHoldProgress] = useState(0)
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const nameMatches = typed === vault.name

  useEffect(() => {
    return () => { if (holdTimer.current) clearInterval(holdTimer.current) }
  }, [])

  function startHold(): void {
    if (!nameMatches) return
    holdTimer.current = setInterval(() => {
      setHoldProgress((p) => {
        if (p >= 100) {
          clearInterval(holdTimer.current!)
          return 100
        }
        return p + 100 / 30 // fill in 3 s
      })
    }, 100)
  }

  function stopHold(): void {
    if (holdTimer.current) clearInterval(holdTimer.current)
    setHoldProgress(0)
  }

  async function handleDelete(): Promise<void> {
    if (holdProgress < 100) return
    setIsDeleting(true)
    const err = await deleteVault(vault.id, vault.name, deleteRemote)
    setIsDeleting(false)
    if (err) { setError(err); return }
    onClose()
  }

  useEffect(() => {
    if (holdProgress >= 100) handleDelete()
  }, [holdProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-[480px] rounded-2xl border border-vault-border bg-vault-surface shadow-2xl p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'confirm' ? (
          <>
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h2 className="text-lg font-semibold text-vault-text">Delete &ldquo;{vault.name}&rdquo;?</h2>
                <p className="text-sm text-vault-muted mt-1">This will remove the vault from MindPalace and <strong className="text-vault-text">permanently delete all local files</strong> at:</p>
                <p className="mt-1 text-xs font-mono text-vault-accent break-all">{vault.localPath}</p>
              </div>
            </div>

            {vault.githubRepo && (
              <label className="flex items-start gap-3 p-3 rounded-lg border border-vault-border cursor-pointer hover:border-red-500/50 transition-colors">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-red-500"
                  checked={deleteRemote}
                  onChange={(e) => setDeleteRemote(e.target.checked)}
                />
                <div>
                  <p className="text-sm text-vault-text">Also permanently delete GitHub repository</p>
                  <p className="text-xs font-mono text-vault-accent">{vault.githubRepo}</p>
                  {deleteRemote && (
                    <p className="text-xs text-red-400 mt-1">
                      ⛔ Destroys all issues, pull requests, and git history. Cannot be undone.
                    </p>
                  )}
                </div>
              </label>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-vault-muted">
                Type <span className="font-mono font-semibold text-vault-text">{vault.name}</span> to confirm:
              </label>
              <input
                autoFocus
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && nameMatches) setStep('final') }}
                className="rounded-lg border border-vault-border bg-vault-bg px-3 py-2 text-sm text-vault-text outline-none focus:border-vault-accent"
                placeholder={vault.name}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn-danger"
                disabled={!nameMatches}
                onClick={() => setStep('final')}
              >
                Delete vault →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="text-2xl">⛔</span>
              <div>
                <h2 className="text-lg font-semibold text-vault-text">Last chance</h2>
                <p className="text-sm text-vault-muted mt-1">You are about to permanently delete:</p>
                <ul className="mt-2 text-sm space-y-1">
                  <li className="text-vault-text">• Local vault: <span className="font-mono text-xs text-vault-accent break-all">{vault.localPath}</span></li>
                  {deleteRemote && vault.githubRepo && (
                    <li className="text-red-400">• GitHub repo: <span className="font-mono text-xs">{vault.githubRepo}</span></li>
                  )}
                </ul>
                <p className="text-sm text-red-400 mt-3 font-semibold">There is no undo.</p>
              </div>
            </div>

            {/* Hold-to-confirm button */}
            <div className="relative overflow-hidden rounded-xl">
              <button
                className="relative w-full py-3 rounded-xl border-2 border-red-600 bg-red-900/30 text-red-300 font-semibold text-sm select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={isDeleting}
                onMouseDown={startHold}
                onMouseUp={stopHold}
                onMouseLeave={stopHold}
                onTouchStart={startHold}
                onTouchEnd={stopHold}
              >
                {isDeleting ? 'Deleting…' : 'Hold to delete forever'}
              </button>
              {holdProgress > 0 && (
                <div
                  className="absolute bottom-0 left-0 h-1 bg-red-500 transition-none rounded-b-xl"
                  style={{ width: `${holdProgress}%` }}
                />
              )}
            </div>

            <div className="flex justify-start">
              <button className="btn-ghost" onClick={() => setStep('confirm')}>← Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
