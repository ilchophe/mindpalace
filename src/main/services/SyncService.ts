import { BrowserWindow } from 'electron'
import type { VaultConfig, SyncStatusPayload } from '../../types'
import { IPC } from '../../types'
import { gitService } from './GitService'
import { authService } from './AuthService'

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, ...args))
}

class SyncService {
  private intervalTimer: ReturnType<typeof setInterval> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private isSyncing = false

  async syncNow(config: VaultConfig): Promise<void> {
    if (this.isSyncing) return

    const token = authService.getToken()
    if (!token) {
      broadcast(IPC.GIT.SYNC_STATUS, {
        status: 'error',
        message: 'Not authenticated with GitHub'
      } satisfies SyncStatusPayload)
      return
    }

    if (!config.githubRepo) {
      broadcast(IPC.GIT.SYNC_STATUS, {
        status: 'disconnected'
      } satisfies SyncStatusPayload)
      return
    }

    this.isSyncing = true

    try {
      broadcast(IPC.GIT.SYNC_STATUS, { status: 'pulling' } satisfies SyncStatusPayload)

      const user = authService.getUser()
      const author = {
        name: user?.name ?? 'MindPalace',
        email: user?.email ?? 'mindpalace@local'
      }

      const result = await gitService.sync(
        config.localPath,
        token,
        author,
        config.githubBranch
      )

      if (result.conflicts.length > 0) {
        broadcast(IPC.GIT.SYNC_STATUS, {
          status: 'conflict',
          conflicts: result.conflicts
        } satisfies SyncStatusPayload)
        broadcast(IPC.GIT.CONFLICT_DETECTED, result.conflicts)
      } else if (result.error) {
        broadcast(IPC.GIT.SYNC_STATUS, {
          status: 'error',
          message: result.error
        } satisfies SyncStatusPayload)
      } else {
        broadcast(IPC.GIT.SYNC_STATUS, {
          status: 'idle',
          pushedAt: new Date().toISOString()
        } satisfies SyncStatusPayload)
      }
    } catch (err: unknown) {
      broadcast(IPC.GIT.SYNC_STATUS, {
        status: 'error',
        message: (err as Error).message
      } satisfies SyncStatusPayload)
    } finally {
      this.isSyncing = false
    }
  }

  /** Called by notes:write — debounces 30s so rapid edits don't spam git. */
  scheduleSyncAfterSave(config: VaultConfig, delayMs = 30_000): void {
    if (!config.syncOnSave || !config.githubRepo) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.syncNow(config), delayMs)
  }

  startAutoSync(config: VaultConfig): void {
    this.stopAutoSync()
    if (config.syncIntervalMinutes > 0) {
      const ms = config.syncIntervalMinutes * 60_000
      this.intervalTimer = setInterval(() => this.syncNow(config), ms)
    }
  }

  stopAutoSync(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  restartAutoSync(config: VaultConfig): void {
    this.stopAutoSync()
    this.startAutoSync(config)
  }
}

export const syncService = new SyncService()
