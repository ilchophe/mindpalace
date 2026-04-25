import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '../../types'
import type { VaultDeletePayload } from '../../types'
import { vaultService } from '../services/VaultService'
import { vaultRegistry } from '../services/VaultRegistry'

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, ...args))
}

export function registerVaultHandlers(): void {
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
        // GitHub deletion handled in Phase 3 AuthService — skip silently for now
        console.warn('[vault:delete] deleteRemote requested but AuthService not yet implemented')
      }

      broadcast(IPC.VAULT.REGISTRY_CHANGED)
      return { success: true }
    } catch (err) {
      return { error: (err as Error).message }
    }
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
}
