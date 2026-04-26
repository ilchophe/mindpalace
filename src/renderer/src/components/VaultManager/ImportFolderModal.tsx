import React, { useEffect, useState } from 'react'
import { FolderOpen, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { ImportProgress, ImportResult } from '@shared'

const PHASE_LABELS: Record<ImportProgress['phase'], string> = {
  scanning:  'Scanning files…',
  copying:   'Copying images…',
  rewriting: 'Rewriting links…',
  indexing:  'Rebuilding index…',
  done:      'Done!'
}

interface Props {
  onClose: () => void
}

export default function ImportFolderModal({ onClose }: Props): React.JSX.Element {
  const [sourcePath, setSourcePath] = useState('')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Subscribe to progress events from main process
  useEffect(() => {
    const off = window.api.vault.onImportProgress((p) => setProgress(p))
    return off
  }, [])

  async function handlePickFolder(): Promise<void> {
    const path = await window.api.vault.pickFolder()
    if (path) setSourcePath(path)
  }

  async function handleImport(): Promise<void> {
    if (!sourcePath.trim()) return
    setError(null)
    setResult(null)
    setProgress(null)
    setIsRunning(true)
    try {
      const res = await window.api.vault.importFolder(sourcePath)
      setResult(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRunning(false)
    }
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0

  const isDone = progress?.phase === 'done'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={isDone || !isRunning ? onClose : undefined}
    >
      <div
        className="w-[520px] bg-vault-surface border border-vault-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border">
          <h2 className="text-base font-semibold text-vault-text">Import folder</h2>
          {!isRunning && (
            <button
              onClick={onClose}
              className="text-vault-muted hover:text-vault-text transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Folder picker */}
          {!isRunning && !result && (
            <>
              <p className="text-sm text-vault-muted leading-relaxed">
                Choose a folder to import into this vault. Markdown notes and images will be
                copied while preserving the folder structure. Obsidian-style{' '}
                <code className="text-vault-accent text-xs">![[image.png]]</code> embeds are
                automatically rewritten to standard Markdown.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={sourcePath}
                  placeholder="Select source folder…"
                  onClick={handlePickFolder}
                  className="flex-1 bg-vault-bg border border-vault-border rounded-lg px-3 py-2 text-sm text-vault-text outline-none cursor-pointer hover:border-vault-accent/60 transition-colors"
                />
                <button
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                  onClick={handlePickFolder}
                >
                  <FolderOpen size={14} />
                  Browse
                </button>
              </div>
              {error && (
                <p className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle size={14} />
                  {error}
                </p>
              )}
            </>
          )}

          {/* Progress */}
          {(isRunning || (progress && !result)) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-vault-text">
                <Loader2 size={14} className="animate-spin text-vault-accent" />
                <span>{progress ? PHASE_LABELS[progress.phase] : 'Starting…'}</span>
              </div>
              {progress && progress.total > 0 && (
                <>
                  <div className="w-full h-1.5 bg-vault-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-vault-accent transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-vault-muted">
                    <span>{progress.currentFile}</span>
                    <span>{progress.done} / {progress.total}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-400 font-medium">
                <CheckCircle2 size={16} />
                Import complete
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-vault-bg rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-vault-text">{result.notesImported}</p>
                  <p className="text-xs text-vault-muted mt-0.5">Notes</p>
                </div>
                <div className="bg-vault-bg rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-vault-text">{result.imagesImported}</p>
                  <p className="text-xs text-vault-muted mt-0.5">Images</p>
                </div>
                <div className="bg-vault-bg rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-vault-text">{result.referencesRewritten}</p>
                  <p className="text-xs text-vault-muted mt-0.5">Links rewritten</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="text-yellow-400 cursor-pointer">
                    {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-2 space-y-1 text-vault-muted max-h-28 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="truncate">{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-vault-border">
          {result ? (
            <button className="btn-primary text-sm" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button
                className="btn-secondary text-sm"
                onClick={onClose}
                disabled={isRunning}
              >
                Cancel
              </button>
              <button
                className="btn-primary text-sm"
                onClick={handleImport}
                disabled={!sourcePath || isRunning}
              >
                Import
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
