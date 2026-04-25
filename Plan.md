# MindPalace — Product Specification & Implementation Plan

## Context

The user is a senior PM and developer/architect who uses Obsidian for documenting projects, experiments, and ideas. The goal is to recreate Obsidian as a first-party application ("MindPalace") built with Electron, using GitHub as the authoritative vault storage so notes remain plain `.md` files under full user ownership. The app must work across multiple devices (Windows, macOS, Linux) with seamless sync via git, support flexible image storage strategies, support multiple independent vaults (each backed by its own GitHub repository), and automatically generate reusable Claude Code skills as each module is built.

---

## 1. Product Vision

MindPalace is a cross-platform desktop note-taking application that delivers Obsidian's local-first markdown editing experience while treating a GitHub repository as the authoritative vault — enabling seamless multi-device sync through native git operations, with no subscription, no proprietary sync service, and every note remaining a plain `.md` file owned entirely by the user.

Users can maintain any number of independent **vaults** — each vault maps 1:1 to a GitHub repository whose name is derived from the vault's display name. A built-in Vault Manager provides a visual dashboard for switching, filtering, pinning, and (with explicit confirmation) destroying vaults. A built-in skill generation pipeline ensures every major module produces a reusable Claude Code skill.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         ELECTRON SHELL                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  MAIN PROCESS (Node.js)                    │  │
│  │                                                            │  │
│  │  AuthService    GitService     FileWatcher (chokidar)      │  │
│  │  (PKCE/         (isomorphic-   SyncService                 │  │
│  │  safeStorage)   git)           ImageService                │  │
│  │                 VaultService   IndexService (SQLite FTS5)  │  │
│  │                 VaultRegistry  (electron-store global reg) │  │
│  │                                                            │  │
│  │              IPC Bridge (ipcMain — domain:verb channels)   │  │
│  └─────────────────────────┬──────────────────────────────────┘  │
│                            │ contextBridge (preload.ts)          │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │                RENDERER PROCESS (React 18)                 │  │
│  │                                                            │  │
│  │  VaultManager  │  FileTree  │  MonacoEditor  │  Preview    │  │
│  │  Backlinks     │  PropertiesPanel│  SyncPanel │  Search    │  │
│  │  CommandPalette │ DailyNotes │ Settings       │  Graph     │  │
│  │                                                            │  │
│  │              Zustand (global renderer state)               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  PERSISTENCE: electron-store (global registry + per-vault cfg)  │
│               SQLite (per-vault index) · vault folder (raw .md) │
│               GitHub (remote)                                    │
└──────────────────────────────────────────────────────────────────┘

VAULT FILE LAYOUT
<vault-root>/
  *.md                         ← notes at any depth
  .mindpalace/config.json      ← committed vault config
  .mindpalace/sync-state.json  ← local only, not committed
  images/                      ← global image folder (if mode=global)
