import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'
import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import type { VaultConfig, VaultSummary } from '../../types'
import { IPC, slugify } from '../../types'
import { vaultRegistry } from './VaultRegistry'
import { indexService } from './IndexService'
import { gitService } from './GitService'
import { syncService } from './SyncService'
import { authService } from './AuthService'

const CONFIG_DIR = '.mindpalace'
const CONFIG_FILE = 'config.json'
const SYNC_STATE_FILE = 'sync-state.json'

function defaultConfig(id: string, name: string, localPath: string): VaultConfig {
  return {
    id,
    name,
    localPath,
    githubRepo: null,
    githubBranch: 'main',
    imageStorageMode: 'subfolder',
    imageSubfolderName: 'images',
    globalImagePath: 'assets/images',
    syncOnOpen: false,
    syncOnSave: false,
    syncIntervalMinutes: 0,
    dailyNotesFolder: 'Daily Notes',
    dailyNoteTemplate: '',
    defaultEditorView: 'split',
    theme: 'dark',
    customCSSPath: null
  }
}

class VaultService {
  private watcher: FSWatcher | null = null
  private activeConfig: VaultConfig | null = null

  /** Open an existing local folder as a vault. Initialises config if missing. */
  async open(localPath: string): Promise<VaultConfig> {
    await this.close()

    const configPath = join(localPath, CONFIG_DIR, CONFIG_FILE)
    let config: VaultConfig

    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as VaultConfig
      config.localPath = localPath
      // Migration: default syncIntervalMinutes for pre-existing vaults that lack the field
      config.syncIntervalMinutes ??= 5
    } else {
      const id = randomUUID()
      const name = basename(localPath)
      config = defaultConfig(id, name, localPath)
      this.writeConfig(localPath, config)
    }

    this.activeConfig = config

