// Shared types used across main, preload, and renderer processes.
// Keep this file free of Node.js or browser-only imports.

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

export interface VaultConfig {
  id: string                    // UUID — stable identity across renames
  name: string                  // display name; slugified form == GitHub repo name
  localPath: string             // absolute path, main process only
  githubRepo: string | null     // "owner/repo" e.g. "ilchophe/my-vault"
  githubBranch: string          // default: "main"
  imageStorageMode: 'same-folder' | 'subfolder' | 'global'
  imageSubfolderName: string    // default: "images"
  globalImagePath: string       // relative to vault root e.g. "assets/images"
  syncOnOpen: boolean
  syncOnSave: boolean
  syncIntervalMinutes: number   // 0 = disabled
  dailyNotesFolder: string
  dailyNoteTemplate: string
  defaultEditorView: 'edit' | 'split' | 'preview'
  theme: string
  customCSSPath: string | null
}

/** Lightweight row kept in the global VaultRegistry. */
export interface VaultSummary {
  id: string                    // same UUID as VaultConfig.id
  name: string                  // display name
  slug: string                  // URL-safe repo name derived from name (immutable after creation)
  localPath: string
  githubRepo: string | null     // "owner/repo"
  lastOpenedAt: string | null   // ISO-8601
  noteCount: number             // cached on vault open/close
  createdAt: string             // ISO-8601
  isPinned: boolean
  labels: string[]              // user-defined labels e.g. ["work", "personal"]
  syncStatus: VaultSyncStatus
}

export type VaultSyncStatus =
  | 'idle'
  | 'pulling'
  | 'pushing'
  | 'conflict'
  | 'error'
  | 'disconnected'

/** Global registry stored in electron-store. Main process only. */
export interface VaultRegistry {
  vaults: VaultSummary[]
  activeVaultId: string | null
}

