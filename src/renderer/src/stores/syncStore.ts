import { create } from 'zustand'
import type {
  AuthStatus,
  DeviceFlowStart,
  DeviceFlowPollResult,
  SyncStatusPayload,
  GitHubRepo,
  ConnectRemotePayload,
  CloneVaultPayload
} from '@shared'

interface SyncStore {
  // Auth
  authStatus: AuthStatus | null
  deviceFlow: DeviceFlowStart | null
  isConnectModalOpen: boolean

  // Sync
  syncStatus: SyncStatusPayload
  conflicts: string[]
  isConflictModalOpen: boolean
  lastSyncedAt: string | null

  // Actions — auth
  loadAuthStatus: () => Promise<void>
  setClientId: (clientId: string) => Promise<void>
  startDeviceFlow: () => Promise<void>
  pollDeviceAuth: () => Promise<DeviceFlowPollResult | null>
  logout: () => Promise<void>
  openConnectModal: () => void
  closeConnectModal: () => void

  // Actions — git
  syncNow: () => Promise<void>
  connectRemote: (payload: ConnectRemotePayload) => Promise<{ githubRepo: string | null }>
  listGitHubRepos: () => Promise<GitHubRepo[]>
  cloneVault: (payload: CloneVaultPayload) => Promise<void>
  resolveConflict: (filepath: string, resolution: 'ours' | 'theirs') => Promise<void>
  dismissConflicts: () => void

  // Event handlers (called from App.tsx subscriptions)
  handleSyncStatus: (payload: SyncStatusPayload) => void
  handleConflictDetected: (conflicts: string[]) => void
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  authStatus: null,
  deviceFlow: null,
  isConnectModalOpen: false,
  syncStatus: { status: 'disconnected' },
  conflicts: [],
  isConflictModalOpen: false,
  lastSyncedAt: null,

  // ── Auth ────────────────────────────────────────────────────────────────

  loadAuthStatus: async () => {
    const authStatus = await window.api.auth.getStatus()
    set({ authStatus })
  },

  setClientId: async (clientId) => {
    await window.api.auth.setClientId(clientId)
    await get().loadAuthStatus()
  },

  startDeviceFlow: async () => {
    const { authStatus } = get()
    if (!authStatus?.clientId) throw new Error('GitHub Client ID not configured')
    const deviceFlow = await window.api.auth.startDeviceFlow(authStatus.clientId)
    set({ deviceFlow })
  },

  pollDeviceAuth: async () => {
    const { authStatus, deviceFlow } = get()
    if (!authStatus?.clientId || !deviceFlow) return null
    const result = await window.api.auth.pollDeviceAuth(authStatus.clientId, deviceFlow.deviceCode)
    if (result.status === 'authorized') {
      set({ deviceFlow: null })
      await get().loadAuthStatus()
    }
    return result
  },

  logout: async () => {
    await window.api.auth.logout()
    set({ authStatus: { isAuthenticated: false, user: null, clientId: get().authStatus?.clientId ?? '' } })
  },

  openConnectModal: () => set({ isConnectModalOpen: true }),
  closeConnectModal: () => set({ isConnectModalOpen: false, deviceFlow: null }),

  // ── Sync ─────────────────────────────────────────────────────────────────

  syncNow: async () => {
    await window.api.git.sync()
  },

  connectRemote: async (payload) => {
    const result = await window.api.git.connectRemote(payload)
    await get().loadAuthStatus()
    return result
  },

  listGitHubRepos: async () => {
    return window.api.git.listGitHubRepos()
  },

  cloneVault: async (payload) => {
    await window.api.vault.clone(payload)
  },

  resolveConflict: async (filepath, resolution) => {
    await window.api.git.resolveConflict(filepath, resolution)
    set((s) => ({
      conflicts: s.conflicts.filter((f) => f !== filepath),
      isConflictModalOpen: s.conflicts.length > 1
    }))
  },

  dismissConflicts: () => set({ conflicts: [], isConflictModalOpen: false }),

  // ── Push-event handlers ──────────────────────────────────────────────────

  handleSyncStatus: (payload) => {
    set({
      syncStatus: payload,
      lastSyncedAt: payload.pushedAt ?? get().lastSyncedAt,
      conflicts: payload.conflicts ?? [],
      isConflictModalOpen: (payload.conflicts?.length ?? 0) > 0
    })
  },

  handleConflictDetected: (conflicts) => {
    set({ conflicts, isConflictModalOpen: conflicts.length > 0 })
  }
}))