```

---

## 3. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Build tool | electron-vite 2 | Purpose-built for Electron: separate main/preload/renderer bundles, HMR, V8 bytecode |
| Runtime | Electron 28+, Node 20+ | LTS, stable contextBridge security model |
| Frontend | React 18 + TypeScript 5 | Component-heavy UI; strict TS catches IPC type mismatches |
| Editor | Monaco Editor (`@monaco-editor/react`) | VS Code engine: syntax, vim keybindings, minimap, find-in-file |
| Markdown | remark + rehype pipeline | Modular plugin system for wiki-links, GFM, math (KaTeX), mermaid |
| Git | isomorphic-git | Pure JS, no native binary; HTTP plugin ships inside the package (`isomorphic-git/http/node`) |
| Auth | GitHub Device Flow + `safeStorage` | No redirect server needed; OS keychain token storage |
| State | Zustand | Minimal boilerplate, works outside React (for IPC event handlers) |
| Styling | Tailwind CSS 3 | Utility-first, Catppuccin Mocha/Latte themes via CSS variables |
| Config | electron-store | JSON store with schema validation; one global registry + per-vault config |
| Search | better-sqlite3 (FTS5 virtual table) | Fast full-text search, sync API, main-process only |
| File watching | chokidar | Battle-tested cross-platform, low CPU |
| Packaging | electron-builder | .exe (NSIS), .dmg, .AppImage; GitHub Actions friendly |
| Graph | D3.js v7 | Force-directed graph for backlink visualization |

---

## 4. Key Data Models

### VaultConfig (per-vault · electron-store + `.mindpalace/config.json` committed to repo)
```typescript
interface VaultConfig {
  id: string                    // UUID — stable identity across renames
  name: string                  // display name; slugified form == GitHub repo name
  localPath: string             // absolute, main process only
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
```

### VaultSummary (lightweight row stored in the global registry)
```typescript
interface VaultSummary {
  id: string                    // same UUID as VaultConfig.id
  name: string                  // display name
  slug: string                  // URL-safe repo name derived from name (see §5 naming rules)
  localPath: string
  githubRepo: string | null     // "owner/repo"
  lastOpenedAt: string | null   // ISO-8601
  noteCount: number             // cached on vault open/close
  createdAt: string             // ISO-8601
  isPinned: boolean             // pinned vaults sort to top
  labels: string[]              // user-defined labels for filtering e.g. ["work", "personal"]
  syncStatus: 'idle' | 'pulling' | 'pushing' | 'conflict' | 'error' | 'disconnected'
}
```

### VaultRegistry (global · electron-store `registry` key, main process only)
```typescript
interface VaultRegistry {
  vaults: VaultSummary[]
  activeVaultId: string | null
}
```

### NoteMetadata (per-vault SQLite `notes` table + FTS5 virtual table)
```typescript
interface NoteMetadata {
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
```

### SyncState (`.mindpalace/sync-state.json`, never committed)
```typescript
interface SyncState {
  lastPullSHA: string | null
  lastPushSHA: string | null
  pendingLocalChanges: string[]
  conflictFiles: ConflictEntry[]
  syncStatus: 'idle' | 'pulling' | 'pushing' | 'conflict' | 'error'
}
```

---

## 5. IPC API Contract

All renderer↔main communication goes through `window.api` (contextBridge). Channel naming: `domain:verb`.

```typescript
// src/preload/index.ts — window.api surface
auth:    startDeviceFlow, pollDeviceAuth, getAuthStatus, logout

vault:   // single-vault ops
         open, clone, create, getConfig, updateConfig, close
         // multi-vault registry ops
         list, switch, getActive,
         pin, updateLabels,
         delete                  // requires typed confirmation + deleteRemote flag

notes:   list, read, write, rename, delete, createFolder, getBacklinks, resolveWikiLink
search:  query, reindexVault
git:     status, pull, commit, push, sync, resolveConflict, getLog, getDiff
images:  paste, importFile, rewritePaths, getMode

// Events pushed from main → renderer
vault:file-changed, vault:file-created, vault:file-deleted
vault:registry-changed           // fires after any registry mutation (switch/delete/pin)
git:sync-status, git:conflict-detected
```

Constraints: NEVER `nodeIntegration: true`. NEVER expose ipcRenderer directly. All IPC calls are typed.

---

## 5a. Multi-Vault Management Specification

### Vault Name → GitHub Repo Name (Slug) Rules

When a vault is created or renamed the slug is computed once and stored in `VaultSummary.slug`:

```
slug = name
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanum except spaces/hyphens
  .replace(/\s+/g, '-')            // spaces → hyphens
  .replace(/-+/g, '-')             // collapse multiple hyphens
  .slice(0, 100)                   // GitHub repo name max 100 chars
```

- Slug must be unique within the user's GitHub account — VaultService checks via GitHub API before repo creation and surfaces a conflict error if taken.
- A vault can be renamed (display `name` changes); the slug **does not change** after creation to avoid breaking the remote URL.
- If GitHub is not connected the slug is still stored for future use.

### Vault Manager UI (Phase 1)

Entry point: sidebar "Vaults" icon or `Ctrl+Shift+V` shortcut → opens `VaultManagerScreen` as a full-screen overlay.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ MindPalace Vaults                         [+ New] [↓ Clone]     │
│ ─────────────────────────────────────────────────────────────── │
│ 🔍 Filter by name or label…     Sort: [Last opened ▼]          │
│ Labels: [All] [work] [personal] [archive]  …                   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ 📌 My Notes     │  │  Work Projects  │  │  Archive 2024  │  │
│  │ 142 notes       │  │  89 notes       │  │  301 notes     │  │
│  │ ● synced 2m ago │  │  ⚠ conflict     │  │  ○ local only  │  │
│  │ ilchophe/my-... │  │  ilchophe/work  │  │  —             │  │
│  │ [Open] [⋯]      │  │  [Open] [⋯]    │  │  [Open] [⋯]   │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Vault card states:**
- Pinned: shown first regardless of sort; indicated by pin icon
- Active (currently open): highlighted border
- Sync status badge: `● synced`, `↺ syncing`, `⚠ conflict`, `↑ pending push`, `○ local only`, `✗ error`

**Filter & sort:**
- Real-time text filter on `name` and `labels[]`
- Label chips below the filter bar (clicking toggles; `All` clears selection)
- Sort options: Last opened (default), Name A→Z, Note count, Created date

**Context menu (`⋯` on each card):**
- Open
- Pin / Unpin
- Edit labels
- Open in Finder / Explorer
- Open GitHub repo ↗
- Rename display name
- Vault settings
- ─────
- Delete vault… (destructive — see deletion flow below)

### Vault Deletion Flow

Deletion is a two-step, opt-in destructive action.

**Step 1 — Intent modal:**
```
Delete "Work Projects"?

This will:
  ✗ Remove "Work Projects" from MindPalace
  ✗ Delete local files at: /Users/you/vaults/work-projects

