import { ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { IPC } from '../../types'
import type { VaultDeletePayload, CloneVaultPayload, AutoOpenResult } from '../../types'
import { vaultService } from '../services/VaultService'
import { vaultRegistry } from '../services/VaultRegistry'
import { authService } from '../services/AuthService'
import { gitService } from '../services/GitService'
import { importService } from '../services/ImportService'
import { searchService } from '../services/SearchService'

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, ...args))
}

export function registerVaultHandlers(): void {
  // ---------------------------------------------------------------------------
  // Registry queries
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Auto-open last vault on startup
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.AUTO_OPEN, async (): Promise<AutoOpenResult> => {
    const lastVault = vaultRegistry.getActive()

    // No previously active vault — fresh install or user closed all vaults
    if (!lastVault) {
      return { success: false, reason: 'no_vault' }
    }

    // Vault folder has been moved, deleted, or is on an unmounted drive
    if (!existsSync(lastVault.localPath)) {
      // Clear the stale active pointer so next getActive() returns null
      vaultRegistry.setActive(null)
      return {
        success: false,
        reason: 'path_missing',
        vaultName: lastVault.name,
        vaultPath: lastVault.localPath
      }
    }

    // Try to fully open the vault (starts watcher, index, sync)
    try {
      const config = await vaultService.open(lastVault.localPath)
      broadcast(IPC.VAULT.REGISTRY_CHANGED)
      return { success: true, config }
    } catch (err) {
      return {
        success: false,
        reason: 'open_failed',
        vaultName: lastVault.name,
        vaultPath: lastVault.localPath,
        message: (err as Error).message ?? 'Unknown error'
      }
    }
  })

  // ---------------------------------------------------------------------------
  // Registry queries
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.LIST, () => vaultRegistry.getAll())

  ipcMain.handle(IPC.VAULT.GET_ACTIVE, () => vaultRegistry.getActive())

  // ---------------------------------------------------------------------------
  // Vault lifecycle
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.OPEN, async (_e, localPath: string) => {
    const config = await vaultService.open(localPath)
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
    return config
  })

  ipcMain.handle(IPC.VAULT.CREATE, async (_e, name: string, parentDir: string) => {
    const config = await vaultService.create(name, parentDir)
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
    return config
  })

  ipcMain.handle(IPC.VAULT.CLOSE, async () => {
    await vaultService.close()
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
  })

  ipcMain.handle(IPC.VAULT.SWITCH, async (_e, vaultId: string) => {
    const summary = vaultRegistry.getById(vaultId)
    if (!summary) throw new Error(`Vault not found: ${vaultId}`)
    const config = await vaultService.open(summary.localPath)
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
    return config
  })

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.GET_CONFIG, () => vaultService.getActiveConfig())

  ipcMain.handle(IPC.VAULT.UPDATE_CONFIG, (_e, changes) => vaultService.updateConfig(changes))

  // ---------------------------------------------------------------------------
  // Registry mutations
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.PIN, (_e, vaultId: string, pinned: boolean) => {
    vaultRegistry.update(vaultId, { isPinned: pinned })
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
  })

  ipcMain.handle(IPC.VAULT.UPDATE_LABELS, (_e, vaultId: string, labels: string[]) => {
    vaultRegistry.update(vaultId, { labels })
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
  })

  ipcMain.handle(IPC.VAULT.RENAME, (_e, vaultId: string, newName: string) => {
    vaultService.renameVault(vaultId, newName)
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
  })

  // ---------------------------------------------------------------------------
  // Deletion (two server-side validations: typed confirmation + path existence)
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.DELETE, async (_e, payload: VaultDeletePayload) => {
    const { vaultId, confirmation, deleteRemote } = payload
    const summary = vaultRegistry.getById(vaultId)
    if (!summary) return { error: 'Vault not found' }
    if (confirmation !== summary.name) return { error: 'Confirmation name does not match' }

    try {
      await vaultService.deleteLocal(vaultId)

      if (deleteRemote && summary.githubRepo) {
        const token = authService.getToken()
        if (token) {
          try {
            await gitService.deleteGitHubRepo(summary.githubRepo, token)
          } catch (err) {
            console.warn('[vault:delete] GitHub repo deletion failed:', (err as Error).message)
          }
        }
      }

      broadcast(IPC.VAULT.REGISTRY_CHANGED)
      return { success: true }
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  // ---------------------------------------------------------------------------
  // Clone vault from GitHub
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.CLONE, async (_e, payload: CloneVaultPayload) => {
    const { repoUrl, parentDir } = payload
    const token = authService.getToken()
    if (!token) throw new Error('Not authenticated with GitHub')
    const config = await vaultService.clone(repoUrl, parentDir, token)
    broadcast(IPC.VAULT.REGISTRY_CHANGED)
    return config
  })

  // ---------------------------------------------------------------------------
  // Native folder picker
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.PICK_FOLDER, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose vault location'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ---------------------------------------------------------------------------
  // Import folder (Obsidian vault or any folder)
  // ---------------------------------------------------------------------------

  ipcMain.handle(IPC.VAULT.IMPORT_FOLDER, async (event, sourcePath: string) => {
    const config = vaultService.getActiveConfig()
    if (!config) throw new Error('No active vault')

    const result = await importService.importFolder(
      sourcePath,
      config.localPath,
      config.imageSubfolderName,
      (progress) => event.sender.send(IPC.VAULT.IMPORT_PROGRESS, progress)
    )

    // Rebuild the search index so imported notes are immediately searchable
    searchService.reindexVault(config.localPath)

    // Notify renderer to refresh the file tree
    broadcast(IPC.VAULT.REGISTRY_CHANGED)

    return result
  })
}
