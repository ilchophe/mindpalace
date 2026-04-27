import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { IPC } from '../../types'
import type { ConnectRemotePayload } from '../../types'
import { vaultService } from '../services/VaultService'
import { gitService } from '../services/GitService'
import { syncService } from '../services/SyncService'
import { authService } from '../services/AuthService'

function requireConfig() {
  const config = vaultService.getActiveConfig()
  if (!config) throw new Error('No vault is currently open')
  return config
}

function requireToken() {
  const token = authService.getToken()
  if (!token) throw new Error('Not authenticated with GitHub')
  return token
}

function requireAuthor() {
  const user = authService.getUser()
  return { name: user?.name ?? 'MindPalace', email: user?.email ?? 'mindpalace@local' }
}

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, ...args))
}

export function registerGitHandlers(): void {
  // ── Status ──────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GIT.STATUS, async () => {
    const config = requireConfig()
    const isRepo = await gitService.isRepo(config.localPath)
    if (!isRepo) return { isRepo: false, files: [] }
    return { isRepo: true, files: await gitService.status(config.localPath) }
  })

  // ── Log ─────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GIT.GET_LOG, async (_e, depth = 20) => {
    const config = requireConfig()
    return gitService.getLog(config.localPath, depth)
  })

  // ── Manual sync ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GIT.SYNC, async () => {
    const config = requireConfig()
    await syncService.syncNow(config)
  })

  // ── Conflict resolution ──────────────────────────────────────────────────

  ipcMain.handle(
    IPC.GIT.RESOLVE_CONFLICT,
    async (_e, filepath: string, resolution: 'ours' | 'theirs') => {
      const config = requireConfig()
      const token = requireToken()
      const author = requireAuthor()
      const absPath = join(config.localPath, filepath)

      const raw = readFileSync(absPath, 'utf8')
      const resolved = gitService.resolveConflictMarkers(raw, resolution)
      writeFileSync(absPath, resolved, 'utf8')

      // Stage the resolved file
      await gitService.addAll(config.localPath)

      // Commit the resolution
      await gitService.commit(
        config.localPath,
        `resolve conflict: ${filepath} [${resolution}]`,
        author
      )

      // Push
      await gitService.push(config.localPath, token, 'origin', config.githubBranch)

      broadcast(IPC.GIT.SYNC_STATUS, {
        status: 'idle',
        pushedAt: new Date().toISOString()
      })
    }
  )

  // ── Init repo ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GIT.INIT_REPO, async () => {
    const config = requireConfig()
    const alreadyRepo = await gitService.isRepo(config.localPath)
    if (!alreadyRepo) {
      await gitService.init(config.localPath)
    }
    return { isRepo: true }
  })

  // ── Connect remote (init + add remote + initial push) ───────────────────

  ipcMain.handle(IPC.GIT.CONNECT_REMOTE, async (_e, payload: ConnectRemotePayload) => {
    const config = requireConfig()
    const token = requireToken()
    const author = requireAuthor()

    let cloneUrl: string

    if (payload.action === 'create') {
      if (!payload.repoName) throw new Error('repoName is required for action === "create"')
      cloneUrl = await gitService.createGitHubRepo(
        payload.repoName,
        token,
        payload.isPrivate ?? true
      )
    } else {
      if (!payload.repoUrl) throw new Error('repoUrl is required for action === "link"')
      cloneUrl = payload.repoUrl
    }

    // Init if needed
    const isRepo = await gitService.isRepo(config.localPath)
    if (!isRepo) await gitService.init(config.localPath)

    // Set remote
    await gitService.addRemote(config.localPath, cloneUrl)

    // Stage + commit everything
    await gitService.addAll(config.localPath)
    if (await gitService.hasChanges(config.localPath)) {
      await gitService.commit(config.localPath, 'initial commit [MindPalace]', author)
    }

    // Pull first in case repo has content (auto_init etc.)
    try {
      await gitService.pull(config.localPath, token, author, config.githubBranch)
    } catch {
      // New empty repo — pull will fail with no-commits; that's fine
    }

    // Push
    await gitService.push(config.localPath, token, 'origin', config.githubBranch)

    // Extract owner/repo from clone URL and persist to VaultConfig
    const repoMatch = cloneUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
    const githubRepo = repoMatch?.[1] ?? null
    vaultService.updateConfig({ githubRepo })

    // Tell the renderer to refresh activeConfig so SyncPanel shows the repo
    broadcast(IPC.VAULT.REGISTRY_CHANGED)

    broadcast(IPC.GIT.SYNC_STATUS, {
      status: 'idle',
      pushedAt: new Date().toISOString()
    })

    return { githubRepo, cloneUrl }
  })

  // ── Set sync interval ────────────────────────────────────────────────────

  ipcMain.handle(IPC.GIT.SET_SYNC_INTERVAL, (_e, minutes: number) => {
    requireConfig() // throws if no active vault
    const updated = vaultService.updateConfig({ syncIntervalMinutes: minutes })
    syncService.restartAutoSync(updated)
    return updated
  })

  // ── List user's GitHub repos ─────────────────────────────────────────────

  ipcMain.handle(IPC.GIT.LIST_GITHUB_REPOS, async () => {
    const token = requireToken()
    return gitService.listGitHubRepos(token)
  })

  // ── Create GitHub repo (used when connecting) ────────────────────────────

  ipcMain.handle(IPC.GIT.CREATE_GITHUB_REPO, async (_e, name: string, isPrivate = true) => {
    const token = requireToken()
    const cloneUrl = await gitService.createGitHubRepo(name, token, isPrivate)
    return { cloneUrl }
  })
}
