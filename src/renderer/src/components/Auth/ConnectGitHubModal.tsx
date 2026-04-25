import React, { useEffect, useRef, useState } from 'react'
import { useSyncStore } from '../../stores/syncStore'
import { useVaultStore } from '../../stores/vaultStore'
import type { GitHubRepo } from '@shared'

type Step = 'client-id' | 'device-flow' | 'connect-vault' | 'done'

export default function ConnectGitHubModal(): React.JSX.Element {
  const { authStatus, deviceFlow, closeConnectModal, setClientId, startDeviceFlow, pollDeviceAuth, connectRemote, listGitHubRepos } = useSyncStore()
  const { activeVault, activeConfig } = useVaultStore()

  const [step, setStep] = useState<Step>(
    authStatus?.clientId ? (authStatus.isAuthenticated ? 'connect-vault' : 'device-flow') : 'client-id'
  )
  const [clientIdInput, setClientIdInput] = useState(authStatus?.clientId ?? '')
  const [pollError, setPollError] = useState('')
  const [connectAction, setConnectAction] = useState<'create' | 'link'>('create')
  const [repoName, setRepoName] = useState(activeVault?.slug ?? '')
  const [isPrivate, setIsPrivate] = useState(true)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selectedRepoUrl, setSelectedRepoUrl] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start polling when we're on device-flow step and have a deviceFlow code
  useEffect(() => {
    if (step !== 'device-flow' || !deviceFlow) return

    const interval = (deviceFlow.interval + 1) * 1000
    pollTimer.current = setInterval(async () => {
      const result = await pollDeviceAuth()
      if (!result) return
      if (result.status === 'authorized') {
        clearInterval(pollTimer.current!)
        setStep('connect-vault')
        loadRepos()
      } else if (result.status === 'expired' || result.status === 'denied') {
        clearInterval(pollTimer.current!)
        setPollError(result.status === 'expired' ? 'Code expired. Please try again.' : 'Access denied.')
      } else if (result.status === 'error') {
        clearInterval(pollTimer.current!)
        setPollError(result.errorMessage ?? 'Authentication failed.')
      } else if (result.status === 'slow_down') {
        // Reduce polling frequency
        clearInterval(pollTimer.current!)
        pollTimer.current = setInterval(async () => {
          const r2 = await pollDeviceAuth()
          if (r2?.status === 'authorized') {
            clearInterval(pollTimer.current!)
            setStep('connect-vault')
            loadRepos()
          }
        }, interval * 2)
      }
    }, interval)

    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [step, deviceFlow]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRepos(): Promise<void> {
    try {
      const list = await listGitHubRepos()
      setRepos(list)
      if (list.length > 0) setSelectedRepoUrl(list[0].cloneUrl)
    } catch { /* not critical */ }
  }

  async function handleSaveClientId(): Promise<void> {
    if (!clientIdInput.trim()) return
    setIsBusy(true)
    try {
      await setClientId(clientIdInput.trim())
      if (authStatus?.isAuthenticated) {
        setStep('connect-vault')
        loadRepos()
      } else {
        setStep('device-flow')
        await startDeviceFlow()
      }
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleStartDeviceFlow(): Promise<void> {
    setPollError('')
    setIsBusy(true)
    try {
      await startDeviceFlow()
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleConnect(): Promise<void> {
    setIsBusy(true)
    setErrorMsg('')
    try {
      await connectRemote(
        connectAction === 'create'
          ? { action: 'create', repoName, isPrivate }
          : { action: 'link', repoUrl: selectedRepoUrl }
      )
      setStep('done')
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setIsBusy(false)
    }
  }

  function copyCode(): void {
    if (deviceFlow?.userCode) navigator.clipboard.writeText(deviceFlow.userCode)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-vault-surface border border-vault-border rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-vault-border">
          <h2 className="text-sm font-semibold text-vault-text">Connect to GitHub</h2>
          <button className="text-vault-muted hover:text-vault-text text-lg leading-none" onClick={closeConnectModal}>×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Step: client-id */}
          {step === 'client-id' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-vault-text">
                MindPalace uses GitHub's Device Flow to authenticate. You need a{' '}
                <strong>GitHub OAuth App</strong> Client ID (it's free and public).
              </p>
              <ol className="text-xs text-vault-muted list-decimal pl-4 space-y-1">
                <li>Go to <span className="text-vault-accent">github.com/settings/developers</span> → "OAuth Apps" → "New"</li>
                <li>Set any name + homepage URL; leave callback blank</li>
                <li>Copy the <strong>Client ID</strong> and paste it below</li>
              </ol>
              <input
                autoFocus
                className="px-3 py-2 text-sm bg-vault-bg border border-vault-border rounded-lg text-vault-text outline-none focus:border-vault-accent"
                placeholder="Ov23li..."
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveClientId()}
              />
              {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
            </div>
          )}

          {/* Step: device-flow */}
          {step === 'device-flow' && (
            <div className="flex flex-col gap-4">
              {!deviceFlow ? (
                <>
                  <p className="text-sm text-vault-text">Click below to start GitHub authentication.</p>
                  {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
                </>
              ) : (
                <>
                  <p className="text-sm text-vault-text">
                    Open <span className="text-vault-accent font-medium">{deviceFlow.verificationUri}</span> in your browser and enter this code:
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 py-3 px-4 rounded-lg bg-vault-bg border border-vault-border text-2xl font-mono tracking-[0.3em] text-vault-accent text-center select-all">
                      {deviceFlow.userCode}
                    </div>
                    <button className="btn-secondary text-xs" onClick={copyCode}>Copy</button>
                  </div>
                  <p className="text-xs text-vault-muted text-center">
                    Waiting for authorization… (expires in {Math.floor(deviceFlow.expiresIn / 60)} min)
                  </p>
                  {pollError && <p className="text-xs text-red-400 text-center">{pollError}</p>}
                </>
              )}
            </div>
          )}

          {/* Step: connect-vault */}
          {step === 'connect-vault' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-vault-text">
                Authenticated as <strong className="text-vault-accent">{authStatus?.user?.login}</strong>.
                Connect vault <strong>{activeConfig?.name}</strong> to GitHub:
              </p>

              <div className="flex gap-3">
                {(['create', 'link'] as const).map((a) => (
                  <button
                    key={a}
                    className={['flex-1 py-2 text-sm rounded-lg border transition-colors', connectAction === a ? 'border-vault-accent text-vault-accent bg-vault-accent/10' : 'border-vault-border text-vault-muted hover:border-vault-accent'].join(' ')}
                    onClick={() => setConnectAction(a)}
                  >
                    {a === 'create' ? 'Create new repo' : 'Link existing repo'}
                  </button>
                ))}
              </div>

              {connectAction === 'create' ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-vault-muted">Repository name</label>
                  <input
                    className="px-3 py-2 text-sm bg-vault-bg border border-vault-border rounded-lg text-vault-text outline-none focus:border-vault-accent"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-xs text-vault-muted cursor-pointer">
                    <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="accent-[var(--vault-accent)]" />
                    Private repository
                  </label>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-vault-muted">Select repository</label>
                  {repos.length > 0 ? (
                    <select
                      className="px-3 py-2 text-sm bg-vault-bg border border-vault-border rounded-lg text-vault-text outline-none focus:border-vault-accent"
                      value={selectedRepoUrl}
                      onChange={(e) => setSelectedRepoUrl(e.target.value)}
                    >
                      {repos.map((r) => (
                        <option key={r.cloneUrl} value={r.cloneUrl}>{r.fullName}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="px-3 py-2 text-sm bg-vault-bg border border-vault-border rounded-lg text-vault-text outline-none focus:border-vault-accent"
                      placeholder="https://github.com/owner/repo.git"
                      value={selectedRepoUrl}
                      onChange={(e) => setSelectedRepoUrl(e.target.value)}
                    />
                  )}
                </div>
              )}

              {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="text-3xl">✓</div>
              <p className="text-sm text-vault-text text-center">
                Vault connected to GitHub!<br />
                <span className="text-vault-muted text-xs">Notes will sync automatically on save.</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-vault-border">
          <button className="btn-secondary" onClick={closeConnectModal}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
          {step === 'client-id' && (
            <button className="btn-primary" onClick={handleSaveClientId} disabled={!clientIdInput.trim() || isBusy}>
              {isBusy ? 'Saving…' : 'Continue'}
            </button>
          )}
          {step === 'device-flow' && !deviceFlow && (
            <button className="btn-primary" onClick={handleStartDeviceFlow} disabled={isBusy}>
              {isBusy ? 'Starting…' : 'Authenticate with GitHub'}
            </button>
          )}
          {step === 'connect-vault' && (
            <button className="btn-primary" onClick={handleConnect} disabled={isBusy || (connectAction === 'link' && !selectedRepoUrl)}>
              {isBusy ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