    // Detect GitHub remote and update config + registry
    try {
      const remoteUrl = await gitService.getRemoteUrl(localPath)
      if (remoteUrl) {
        const repoMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)
        if (repoMatch && !config.githubRepo) {
          config.githubRepo = repoMatch[1]
          this.writeConfig(localPath, config)
        }
      }
    } catch {
      // not a git repo or no remote — fine
    }

    const syncStatus = config.githubRepo
      ? (authService.isAuthenticated() ? 'idle' : 'disconnected')
      : 'disconnected'

    // Dedup: check both by ID and by path.
    // If a path-match exists with a *different* ID (config.json was regenerated),
    // remove the stale entry so we don't accumulate duplicates.
    const byPath = vaultRegistry.getByPath(localPath)
    if (byPath && byPath.id !== config.id) {
      vaultRegistry.remove(byPath.id)
    }
    if (!vaultRegistry.getById(config.id)) {
      vaultRegistry.add(this.buildSummary(config))
    }

    vaultRegistry.setActive(config.id)
    vaultRegistry.update(config.id, {
      lastOpenedAt: new Date().toISOString(),
      githubRepo: config.githubRepo,
      syncStatus
    })

    indexService.open(localPath)
    this.startWatcher(localPath)
    syncService.startAutoSync(config)

    return config
  }

  /**
   * Create a brand-new vault directory at parentDir/<slug> and open it.
   * Returns the new VaultConfig.
   */
  async create(name: string, parentDir: string): Promise<VaultConfig> {
    const slug = slugify(name)
    const localPath = join(parentDir, slug)

    if (existsSync(localPath)) {
      throw new Error(`Directory already exists: ${localPath}`)
    }

    mkdirSync(localPath, { recursive: true })
    mkdirSync(join(localPath, CONFIG_DIR), { recursive: true })

    const id = randomUUID()
    const config = defaultConfig(id, name, localPath)
    config.name = name
    this.writeConfig(localPath, config)

    return this.open(localPath)
  }

  /** Tear down the active vault (stops watcher, closes SQLite, stops sync). */
  async close(): Promise<void> {
    syncService.stopAutoSync()
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
    indexService.close()
    this.activeConfig = null
  }

  getActiveConfig(): VaultConfig | null {
    return this.activeConfig
  }

  updateConfig(changes: Partial<VaultConfig>): VaultConfig {
    if (!this.activeConfig) throw new Error('No vault open')
    this.activeConfig = { ...this.activeConfig, ...changes }
    this.writeConfig(this.activeConfig.localPath, this.activeConfig)
    vaultRegistry.update(this.activeConfig.id, {
      name: this.activeConfig.name,
      githubRepo: this.activeConfig.githubRepo
    })
    return this.activeConfig
  }

  /** Rename any vault by ID — works for both the active vault and inactive ones. */
  renameVault(vaultId: string, newName: string): void {
    const summary = vaultRegistry.getById(vaultId)
    if (!summary) throw new Error(`Vault not found: ${vaultId}`)

    // Update registry
    vaultRegistry.update(vaultId, { name: newName })

    // If this is the active vault, update in-memory config + write file
    if (this.activeConfig?.id === vaultId) {
      this.activeConfig = { ...this.activeConfig, name: newName }
      this.writeConfig(this.activeConfig.localPath, this.activeConfig)
      return
    }

    // For inactive vaults, patch the config file on disk if it exists
    const configPath = join(summary.localPath, CONFIG_DIR, CONFIG_FILE)
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8')) as VaultConfig
        config.name = newName
        writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
      } catch {
        // Non-fatal — registry is already updated
      }
    }
  }

  /**
   * Clone a GitHub repo to parentDir/<repoName> and open it as a vault.
   * Sets VaultConfig.githubRepo from the remote URL.
   */
  async clone(repoUrl: string, parentDir: string, token: string): Promise<VaultConfig> {
    const repoName = repoUrl.split('/').pop()?.replace(/\.git$/, '') ?? 'vault'
    const localPath = join(parentDir, repoName)

    if (existsSync(localPath)) {
      throw new Error(`Directory already exists: ${localPath}`)
    }

    mkdirSync(localPath, { recursive: true })
    await gitService.clone(repoUrl, localPath, token)

    const config = await this.open(localPath)
    return config
  }

  /** Delete a vault from disk (and optionally registry). Caller handles GitHub delete. */
  async deleteLocal(vaultId: string): Promise<void> {
    const summary = vaultRegistry.getById(vaultId)
    if (!summary) throw new Error(`Vault not found: ${vaultId}`)

    if (this.activeConfig?.id === vaultId) {
      await this.close()
    }

    if (existsSync(summary.localPath)) {
      rmSync(summary.localPath, { recursive: true, force: true })
    }

    vaultRegistry.remove(vaultId)
  }

  private startWatcher(vaultPath: string): void {
    const isNetworkPath = vaultPath.startsWith('\\\\') || /^[a-zA-Z]:\\/.test(vaultPath)
    this.watcher = chokidar.watch(vaultPath, {
      ignored: /(^|[/\\])\.|node_modules/,
      persistent: true,
      ignoreInitial: true,
      usePolling: isNetworkPath,
      interval: isNetworkPath ? 1000 : undefined
    })

    const send = (channel: string, filePath: string): void => {
      const wins = BrowserWindow.getAllWindows()
      if (wins.length > 0) wins[0].webContents.send(channel, filePath)
    }

    this.watcher
      .on('change', (p) => send(IPC.VAULT.FILE_CHANGED, p))
      .on('add', (p) => {
        if (p.endsWith('.md')) {
          indexService.indexFile(p)
          send(IPC.VAULT.FILE_CREATED, p)
        }
      })
      .on('unlink', (p) => {
        if (p.endsWith('.md')) {
          indexService.removeFile(p)
          send(IPC.VAULT.FILE_DELETED, p)
        }
      })
  }

  private writeConfig(localPath: string, config: VaultConfig): void {
    const dir = join(localPath, CONFIG_DIR)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, CONFIG_FILE), JSON.stringify(config, null, 2), 'utf8')

    const syncStatePath = join(dir, SYNC_STATE_FILE)
    if (!existsSync(syncStatePath)) {
      writeFileSync(
        syncStatePath,
        JSON.stringify(
          { lastPullSHA: null, lastPushSHA: null, pendingLocalChanges: [], conflictFiles: [], syncStatus: 'idle' },
          null,
          2
        ),
        'utf8'
      )
    }
  }

  private buildSummary(config: VaultConfig): VaultSummary {
    return {
      id: config.id,
      name: config.name,
      slug: slugify(config.name),
      localPath: config.localPath,
      githubRepo: config.githubRepo,
      lastOpenedAt: new Date().toISOString(),
      noteCount: 0,
      createdAt: new Date().toISOString(),
      isPinned: false,
      labels: [],
      syncStatus: 'disconnected'
    }
  }
}

export const vaultService = new VaultService()
