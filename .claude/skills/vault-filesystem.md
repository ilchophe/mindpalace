# skill: vault-filesystem

## Purpose
Open, create, and close a vault (a local `.md` folder) in the MindPalace Electron app.
Manages per-vault config (`config.json`), chokidar file watcher, and the global VaultRegistry (electron-store).

## Inputs
- `localPath: string` — absolute path to open or parent dir for create
- `name: string` — display name (create only); slug derived with `slugify()`

## Outputs
- `VaultConfig` on open/create
- `VaultSummary[]` from registry list
- IPC push events: `vault:file-changed`, `vault:file-created`, `vault:file-deleted`, `vault:registry-changed`

## Key Packages
| Package | Role |
|---|---|
| `electron-store` | Persists `VaultRegistry` across sessions |
| `chokidar` | Watches vault directory for changes |
| `better-sqlite3` | Per-vault FTS5 index (graceful fallback if unavailable) |
| `crypto.randomUUID()` | Generates stable vault UUID (Node 20+) |

## Core Pattern

### Open a vault
```typescript
// main process only
const config = await vaultService.open('/path/to/vault')
// → initialises chokidar watcher, opens SQLite index, updates VaultRegistry
```

### Create a vault
```typescript
const config = await vaultService.create('My Notes', '/parent/dir')
// → creates /parent/dir/my-notes/, writes config.json, calls open()
```

### Slug derivation (pure, shared main+renderer via @shared)
```typescript
import { slugify } from '@shared'
slugify('My Cool Vault') // → 'my-cool-vault'
```

### chokidar watcher pattern
```typescript
// usePolling = true on Windows network drives
chokidar.watch(vaultPath, { ignored: /(^|[/\\])\./ })
  .on('add',    (p) => { indexService.indexFile(p); win.webContents.send(IPC.VAULT.FILE_CREATED, p) })
  .on('change', (p) => win.webContents.send(IPC.VAULT.FILE_CHANGED, p))
  .on('unlink', (p) => { indexService.removeFile(p); win.webContents.send(IPC.VAULT.FILE_DELETED, p) })
```

### VaultRegistry mutation (electron-store dot-notation)
```typescript
registryStore.set('registry.vaults', [...existing, newSummary])
registryStore.set('registry.activeVaultId', id)
```

## File Locations
| File | Role |
|---|---|
| `src/main/store.ts` | electron-store instance (`vault-registry.json`) |
| `src/main/services/VaultRegistry.ts` | CRUD for `VaultSummary[]` |
| `src/main/services/VaultService.ts` | Open/create/close, chokidar, config I/O |
| `src/main/services/IndexService.ts` | SQLite FTS5 per-vault index, graceful degradation |
| `src/main/ipc/vault.ts` | IPC handler registrations for `vault:*` |
| `src/main/ipc/notes.ts` | IPC handler registrations for `notes:*` |
| `src/types/index.ts` | `VaultConfig`, `VaultSummary`, `VaultRegistry`, `slugify()` |

## Drag & Drop Move Pattern (renderer)
```typescript
// FileTree — src path stored in a ref, not state, to avoid re-renders
const dragSrcRef = useRef<string | null>(null)

function onDragStart(e, path) { dragSrcRef.current = path; e.dataTransfer.effectAllowed = 'move' }
function onDragOver(e, path)  { e.preventDefault(); e.stopPropagation(); setDragOverPath(path) }

async function onDrop(e, targetNode) {
  e.preventDefault(); e.stopPropagation()
  const src = dragSrcRef.current; dragSrcRef.current = null
  const destFolder = targetNode.isFolder ? targetNode.path : targetNode.path.split('/').slice(0, -1).join('/')
  const newPath = destFolder ? `${destFolder}/${src.split('/').pop()}` : src.split('/').pop()
  if (src === newPath || newPath.startsWith(src + '/')) return   // guard self/descendant drop
  await window.api.notes.rename(src, newPath)
  renameItemPath(src, newPath)   // update open editor tabs
  await loadNotes()
}
```

### RENAME IPC — directory vs file
```typescript
const isDir = statSync(oldAbs).isDirectory()
renameSync(oldAbs, newAbs)
if (isDir) return   // chokidar fires add/unlink for all children; index auto-updates
// file-only: rewrite image embeds, update index
```

## Reuse Notes
- `slugify()` is exported from `@shared` and safe to import in renderer too
- `IndexService` degrades to `enabled = false` if `better-sqlite3` is unavailable; callers check `indexService.enabled`
- `VaultService.close()` must be called before switching vaults (tears down watcher + SQLite)
- `vault:registry-changed` push event is the single signal renderers should react to after any registry mutation
- For folder moves, `renameSync` works natively; skip per-file index operations — chokidar handles them
