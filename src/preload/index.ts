import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../types'
import type { VaultConfig, VaultDeletePayload, ConnectRemotePayload, CloneVaultPayload } from '../types'

const api = {
  vault: {
    list: () => ipcRenderer.invoke(IPC.VAULT.LIST),
    getActive: () => ipcRenderer.invoke(IPC.VAULT.GET_ACTIVE),
    open: (localPath: string) => ipcRenderer.invoke(IPC.VAULT.OPEN, localPath),
    create: (name: string, parentDir: string) => ipcRenderer.invoke(IPC.VAULT.CREATE, name, parentDir),
    close: () => ipcRenderer.invoke(IPC.VAULT.CLOSE),
    switch: (vaultId: string) => ipcRenderer.invoke(IPC.VAULT.SWITCH, vaultId),
    clone: (payload: CloneVaultPayload) => ipcRenderer.invoke(IPC.VAULT.CLONE, payload),
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
    },

    importFolder: (sourcePath: string) => ipcRenderer.invoke(IPC.VAULT.IMPORT_FOLDER, sourcePath),
    onImportProgress: (cb: (p: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, p: unknown): void => cb(p)
      ipcRenderer.on(IPC.VAULT.IMPORT_PROGRESS, handler)
      return () => ipcRenderer.off(IPC.VAULT.IMPORT_PROGRESS, handler)
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
    resolveWikiLink: (link: string) => ipcRenderer.invoke(IPC.NOTES.RESOLVE_WIKI_LINK, link),
    showInExplorer: (relPath: string) => ipcRenderer.invoke(IPC.NOTES.SHOW_IN_EXPLORER, relPath),
    confirm: (message: string) => ipcRenderer.invoke(IPC.NOTES.CONFIRM, message),
    listAssets: () => ipcRenderer.invoke(IPC.NOTES.LIST_ASSETS)
  },

  auth: {
    getStatus: () => ipcRenderer.invoke(IPC.AUTH.GET_STATUS),
    setClientId: (clientId: string) => ipcRenderer.invoke(IPC.AUTH.SET_CLIENT_ID, clientId),
    startDeviceFlow: (clientId: string) => ipcRenderer.invoke(IPC.AUTH.START_DEVICE_FLOW, clientId),
    pollDeviceAuth: (clientId: string, deviceCode: string) =>
      ipcRenderer.invoke(IPC.AUTH.POLL_DEVICE_AUTH, clientId, deviceCode),
    logout: () => ipcRenderer.invoke(IPC.AUTH.LOGOUT)
  },

  git: {
    status: () => ipcRenderer.invoke(IPC.GIT.STATUS),
    sync: () => ipcRenderer.invoke(IPC.GIT.SYNC),
    getLog: (depth?: number) => ipcRenderer.invoke(IPC.GIT.GET_LOG, depth),
    initRepo: () => ipcRenderer.invoke(IPC.GIT.INIT_REPO),
    connectRemote: (payload: ConnectRemotePayload) =>
      ipcRenderer.invoke(IPC.GIT.CONNECT_REMOTE, payload),
    listGitHubRepos: () => ipcRenderer.invoke(IPC.GIT.LIST_GITHUB_REPOS),
    resolveConflict: (filepath: string, resolution: 'ours' | 'theirs') =>
      ipcRenderer.invoke(IPC.GIT.RESOLVE_CONFLICT, filepath, resolution),
    setSyncInterval: (minutes: number) =>
      ipcRenderer.invoke(IPC.GIT.SET_SYNC_INTERVAL, minutes),

    onSyncStatus: (cb: (payload: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
      ipcRenderer.on(IPC.GIT.SYNC_STATUS, handler)
      return () => ipcRenderer.off(IPC.GIT.SYNC_STATUS, handler)
    },
    onConflictDetected: (cb: (conflicts: string[]) => void) => {
      const handler = (_: Electron.IpcRendererEvent, conflicts: string[]): void => cb(conflicts)
      ipcRenderer.on(IPC.GIT.CONFLICT_DETECTED, handler)
      return () => ipcRenderer.off(IPC.GIT.CONFLICT_DETECTED, handler)
    }
  },

  search: {
    query: (q: string) => ipcRenderer.invoke(IPC.SEARCH.QUERY, q),
    reindexVault: () => ipcRenderer.invoke(IPC.SEARCH.REINDEX),
    getAllTags: () => ipcRenderer.invoke(IPC.SEARCH.GET_ALL_TAGS),
    getBacklinks: (relPath: string) => ipcRenderer.invoke(IPC.SEARCH.GET_BACKLINKS, relPath)
  },
  images: {
    paste: (noteRelPath: string, base64Data: string, mimeType: string) =>
      ipcRenderer.invoke(IPC.IMAGES.PASTE, noteRelPath, base64Data, mimeType),
    importFile: (noteRelPath: string, sourcePath: string) =>
      ipcRenderer.invoke(IPC.IMAGES.IMPORT_FILE, noteRelPath, sourcePath),
    rewritePaths: (oldRelPath: string, newRelPath: string, content: string) =>
      ipcRenderer.invoke(IPC.IMAGES.REWRITE_PATHS, oldRelPath, newRelPath, content),
    getMode: () => ipcRenderer.invoke(IPC.IMAGES.GET_MODE)
  }
}

contextBridge.exposeInMainWorld('api', api)