  [ ] Also permanently delete GitHub repository ilchophe/work-projects
      (this cannot be undone and will destroy all git history)

To confirm, type the vault name:  [___________________]

                           [Cancel]  [Delete vault →]  ← disabled until name typed
```

- "Delete vault →" button remains disabled until the typed value matches `VaultSummary.name` exactly (case-sensitive).
- Checking "Also delete GitHub repository" shows an additional red banner: "⚠ Deleting a GitHub repository is permanent and irreversible. All issues, pull requests, and git history will be lost."

**Step 2 — Final warning (appears only after Step 1 is submitted):**
```
┌────────────────────────────────────────────────┐
│  ⛔  Last chance                                │
│                                                  │
│  You are about to permanently delete:            │
│    • Local vault: /Users/you/vaults/work-...     │
│    • GitHub repo: ilchophe/work-projects  (if)  │
│                                                  │
│  There is no undo.                               │
│                                                  │
│  [Cancel — keep my vault]   [Delete forever]    │
└────────────────────────────────────────────────┘
```

- "Delete forever" button is red and requires a 3-second hover/hold or a `data-confirm-delay` attribute to prevent accidental clicks.
- On confirm: main process deletes local directory via `fs.rm(path, { recursive: true })`, then (if opted in) calls GitHub API `DELETE /repos/{owner}/{repo}`, then removes the entry from VaultRegistry.

**IPC signature:**
```typescript
vault:delete(payload: {
  vaultId: string
  confirmation: string   // must equal VaultSummary.name — validated in main process too
  deleteRemote: boolean
}) → { success: true } | { error: string }
```

Main process re-validates `confirmation === vault.name` before any destructive operation — renderer-side validation alone is not sufficient.

### Switching Vaults

- `vault:switch(vaultId)` → main process tears down current chokidar watcher, closes active SQLite db, opens new vault directory, spins up new watcher, emits `vault:registry-changed`
- Renderer `vaultStore` reacts to `vault:registry-changed` and triggers a full UI reload of the new vault context (file tree, editor tabs cleared)
- Window title updates to `MindPalace — {vaultName}`

---

## 6. Image Handling Specification

### Three Storage Modes

| Mode | Note location | Image saved at | Embed in markdown |
|---|---|---|---|
| `same-folder` | `journal/note.md` | `journal/img-001.png` | `![](img-001.png)` |
| `subfolder` (**default**) | `journal/note.md` | `journal/images/img-001.png` | `![](images/img-001.png)` |
| `global` | `journal/note.md` | `assets/images/img-001.png` | `![](../assets/images/img-001.png)` |

### Clipboard Paste Flow
1. Monaco `onKeyDown` detects paste with image data
2. Renderer reads clipboard → `navigator.clipboard.read()` → PNG blob → base64
3. IPC call `images:paste(currentNotePath, base64)` → main process
4. `ImageService` determines target folder by mode, writes file, returns relative path
5. Monaco inserts `![](relativePath)` at cursor → auto-save fires (1000ms debounce)

### Path Rewriting on Note Move
When `notes:rename` fires: parse all `![](path)` and `![[path]]` embeds, compute new relative path from new note location to image absolute path, rewrite content, update SQLite index.

---

## 7. GitHub Sync Specification

### Authentication — Device Flow
```
POST /login/device/code { client_id, scope: "repo,delete_repo" }
→ show user_code, open system browser to verification_uri
Poll POST /login/oauth/access_token every `interval` seconds
→ on success: safeStorage.encryptString(token) → store encrypted hex in electron-store
```

Note: `delete_repo` scope is only required if the user wants the "Also delete GitHub repository" option in the deletion flow. Request it at auth time so users aren't re-prompted later.

### Sync Cycle (auto-sync on save)
1. `git.add({ filepath })` — stage changed file
2. `git.commit({ message: "update: noteName [auto]" })`
3. `git.push()` — if rejected (remote ahead): pull first, then push
4. Emit `git:sync-status` update to renderer

### Conflict Resolution
- Merge conflict → emit `git:conflict-detected` with `ConflictEntry` (base/ours/theirs content)
- Renderer shows 3-pane `ConflictModal` (Yours | Base | Theirs)
- User picks resolution → `git:resolveConflict` → `git.add()` + `git.commit()` merge commit

### isomorphic-git Auth Pattern
```typescript
onAuth: () => ({ username: await AuthService.getToken(), password: '' })
// import http from 'isomorphic-git/http/node' — NOT a separate npm package
```

---

## 8. Phased Implementation Roadmap

### Phase 0 — Project Scaffold ✅ (complete)
**Deliverables**: electron-vite skeleton, React 18 + TypeScript, Tailwind (Catppuccin), ESLint/Prettier, Vitest smoke test, electron-builder.yml, CI workflow, CLAUDE.md, GitHub repo push
**Skill generated**: `project-scaffold`

---

### Phase 1 — Vault Management & File Tree (Week 2)
**Deliverables**:
- `VaultService` — open/create/close a single vault; read/write `.mindpalace/config.json`
- `VaultRegistry` — global electron-store registry of all known vaults; CRUD for `VaultSummary[]`
- `IndexService` — per-vault SQLite db; `notes` table + `notes_fts` FTS5 virtual table
- chokidar file watcher wired to IPC events
- `FileTree` React component (sidebar)
- **`VaultManagerScreen`** — full-screen overlay with vault cards, filter bar, label chips, sort
- **`VaultCard`** component — name, note count, sync status badge, pin, context menu
- **`DeleteVaultModal`** — two-step deletion flow with typed confirmation and final warning
- `vault:switch` IPC handler — tears down and re-initialises active vault context
- electron-store config

**Key files**:
- `src/main/services/VaultService.ts`
- `src/main/services/VaultRegistry.ts`
- `src/main/services/IndexService.ts`
- `src/main/ipc/vault.ts`
- `src/renderer/components/VaultManager/VaultManagerScreen.tsx`
- `src/renderer/components/VaultManager/VaultCard.tsx`
- `src/renderer/components/VaultManager/DeleteVaultModal.tsx`
- `src/renderer/components/Sidebar/FileTree.tsx`
- `src/renderer/stores/vaultStore.ts`

**SQLite schema**:
```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  relative_path TEXT UNIQUE NOT NULL,
  title TEXT,
  tags TEXT,        -- JSON array
  aliases TEXT,     -- JSON array
  frontmatter TEXT, -- JSON object
  outlinks TEXT,    -- JSON array
  inlinks TEXT,     -- JSON array
  word_count INTEGER,
  created_at TEXT,
  modified_at TEXT
);
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, tags, content=notes, content_rowid=rowid
);
```

**Slug derivation** (also implemented in renderer for live preview):
```typescript
export function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}
```

**Skill generated**: `vault-filesystem`, `vault-manager-ui`
**Verify**:
- Open any folder → file tree renders
- Create/rename/delete notes; watcher fires on external edits
- Open VaultManager (Ctrl+Shift+V) → all vaults listed
- Filter by name and label works in real time
- Pin a vault → it moves to top
- Switch vault → file tree and editor reset to new vault
- Delete vault without GitHub: local files removed, registry entry gone
- Delete vault with GitHub: repo deleted (requires `delete_repo` scope)
- Typed confirmation is case-sensitive; wrong name keeps button disabled

---

### Phase 2 — Monaco Editor + Markdown Preview (Week 3)
**Deliverables**: MonacoEditor, MarkdownPreview (remark/rehype pipeline), PropertiesPanel (YAML frontmatter), TabBar, auto-save (1000ms debounce)
**Key files**: `src/renderer/components/Editor/MonacoEditor.tsx`, `src/renderer/lib/markdownPipeline.ts`, `src/renderer/lib/frontmatterParser.ts`
**Remark pipeline**: `remark-parse → remark-wiki-links → remark-gfm → remark-math → rehype-katex → rehype-highlight → rehype-sanitize → rehype-stringify`
**CSP note**: Monaco requires `'unsafe-eval'`; set in BrowserWindow webPreferences + index.html meta
**Skill generated**: `monaco-editor-setup`, `remark-rehype-pipeline`
**Verify**: Monaco + preview split view; YAML panel reads/writes frontmatter; wiki-link navigation works

---

### Phase 3 — GitHub Auth & Git Sync (Week 4)
**Deliverables**: AuthService (Device Flow + safeStorage), GitService (isomorphic-git), SyncService, ConnectGitHubModal, SyncPanel, ConflictModal, vault clone from GitHub flow, `delete_repo` scope wired
**Key files**: `src/main/services/AuthService.ts`, `src/main/services/GitService.ts`, `src/main/services/SyncService.ts`
**Skill generated**: `github-oauth-device-flow`, `isomorphic-git-sync`
**Verify**: Connect GitHub; clone test repo; edit note; auto-commit fires; conflict resolution modal works; "Also delete GitHub repo" checkbox in DeleteVaultModal becomes active once authenticated

---

### Phase 4 — Search, Quick Switcher & Tags (Week 5)
**Deliverables**: SearchService (FTS5), QuickSwitcher (Ctrl+P), SearchPanel with tag/folder filters, BacklinksPanel, TagsPanel
**Key files**: `src/main/services/SearchService.ts`, `src/renderer/components/Search/QuickSwitcher.tsx`
**Skill generated**: `sqlite-fts5-search`
**Verify**: Ctrl+P returns ranked results; tag filter works; backlinks panel shows correct inbound links

---

### Phase 5 — Images, Graph View & Daily Notes (Week 6)
**Deliverables**: ImageService (all 3 modes + path rewriting), clipboard paste handler in Monaco, drag-drop import, GraphView (D3.js force graph), DailyNotes with templates
**Key files**: `src/main/services/ImageService.ts`, `src/renderer/components/Graph/GraphView.tsx`, `src/renderer/lib/graphDataBuilder.ts`
**Skill generated**: `image-handling-ipc`, `d3-force-graph`
**Verify**: Paste PNG → saved to correct folder → correct relative path in markdown; move note → paths updated; graph renders all nodes

---

### Phase 6 — Polish, Settings & Packaging (Week 7–8)
**Deliverables**:
- CommandPalette (Ctrl+Shift+P) — includes `Switch vault…` command
- SettingsPanel (General / GitHub / Editor / Vault / Image / Theme tabs)
- VaultManager polish: animated card transitions, drag-to-reorder pinned vaults, bulk label editing
- ThemeEngine (CSS variable injection, light/dark/custom)
- electron-builder multi-platform config + GitHub Actions release workflow + electron-updater
**Key files**: `electron-builder.yml`, `.github/workflows/release.yml`, `src/renderer/components/CommandPalette/CommandPalette.tsx`
**Skill generated**: `electron-builder-packaging`, `command-palette-pattern`
**Verify**: All 3 platform builds produce correct installers; auto-update works; `Switch vault…` appears in command palette; themes persist across restarts

---

## 9. Skill Generation Plan

### Directory Structure
```
G:/aiprojects/MindPalace/
└── .claude/
    ├── settings.local.json
    └── skills/
        ├── README.md                      ← skill index
        ├── project-scaffold.md
        ├── vault-filesystem.md
        ├── vault-manager-ui.md            ← NEW (multi-vault manager + deletion flow)
        ├── monaco-editor-setup.md
        ├── remark-rehype-pipeline.md
        ├── github-oauth-device-flow.md
        ├── isomorphic-git-sync.md
        ├── sqlite-fts5-search.md
        ├── image-handling-ipc.md
        ├── d3-force-graph.md
        ├── electron-builder-packaging.md
        └── command-palette-pattern.md
