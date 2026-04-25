/// <reference types="vite/client" />
import type { VaultConfig, VaultSummary, VaultDeletePayload, NoteMetadata } from '../../types'

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
      }
      auth: Record<string, never>
      git: Record<string, never>
      search: Record<string, never>
      images: Record<string, never>
    }
  }
}
