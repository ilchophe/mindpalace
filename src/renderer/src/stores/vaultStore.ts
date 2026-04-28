import { create } from 'zustand'
import type { VaultSummary, VaultConfig, NoteMetadata, AutoOpenResult } from '@shared'
import { useEditorStore } from './editorStore'

interface VaultStore {
  // Registry
  vaults: VaultSummary[]
  activeVault: VaultSummary | null
  activeConfig: VaultConfig | null

  // File tree
  notes: NoteMetadata[]
  assets: string[]          // relative paths of non-md vault files (images, PDFs…)
  selectedNote: NoteMetadata | null

  // UI
  isManagerOpen: boolean
  isLoading: boolean
  /** Set when auto-open on startup fails; cleared when user dismisses the modal. */
  startupError: Extract<AutoOpenResult, { success: false; reason: 'path_missing' | 'open_failed' }> | null

  // Actions
  loadRegistry: () => Promise<void>
  autoOpen: () => Promise<void>
  switchVault: (id: string) => Promise<void>
  openManager: () => void
  closeManager: () => void
  clearStartupError: () => void
  setSelectedNote: (note: NoteMetadata | null) => void
  loadNotes: () => Promise<void>
  loadAssets: () => Promise<void>
  pinVault: (id: string, pinned: boolean) => Promise<void>
  updateLabels: (id: string, labels: string[]) => Promise<void>
  renameVault: (id: string, newName: string) => Promise<void>
  deleteVault: (id: string, confirmation: string, deleteRemote: boolean) => Promise<string | null>
  createVault: (name: string, parentDir: string) => Promise<void>
  openVault: (localPath: string) => Promise<void>
}

export const useVaultStore = create<VaultStore>((set, get) => ({
  vaults: [],
  activeVault: null,
  activeConfig: null,
  notes: [],
  assets: [],
  selectedNote: null,
  isManagerOpen: false,
  isLoading: false,
  startupError: null,

  autoOpen: async () => {
    set({ isLoading: true })
    try {
      const result = await window.api.vault.autoOpen()

      if (result.success) {
        // Vault opened — refresh registry state + load notes
        const [vaults, activeVault] = await Promise.all([
          window.api.vault.list(),
          window.api.vault.getActive()
        ])
        set({
          activeConfig: result.config,
          activeVault,
          vaults,
          isManagerOpen: false,
          startupError: null
        })
        await get().loadNotes()
        await get().loadAssets()
        return
      }

      // Refresh registry so vault list is up to date regardless
      const vaults = await window.api.vault.list()
      set({ vaults })

      if (result.reason === 'no_vault') {
        // Clean slate — open manager normally, no error
        set({ isManagerOpen: true })
        return
      }

      // path_missing or open_failed — store error for the recovery modal
      set({ startupError: result, isManagerOpen: false })
    } finally {
      set({ isLoading: false })
    }
  },

  loadRegistry: async () => {
    const [vaults, activeVault, activeConfig] = await Promise.all([
      window.api.vault.list(),
      window.api.vault.getActive(),
      window.api.vault.getConfig()
    ])
    set({ vaults, activeVault, activeConfig })
  },

  switchVault: async (id) => {
    set({ isLoading: true })
    useEditorStore.getState().closeAllTabs()
    try {
      const config = await window.api.vault.switch(id)
      const [vaults, activeVault] = await Promise.all([
        window.api.vault.list(),
        window.api.vault.getActive()
      ])
      set({ activeConfig: config, activeVault, vaults, notes: [], assets: [], selectedNote: null })
      await get().loadNotes()
      await get().loadAssets()
    } finally {
      set({ isLoading: false })
    }
  },

  openVault: async (localPath) => {
    set({ isLoading: true })
    try {
      const config = await window.api.vault.open(localPath)
      const [vaults, activeVault] = await Promise.all([
        window.api.vault.list(),
        window.api.vault.getActive()
      ])
      set({ activeConfig: config, activeVault, vaults, isManagerOpen: false })
      await get().loadNotes()
      await get().loadAssets()
    } finally {
      set({ isLoading: false })
    }
  },

  createVault: async (name, parentDir) => {
    set({ isLoading: true })
    try {
      const config = await window.api.vault.create(name, parentDir)
      const [vaults, activeVault] = await Promise.all([
        window.api.vault.list(),
        window.api.vault.getActive()
      ])
      set({ activeConfig: config, activeVault, vaults, isManagerOpen: false, notes: [] })
    } finally {
      set({ isLoading: false })
    }
  },

  loadNotes: async () => {
    if (!get().activeConfig) return
    const notes = await window.api.notes.list()
    set({ notes })
  },

  loadAssets: async () => {
    if (!get().activeConfig) return
    const assets = await window.api.notes.listAssets()
    set({ assets })
  },

  setSelectedNote: (note) => set({ selectedNote: note }),

  openManager: () => set({ isManagerOpen: true }),
  closeManager: () => set({ isManagerOpen: false }),
  clearStartupError: () => set({ startupError: null }),

  pinVault: async (id, pinned) => {
    await window.api.vault.pin(id, pinned)
    set((s) => ({
      vaults: s.vaults.map((v) => (v.id === id ? { ...v, isPinned: pinned } : v))
    }))
  },

  updateLabels: async (id, labels) => {
    await window.api.vault.updateLabels(id, labels)
    set((s) => ({
      vaults: s.vaults.map((v) => (v.id === id ? { ...v, labels } : v))
    }))
  },

  renameVault: async (id, newName) => {
    await window.api.vault.rename(id, newName)
    set((s) => ({
      vaults: s.vaults.map((v) => (v.id === id ? { ...v, name: newName } : v)),
      activeVault: s.activeVault?.id === id ? { ...s.activeVault, name: newName } : s.activeVault
    }))
  },

  deleteVault: async (id, confirmation, deleteRemote) => {
    const result = await window.api.vault.delete({ vaultId: id, confirmation, deleteRemote })
    if ('error' in result) return result.error
    const vaults = await window.api.vault.list()
    const activeVault = await window.api.vault.getActive()
    set({ vaults, activeVault, activeConfig: null, notes: [], selectedNote: null })
    return null
  }
}))