```

### Skill File Schema
Each skill at `.claude/skills/{skill-name}.md`:
```markdown
# skill: {skill-name}
## Purpose / Inputs / Outputs / Key Packages / Core Pattern / File Locations / Reuse Notes
```

---

## 10. Complete Target File Structure

```
G:/aiprojects/MindPalace/
├── .claude/skills/          ← 12 skill files (generated per phase)
├── .github/workflows/ci.yml + release.yml
├── build/icons/             ← icon.ico, icon.icns, icon.png
├── src/
│   ├── main/
│   │   ├── index.ts         ← BrowserWindow, app lifecycle
│   │   ├── store.ts         ← electron-store instance (global registry)
│   │   ├── ipc/             ← auth, vault, notes, search, git, images
│   │   └── services/        ← AuthService, VaultService, VaultRegistry,
│   │                           IndexService, SearchService, GitService,
│   │                           SyncService, ImageService
│   ├── preload/
│   │   └── index.ts         ← contextBridge window.api
│   ├── renderer/
│   │   ├── components/
│   │   │   ├── VaultManager/  ← VaultManagerScreen, VaultCard, DeleteVaultModal
│   │   │   ├── Layout/
│   │   │   ├── Sidebar/       ← FileTree
│   │   │   ├── Editor/        ← MonacoEditor, MarkdownPreview, PropertiesPanel
│   │   │   ├── Search/        ← QuickSwitcher, SearchPanel, BacklinksPanel
│   │   │   ├── Sync/          ← SyncPanel, ConflictModal
│   │   │   ├── Auth/          ← ConnectGitHubModal
│   │   │   ├── Graph/         ← GraphView
│   │   │   ├── DailyNotes/
│   │   │   ├── CommandPalette/
│   │   │   └── Settings/
│   │   ├── stores/          ← vaultStore, notesStore, editorStore, syncStore, uiStore
│   │   ├── lib/             ← markdownPipeline, frontmatterParser, imageUtils,
│   │   │                       graphDataBuilder, themeEngine, slugify
│   │   └── styles/themes/   ← light.css, dark.css
│   └── types/               ← vault, notes, sync, search, ipc
├── CLAUDE.md
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── tsconfig.json (+ node/web variants)
├── tailwind.config.ts
└── vitest.config.ts
```

---

## 11. electron-builder.yml (Target)

```yaml
appId: com.mindpalace.app
productName: MindPalace
directories:
  output: dist-electron
  buildResources: build
