# skill: isomorphic-git-sync

## Purpose
Git operations (init, clone, add, commit, push, pull, sync) in an Electron main process using `isomorphic-git`.
Includes auto-sync-on-save, interval sync, and merge conflict detection + resolution.

## Key Files
| File | Role |
|---|---|
| `src/main/services/GitService.ts` | All git operations + GitHub REST helpers |
| `src/main/services/SyncService.ts` | Sync orchestration (debounce on save, interval timer) |
| `src/main/ipc/git.ts` | IPC handlers for git:* channels |
| `src/renderer/src/stores/syncStore.ts` | Renderer sync state + conflict management |
| `src/renderer/src/components/Sync/SyncPanel.tsx` | Status badge + manual sync button |
| `src/renderer/src/components/Sync/ConflictModal.tsx` | Side-by-side conflict resolution UI |

## Core isomorphic-git Pattern
```typescript
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'   // bundled — no extra install
import * as nodefs from 'fs'

// All operations share these base options
const dir = '/path/to/vault'
const onAuth = () => ({ username: token, password: '' })

// Clone (shallow)
await git.clone({ fs: nodefs, http, dir, url, ref: 'main', singleBranch: true, depth: 50, onAuth })

// Stage + commit
await git.add({ fs: nodefs, dir, filepath: '.' })
await git.commit({ fs: nodefs, dir, message: 'auto-commit', author: { name, email } })

// Push
await git.push({ fs: nodefs, http, dir, remote: 'origin', ref: 'main', onAuth })

// Pull (fetch + merge)
await git.pull({ fs: nodefs, http, dir, remote: 'origin', ref: 'main', author, onAuth })
```

## HTTP Plugin Location
The Node.js HTTP transport is **bundled inside** `isomorphic-git` at `isomorphic-git/http/node`.
No separate `@isomorphic-git/http` package install needed.

## Sync Strategy (GitService.sync)
```typescript
// 1. Stage all changes
await git.add({ fs: nodefs, dir, filepath: '.' })

// 2. Commit only if there are changes
const matrix = await git.statusMatrix({ fs: nodefs, dir })
const hasChanges = matrix.some(([,h,w,s]) => !(h===1 && w===1 && s===1))
if (hasChanges) await git.commit(...)

// 3. Pull (fast-forward or merge)
try { await git.pull(...) }
catch (err) {
  if (err.code === 'CheckoutConflictError') return { conflicts: [...] }
  throw err
}

// 4. Push — retry once on PushRejectedError
try { await git.push(...) }
catch (err) {
  if (err.code === 'PushRejectedError') {
    await git.pull(...)
    await git.push(...)
  }
}
```

## Auto-Sync Patterns
```typescript
// Debounce on save (30s after last write, from notes:write IPC handler)
syncService.scheduleSyncAfterSave(config, 30_000)

// Interval timer (started in VaultService.open, stopped in VaultService.close)
syncService.startAutoSync(config)  // config.syncIntervalMinutes controls frequency
syncService.stopAutoSync()
```

## Conflict Resolution
```typescript
// Parse conflict markers and return the chosen side
resolveConflictMarkers(content: string, resolution: 'ours' | 'theirs'): string {
  return content.replace(
    /<<<<<<< [^\n]+\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]+\n/g,
    (_, ours, theirs) => resolution === 'ours' ? ours : theirs
  )
}
```

## Connecting an Existing Vault to GitHub
```typescript
// git:connectRemote IPC handler flow:
1. Create GitHub repo via API (or link existing)
2. git.init() if not already a repo
3. git.addRemote(dir, cloneUrl)
4. git.add('.') + git.commit('initial commit')
5. git.pull() to merge any existing remote content
6. git.push()
7. vaultService.updateConfig({ githubRepo: 'owner/repo' })
```

## Status Matrix Reference
`git.statusMatrix()` returns `[filepath, HeadStatus, WorkdirStatus, StageStatus][]`
- `HeadStatus`: 0 = absent, 1 = present
- `WorkdirStatus`: 0 = absent, 1 = identical to stage, 2 = different from stage
- `StageStatus`: 0 = absent, 1 = identical to HEAD, 2 = different from HEAD, 3 = absent from HEAD

## SyncStatusPayload Push Event
Main process broadcasts on `git:sync-status`:
```typescript
{ status: 'idle' | 'pulling' | 'pushing' | 'conflict' | 'error' | 'disconnected',
  message?: string, conflicts?: string[], pushedAt?: string }
```

## Reuse Notes
- `isomorphic-git` must run in **main process only** — it uses Node.js `fs`
- Use `git.resolveRef({ ref: 'HEAD' })` to cheaply test if a directory is a git repo
- `SyncService.syncNow()` is idempotent — silently skips if already syncing
- The `.gitignore` written at init excludes `.mindpalace/sync-state.json`
