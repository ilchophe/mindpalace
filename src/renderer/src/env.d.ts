/// <reference types="vite/client" />
import type {
  VaultConfig,
  VaultSummary,
  VaultDeletePayload,
  NoteMetadata,
  AuthStatus,
  DeviceFlowStart,
  DeviceFlowPollResult,
  GitFileStatus,
  CommitLog,
  GitHubRepo,
  SyncStatusPayload,
  ConnectRemotePayload,
  CloneVaultPayload,
  SearchResult,
  ImportProgress,
  ImportResult
} from '../../types'

declare global {
  interface Window {
    api: {
      vault: {
        list: () => Promise<VaultSummary[]>
        getActive: () => Promise<VaultSummary | null>
        open: (localPath: string) => Promise<VaultConfig>
        create: (name: string, parentDir: string) => Promise<VaultConfig>
        close: () => Promise<void>
        switch: (vaultId: string) => Promise<VaultConfig>
        clone: (payload: CloneVaultPayload) => Promise<VaultConfig>
        getConfig: () => Promise<VaultConfig | null>
        updateConfig: (changes: Partial<VaultConfig>) => Promise<VaultConfig>
        pin: (vaultId: string, pinned: boolean) => Promise<void>
        updateLabels: (vaultId: string, labels: string[]) => Promise<void>
        delete: (payload: VaultDeletePayload) => Promise<{ success: true } | { error: string }>
        pickFolder: () => Promise<string | null>
        onFileChanged: (cb: (path: string) => void) => () => void
        onFileCreated: (cb: (path: string) => void) => () => void
        onFileDeleted: (cb: (path: string) => void) => () => void
        onRegistryChanged: (cb: () => void) => () => void
        importFolder: (sourcePath: string) => Promise<ImportResult>
        onImportProgress: (cb: (p: ImportProgress) => void) => () => void
      }
      notes: {
        list: () => Promise<NoteMetadata[]>
        read: (relPath: string) => Promise<string>
        write: (relPath: string, content: string) => Promise<void>
        rename: (oldRelPath: string, newRelPath: string) => Promise<void>
        delete: (relPath: string) => Promise<void>
        createFolder: (relPath: string) => Promise<void>
        getBacklinks: (relPath: string) => Promise<string[]>
        resolveWikiLink: (link: string) => Promise<string | null>
        showInExplorer: (relPath: string) => Promise<void>
        confirm: (message: string) => Promise<boolean>
      }
      auth: {
        getStatus: () => Promise<AuthStatus>
        setClientId: (clientId: string) => Promise<void>
        startDeviceFlow: (clientId: string) => Promise<DeviceFlowStart>
        pollDeviceAuth: (clientId: string, deviceCode: string) => Promise<DeviceFlowPollResult>
        logout: () => Promise<void>
      }
      git: {
        status: () => Promise<{ isRepo: boolean; files: GitFileStatus[] }>
        sync: () => Promise<void>
        getLog: (depth?: number) => Promise<CommitLog[]>
        initRepo: () => Promise<{ isRepo: boolean }>
        connectRemote: (payload: ConnectRemotePayload) => Promise<{ githubRepo: string | null; cloneUrl: string }>
        listGitHubRepos: () => Promise<GitHubRepo[]>
        resolveConflict: (filepath: string, resolution: 'ours' | 'theirs') => Promise<void>
        setSyncInterval: (minutes: number) => Promise<VaultConfig>
        onSyncStatus: (cb: (payload: SyncStatusPayload) => void) => () => void
        onConflictDetected: (cb: (conflicts: string[]) => void) => () => void
      }
      search: {
        query: (q: string) => Promise<SearchResult[]>
        reindexVault: () => Promise<void>
        getAllTags: () => Promise<string[]>
        getBacklinks: (relPath: string) => Promise<string[]>
      }
      images: {
        paste: (noteRelPath: string, base64Data: string, mimeType: string) => Promise<string>
        importFile: (noteRelPath: string, sourcePath: string) => Promise<string>
        rewritePaths: (oldRelPath: string, newRelPath: string, content: string) => Promise<string>
        getMode: () => Promise<string>
      }
    }
  }
}