win:
  target: [{ target: nsis, arch: [x64, ia32] }]
  icon: build/icons/icon.ico
  artifactName: MindPalace-${version}-win-${arch}.${ext}
mac:
  target: [{ target: dmg, arch: [x64, arm64] }]
  icon: build/icons/icon.icns
  hardenedRuntime: true
  artifactName: MindPalace-${version}-mac-${arch}.${ext}
linux:
  target: [{ target: AppImage, arch: [x64] }]
  icon: build/icons
  category: Office
  artifactName: MindPalace-${version}-linux-${arch}.${ext}
publish:
  provider: github
  owner: ilchophe
  repo: mindpalace
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

---

## 12. Critical Architecture Constraints

1. **contextBridge is mandatory** — `nodeIntegration: false`, `contextIsolation: true` always
2. **SQLite runs in main process only** — never attempt `better-sqlite3` in renderer; each vault gets its own db file at `<localPath>/.mindpalace/index.db`
3. **isomorphic-git HTTP** — import as `import http from 'isomorphic-git/http/node'`; not a separate npm package
4. **safeStorage fallback** — check `safeStorage.isEncryptionAvailable()`; on headless Linux without keyring, fall back to in-memory token (session-only) with user warning
5. **Monaco CSP** — requires `'unsafe-eval'`; set in BrowserWindow and `index.html` meta tag
6. **chokidar on Windows network drives** — use `usePolling: true, interval: 1000` if vault is on mapped drive
7. **Auto-save debounce** — keep at 1000ms minimum; shorter causes git race conditions on auto-commit
8. **Vault switch is destructive to UI state** — close all open editor tabs before switching; warn if unsaved changes exist
9. **Deletion double-validation** — renderer checks `confirmation === vault.name`; main process re-checks before `fs.rm`; GitHub API delete is the last step (after local delete succeeds)
10. **Slug immutability** — once a vault's slug is set (on creation), it must not change even if the display name is renamed, to avoid breaking the GitHub remote URL

---

## 13. Testing Strategy

| Phase | Unit | Integration | Manual |
|---|---|---|---|
| 0 | smoke test | CI lint+type-check | Electron window opens |
| 1 | VaultService (memfs mock), IndexService, slugify, VaultRegistry CRUD | chokidar fires IPC events | File tree CRUD; VaultManager filter/sort; deletion confirmation rejects wrong name |
| 2 | frontmatterParser, markdownPipeline | — | Monaco split view, YAML panel |
| 3 | AuthService safeStorage mock | GitService vs real test repo (GITHUB_TEST_TOKEN) | End-to-end sync; delete-with-remote option active post-auth |
| 4 | SearchService (`:memory:` SQLite) | Incremental index update | Cmd+P, backlinks |
| 5 | ImageService all 3 modes, rewritePaths | — | Clipboard paste, graph renders |
| 6 | — | All 3 platform builds succeed | Packaged app smoke test, auto-update, Switch vault in palette |
