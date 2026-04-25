import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../types'
import type { VaultConfig, VaultDeletePayload } from '../types'

const api = {
  vault: {
    list: () => ipcRenderer.invoke(IPC.VAULT.LIST),
    getActive: () => ipcRenderer.invoke(IPC.VAULT.GET_ACTIVE),
    open: (localPath: string) => ipcRenderer.invoke(IPC.VAULT.OPEN, localPath),
    create: (name: string, parentDir: string) => ipcRenderer.invoke(IPC.VAULT.CREATE, name, parentDir),
    close: () => ipcRenderer.invoke(IPC.VAULT.CLOSE),
    switch: (vaultId: string) => ipcRenderer.invoke(IPC.VAULT.SWITCH, vaultId),
    getConfig: () => ipcRenderer.invoke(IPC.VAULT.GET_CONFIG),
    updateConfig: (changes: Partial<VaultConfig>) => ipcRenderer.invoke(IPC.VAULT.UPDATE_CONFIG, changes),
    pin: (vaultId: string, pinned: boolean) => ipcRenderer.invoke(IPC.VAULT.PIN, vaultId, pinned),
    updateLabels: (vaultId: string, labels: string[]) =>
      ipcRenderer.invoke(IPC.VAULT.UPDATE_LABELS, vaultId, labels),
    delete: (payload: VaultDeletePayload) => ipcRenderer.invoke(IPC.VAULT.DELETE, payload),
    pickFolder: () => ipcRenderer.invoke(IPC.VAULT.PICK_FOLDER),

    onFileChanged: (cb: (path: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, path: string): void => cb(path)
      ipcRenderer.on(IPC.VAULT.FILE_CHANGED, handler)
      return () => ipcRenderer.off(IPC.VAULT.FILE_CHANGED, handler)
    },
    onFileCreated: (cb: (path: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, path: string): void => cb(path)
      ipcRenderer.on(IPC.VAULT.FILE_CREATED, handler)
      return () => ipcRenderer.off(IPC.VAULT.FILE_CREATED, handler)
    },
    onFileDeleted: (cb: (path: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, path: string): void => cb(path)
      ipcRenderer.on(IPC.VAULT.FILE_DELETED, handler)
      return () => ipcRenderer.off(IPC.VAULT.FILE_DELETED, handler)
    },
    onRegistryChanged: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on(IPC.VAULT.REGISTRY_CHANGED, handler)
      return () => ipcRenderer.off(IPC.VAULT.REGISTRY_CHANGED, handler)
    }
  },

  notes: {
    list: () => ipcRenderer.invoke(IPC.NOTES.LIST),
    read: (relPath: string) => ipcRenderer.invoke(IPC.NOTES.READ, relPath),
    write: (relPath: string, content: string) => ipcRenderer.invoke(IPC.NOTES.WRITE, relPath, content),
    rename: (oldRelPath: string, newRelPath: string) =>
      ipcRenderer.invoke(IPC.NOTES.RENAME, oldRelPath, newRelPath),
    delete: (relPath: string) => ipcRenderer.invoke(IPC.NOTES.DELETE, relPath),
    createFolder: (relPath: string) => ipcRenderer.invoke(IPC.NOTES.CREATE_FOLDER, relPath),
    getBacklinks: (relPath: string) => ipcRenderer.invoke(IPC.NOTES.GET_BACKLINKS, relPath),
    resolveWikiLink: (link: string) => ipcRenderer.invoke(IPC.NOTES.RESOLVE_WIKI_LINK, link)
  },

  // Domains filled in Phase 3
  auth: {},
  // Domains filled in Phase 3
  git: {},
  // Domains filled in Phase 4
  search: {},
  // Domains filled in Phase 5
  images: {}
}

contextBridge.exposeInMainWorld('api', api)