/** Payload for the vault:delete IPC channel. */
export interface VaultDeletePayload {
  vaultId: string
  /** Must equal VaultSummary.name exactly — validated in main process too. */
  confirmation: string
  /** If true, also calls GitHub DELETE /repos/{owner}/{repo}. Requires delete_repo scope. */
  deleteRemote: boolean
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export interface NoteMetadata {
  id: string             // sha256 of relative path
  relativePath: string
  title: string
  tags: string[]
  aliases: string[]
  frontmatter: Record<string, unknown>
  outlinks: string[]     // wiki-links this note points to
  inlinks: string[]      // backlinks
  wordCount: number
  createdAt: string
  modifiedAt: string
}

// ---------------------------------------------------------------------------
// Sync / Git
// ---------------------------------------------------------------------------

export interface SyncState {
  lastPullSHA: string | null
  lastPushSHA: string | null
  pendingLocalChanges: string[]
  conflictFiles: ConflictEntry[]
  syncStatus: 'idle' | 'pulling' | 'pushing' | 'conflict' | 'error'
}

export interface ConflictEntry {
  relativePath: string
  base: string
  ours: string
  theirs: string
}

// ---------------------------------------------------------------------------
// Auth (GitHub Device Flow)
// ---------------------------------------------------------------------------

export interface GitHubUser {
  login: string
  name: string
  email: string
  avatarUrl: string
}

export interface AuthStatus {
  isAuthenticated: boolean
  user: GitHubUser | null
  clientId: string
}

export interface DeviceFlowStart {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface DeviceFlowPollResult {
  status: 'pending' | 'authorized' | 'slow_down' | 'expired' | 'denied' | 'error'
  token?: string
  errorMessage?: string
}

// ---------------------------------------------------------------------------
// Git operations
// ---------------------------------------------------------------------------

export interface GitFileStatus {
  filepath: string
  status: 'untracked' | 'added' | 'modified' | 'modified-staged' | 'deleted' | 'deleted-staged' | 'unknown'
}

export interface GitAuthor {
  name: string
  email: string
}

export interface SyncResult {
  pulled: boolean
  pushed: boolean
  conflicts: string[]
  error?: string
}

export interface SyncStatusPayload {
  status: 'idle' | 'pulling' | 'pushing' | 'conflict' | 'error' | 'disconnected'
  message?: string
  conflicts?: string[]
  pushedAt?: string
}

export interface CommitLog {
  oid: string
  message: string
  author: GitAuthor
  timestamp: number
}

export interface GitHubRepo {
  name: string
  fullName: string
  cloneUrl: string
  private: boolean
}

export interface ConnectRemotePayload {
  action: 'create' | 'link'
  repoName?: string       // for action === 'create'
  repoUrl?: string        // for action === 'link' (full clone URL)
  isPrivate?: boolean     // for action === 'create'
}

export interface CloneVaultPayload {
  repoUrl: string
  parentDir: string
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportProgress {
  phase: 'scanning' | 'copying' | 'rewriting' | 'indexing' | 'done'
  total: number
  done: number
  currentFile: string
}

export interface ImportResult {
  notesImported: number
  imagesImported: number
  referencesRewritten: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string
  relativePath: string
  title: string
  snippet: string
  score: number
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Utilities (pure — safe to import in main and renderer)
// ---------------------------------------------------------------------------

/** Derives an immutable GitHub-safe repo slug from a vault display name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'vault'
}

// ---------------------------------------------------------------------------
// IPC channel constants — keeps renderer and main in sync
// ---------------------------------------------------------------------------

export const IPC = {
  AUTH: {
    START_DEVICE_FLOW: 'auth:startDeviceFlow',
    POLL_DEVICE_AUTH:  'auth:pollDeviceAuth',
    GET_STATUS:        'auth:getAuthStatus',
    LOGOUT:            'auth:logout',
    SET_CLIENT_ID:     'auth:setClientId'
  },

  VAULT: {
    // Single-vault lifecycle
    OPEN:          'vault:open',
    CLONE:         'vault:clone',
    CREATE:        'vault:create',
    GET_CONFIG:    'vault:getConfig',
    UPDATE_CONFIG: 'vault:updateConfig',
    CLOSE:         'vault:close',

    // Multi-vault registry
    LIST:          'vault:list',       // → VaultSummary[]
    SWITCH:        'vault:switch',     // (vaultId) → VaultConfig
    GET_ACTIVE:    'vault:getActive',  // → VaultSummary | null
    PIN:           'vault:pin',        // (vaultId, pinned: boolean)
    UPDATE_LABELS: 'vault:updateLabels', // (vaultId, labels: string[])
    DELETE:        'vault:delete',     // (VaultDeletePayload) → { success } | { error }
    PICK_FOLDER:   'vault:pickFolder', // () → string | null

    // Push events (main → renderer)
    FILE_CHANGED:      'vault:file-changed',
    FILE_CREATED:      'vault:file-created',
    FILE_DELETED:      'vault:file-deleted',
    REGISTRY_CHANGED:  'vault:registry-changed', // fires after any registry mutation

    // Import
    IMPORT_FOLDER:   'vault:importFolder',
    IMPORT_PROGRESS: 'vault:importProgress',     // pushed event (webContents.send)
  },

  NOTES: {
    LIST:              'notes:list',
    READ:              'notes:read',
    WRITE:             'notes:write',
    RENAME:            'notes:rename',
    DELETE:            'notes:delete',
    CREATE_FOLDER:     'notes:createFolder',
    GET_BACKLINKS:     'notes:getBacklinks',
    RESOLVE_WIKI_LINK: 'notes:resolveWikiLink',
    SHOW_IN_EXPLORER:  'notes:showInExplorer',
    CONFIRM:           'notes:confirm',
    LIST_ASSETS:       'notes:listAssets'
  },

  SEARCH: {
    QUERY:         'search:query',
    REINDEX:       'search:reindexVault',
    GET_ALL_TAGS:  'search:getAllTags',
    GET_BACKLINKS: 'search:getBacklinks'
  },

  GIT: {
    STATUS:              'git:status',
    PULL:                'git:pull',
    COMMIT:              'git:commit',
    PUSH:                'git:push',
    SYNC:                'git:sync',
    RESOLVE_CONFLICT:    'git:resolveConflict',
    GET_LOG:             'git:getLog',
    GET_DIFF:            'git:getDiff',
    INIT_REPO:           'git:initRepo',
    CONNECT_REMOTE:      'git:connectRemote',
    CREATE_GITHUB_REPO:  'git:createGitHubRepo',
    LIST_GITHUB_REPOS:   'git:listGitHubRepos',
    CLONE_VAULT:         'git:cloneVault',
    SET_SYNC_INTERVAL:   'git:setSyncInterval',
    // Push events
    SYNC_STATUS:         'git:sync-status',
    CONFLICT_DETECTED:   'git:conflict-detected'
  },

  IMAGES: {
    PASTE:         'images:paste',
    IMPORT_FILE:   'images:importFile',
    REWRITE_PATHS: 'images:rewritePaths',
    GET_MODE:      'images:getMode'
  },

  WINDOW: {
    MINIMIZE:      'window:minimize',
    MAXIMIZE:      'window:maximize',
    CLOSE:         'window:close',
    IS_MAXIMIZED:  'window:isMaximized',
    // Push events main → renderer
    MAXIMIZED:     'window:maximized',
    UNMAXIMIZED:   'window:unmaximized',
  }
} as const
