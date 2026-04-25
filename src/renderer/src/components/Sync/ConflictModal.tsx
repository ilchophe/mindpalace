import React, { useEffect, useState } from 'react'
import { useSyncStore } from '../../stores/syncStore'

export default function ConflictModal(): React.JSX.Element | null {
  const { conflicts, isConflictModalOpen, resolveConflict, dismissConflicts } = useSyncStore()
  const [currentIdx, setCurrentIdx] = useState(0)
  const [rawContent, setRawContent] = useState('')
  const [resolving, setResolving] = useState(false)

  const filepath = conflicts[currentIdx]

  useEffect(() => {
    if (!filepath) return
    window.api.notes.read(filepath).then(setRawContent).catch(() => setRawContent(''))
  }, [filepath])

  if (!isConflictModalOpen || conflicts.length === 0) return null

  const oursMatch = rawContent.match(/<<<<<<< [^\n]+\n([\s\S]*?)=======/)?.[1] ?? ''
  const theirsMatch = rawContent.match(/=======\n([\s\S]*?)>>>>>>> [^\n]+/)?.[1] ?? ''

  async function handleResolve(resolution: 'ours' | 'theirs'): Promise<void> {
    if (!filepath) return
    setResolving(true)
    try {
      await resolveConflict(filepath, resolution)
      if (currentIdx < conflicts.length - 1) {
        setCurrentIdx((i) => i + 1)
      }
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-vault-surface border border-vault-border rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-vault-border">
          <div>
            <h2 className="text-sm font-semibold text-vault-text">Merge Conflict</h2>
            <p className="text-xs text-vault-muted mt-0.5">
              {currentIdx + 1} of {conflicts.length} — <span className="text-vault-accent">{filepath}</span>
            </p>
          </div>
          <button className="text-vault-muted hover:text-vault-text text-lg" onClick={dismissConflicts}>×</button>
        </div>

        {/* Diff panes */}
        <div className="flex flex-1 overflow-hidden divide-x divide-vault-border">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 text-xs text-vault-muted bg-vault-bg border-b border-vault-border font-medium">Your version</div>
            <pre className="flex-1 overflow-auto p-3 text-xs text-vault-text font-mono whitespace-pre-wrap">
              {oursMatch || <span className="text-vault-muted italic">empty</span>}
            </pre>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 text-xs text-vault-muted bg-vault-bg border-b border-vault-border font-medium">Remote version</div>
            <pre className="flex-1 overflow-auto p-3 text-xs text-vault-text font-mono whitespace-pre-wrap">
              {theirsMatch || <span className="text-vault-muted italic">empty</span>}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-vault-border">
          <button className="btn-ghost text-xs" onClick={dismissConflicts}>Skip for now</button>
          <div className="flex gap-2">
            <button
              className="btn-secondary text-xs"
              onClick={() => handleResolve('theirs')}
              disabled={resolving}
            >
              Use Remote
            </button>
            <button
              className="btn-primary text-xs"
              onClick={() => handleResolve('ours')}
              disabled={resolving}
            >
              Keep Mine
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
