// Shared types used across main, preload, and renderer processes.
// Keep this file free of Node.js or browser-only imports.

export interface VaultConfig {
  id: string
  name: string
  localPath: string
  githubRepo: string | null
  githubBranch: string
  imageStorageMode: 'same-folder' | 'subfolder' | 'global'
  imageSubfolderName: string
  globalImagePath: string
  syncOnOpen: boolean
  syncOnSave: boolean
  syncIntervalMinutes: number
  dailyNotesFolder: string
  dailyNoteTemplate: string
  defaultEditorView: 'edit' | 'split' | 'preview'
  theme: string
  customCSSPath: string | null
}

export interface NoteMetadata {
  id: string
  relativePath: string
  title: string
  tags: string[]
  aliases: string[]
  frontmatter: Record<string, unknown>
  outlinks: string[]
  inlinks: string[]
  wordCount: number
  createdAt: string
  modifiedAt: string
}

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

export interface SearchResult {
  id: string
  relativePath: string
  title: string
  snippet: string
  score: number
}

// IPC channel names — keeps renderer and main in sync
export const IPC = {
  AUTH: {
    START_DEVICE_FLOW: 'auth:startDeviceFlow',
    POLL_DEVICE_AUTH: 'auth:pollDeviceAuth',
    GET_STATUS: 'auth:getAuthStatus',
    LOGOUT: 'auth:logout'
  },
  VAULT: {
    OPEN: 'vault:open',
    CLONE: 'vault:clone',
    CREATE: 'vault:create',
    GET_CONFIG: 'vault:getConfig',
    UPDATE_CONFIG: 'vault:updateConfig',
    LIST_RECENT: 'vault:listRecent',
    CLOSE: 'vault:close',
    FILE_CHANGED: 'vault:file-changed',
    FILE_CREATED: 'vault:file-created',
    FILE_DELETED: 'vault:file-deleted'
  },
  NOTES: {
    LIST: 'notes:list',
    READ: 'notes:read',
    WRITE: 'notes:write',
    RENAME: 'notes:rename',
    DELETE: 'notes:delete',
    CREATE_FOLDER: 'notes:createFolder',
    GET_BACKLINKS: 'notes:getBacklinks',
    RESOLVE_WIKI_LINK: 'notes:resolveWikiLink'
  },
  SEARCH: {
    QUERY: 'search:query',
    REINDEX: 'search:reindexVault'
  },
  GIT: {
    STATUS: 'git:status',
    PULL: 'git:pull',
    COMMIT: 'git:commit',
    PUSH: 'git:push',
    SYNC: 'git:sync',
    RESOLVE_CONFLICT: 'git:resolveConflict',
    GET_LOG: 'git:getLog',
    GET_DIFF: 'git:getDiff',
    SYNC_STATUS: 'git:sync-status',
    CONFLICT_DETECTED: 'git:conflict-detected'
  },
  IMAGES: {
    PASTE: 'images:paste',
    IMPORT_FILE: 'images:importFile',
    REWRITE_PATHS: 'images:rewritePaths',
    GET_MODE: 'images:getMode'
  }
} as const
