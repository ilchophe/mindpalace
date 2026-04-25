# MindPalace — Product Specification & Implementation Plan

## Context

The user is a senior PM and developer/architect who uses Obsidian for documenting projects, experiments, and ideas. The goal is to recreate Obsidian as a first-party application ("MindPalace") built with Electron, using GitHub as the authoritative vault storage so notes remain plain `.md` files under full user ownership. The app must work across multiple devices (Windows, macOS, Linux) with seamless sync via git, support flexible image storage strategies, and automatically generate reusable Claude Code skills as each module is built. The project is a blank slate at `G:\aiprojects\MindPalace`.

---

## 1. Product Vision

MindPalace is a cross-platform desktop note-taking application that delivers Obsidian's local-first markdown editing experience while treating a GitHub repository as the authoritative vault — enabling seamless multi-device sync through native git operations, with no subscription, no proprietary sync service, and every note remaining a plain `.md` file owned entirely by the user. A built-in skill generation pipeline ensures every major module produces a reusable Claude Code skill, allowing the app to be incrementally grown with AI assistance using consistent, well-documented patterns.

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
│  │                                                            │  │
│  │              IPC Bridge (ipcMain — domain:verb channels)   │  │
│  └─────────────────────────┬──────────────────────────────────┘  │
│                            │ contextBridge (preload.ts)          │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │                RENDERER PROCESS (React 18)                 │  │
│  │                                                            │  │
│  │  FileTree  │  MonacoEditor  │  MarkdownPreview  │  Graph   │  │
│  │  Backlinks │  PropertiesPanel│  SyncPanel       │  Search  │  │
│  │  CommandPalette │ DailyNotes │ Settings                    │  │
│  │                                                            │  │
│  │              Zustand (global renderer state)               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  PERSISTENCE: electron-store (config) · SQLite (index) ·        │
│               vault folder (raw .md) · GitHub (remote)          │
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
| Build tool | electron-vite 5+ | Purpose-built for Electron: separate main/preload/renderer bundles, HMR, V8 bytecode |
| Runtime | Electron 28+, Node 20+ | LTS, stable contextBridge security model |
| Frontend | React 18 + TypeScript | Component-heavy UI; strict TS catches IPC type mismatches |
| Editor | Monaco Editor (`@monaco-editor/react`) | VS Code engine: syntax, vim keybindings, minimap, find-in-file |
| Markdown | remark + rehype pipeline | Modular plugin system for wiki-links, GFM, math (KaTeX), mermaid |
| Git | isomorphic-git + `@isomorphic-git/http/node` | Pure JS, no native binary, excellent Electron support |
| Auth | GitHub Device Flow + `safeStorage` | No redirect server needed; OS keychain token storage |
| State | Zustand | Minimal boilerplate, works outside React (for IPC event handlers) |
| Styling | Tailwind CSS 3 + shadcn/ui | Utility-first, Radix primitives, accessible |
| Config | electron-store | JSON store with schema validation |
| Search | better-sqlite3 (FTS5 virtual table) | Fast full-text search, sync API, main-process only |
| File watching | chokidar | Battle-tested cross-platform, low CPU |
| Packaging | electron-builder | .exe (NSIS), .dmg, .AppImage; GitHub Actions friendly |
| Graph | D3.js v7 | Force-directed graph for backlink visualization |

---

## 4. Key Data Models

### VaultConfig (electron-store + `.mindpalace/config.json` committed to repo)
```typescript
interface VaultConfig {
  id: string;                    // UUID
  name: string;
  localPath: string;             // absolute, main process only
  githubRepo: string | null;     // "owner/repo"
  githubBranch: string;          // default: "main"
  imageStorageMode: 'same-folder' | 'subfolder' | 'global';
  imageSubfolderName: string;    // default: "images" (subfolder is the default mode)
  globalImagePath: string;       // relative to vault root e.g. "assets/images"
  syncOnOpen: boolean;
  syncOnSave: boolean;
  syncIntervalMinutes: number;   // 0 = disabled
  dailyNotesFolder: string;
  dailyNoteTemplate: string;
  defaultEditorView: 'edit' | 'split' | 'preview';
  theme: string;
  customCSSPath: string | null;
}
```

### NoteMetadata (SQLite `notes` table + FTS5 virtual table)
```typescript
interface NoteMetadata {
  id: string;             // sha256 of relative path
  relativePath: string;
  title: string;
  tags: string[];
  aliases: string[];
  frontmatter: Record<string, unknown>;
  outlinks: string[];     // wiki-links this note points to
  inlinks: string[];      // backlinks
  wordCount: number;
  createdAt: string;
  modifiedAt: string;
}
```

### SyncState (`.mindpalace/sync-state.json`, never committed)
```typescript
interface SyncState {
  lastPullSHA: string | null;
  lastPushSHA: string | null;
  pendingLocalChanges: string[];
  conflictFiles: ConflictEntry[];
  syncStatus: 'idle' | 'pulling' | 'pushing' | 'conflict' | 'error';
}
```

---

## 5. IPC API Contract

All renderer↔main communication goes through `window.api` (contextBridge). Channel naming: `domain:verb`.

```typescript
// src/preload/index.ts — window.api surface
auth:    startDeviceFlow, pollDeviceAuth, getAuthStatus, logout
vault:   open, clone, create, getConfig, updateConfig, listRecent, close
notes:   list, read, write, rename, delete, createFolder, getBacklinks, resolveWikiLink
search:  query, reindexVault
git:     status, pull, commit, push, sync, resolveConflict, getLog, getDiff
images:  paste, importFile, rewritePaths, getMode

// Events pushed from main → renderer
vault:file-changed, vault:file-created, vault:file-deleted
git:sync-status, git:conflict-detected
```

Constraints: NEVER `nodeIntegration: true`. NEVER expose ipcRenderer directly. All IPC calls are typed and go through the bridge.

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
POST /login/device/code { client_id, scope: "repo" }
→ show user_code, open system browser to verification_uri
Poll POST /login/oauth/access_token every `interval` seconds
→ on success: safeStorage.encryptString(token) → store encrypted hex in electron-store
```

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
// @isomorphic-git/http/node — NOT browser plugin in main process
```

---

## 8. Phased Implementation Roadmap

### Phase 0 — Project Scaffold (Week 1)
**Deliverables**: `git init` + GitHub repo creation + initial push, electron-vite skeleton, React 18 + TypeScript, Tailwind, ESLint/Prettier, Vitest, electron-builder.yml skeleton, CI workflow (`.github/workflows/ci.yml`), CLAUDE.md
**Key files**: `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/main.tsx`
**GitHub App**: Use `GITHUB_OAUTH_CLIENT_ID=placeholder` in `.env.example`; replace with real client_id after registering a GitHub OAuth App in Phase 3 (Device Flow requires no client_secret)
**Skill generated**: `project-scaffold`
**Verify**: `npm run dev` opens Electron window; `npm run build` produces binary; `npm test` passes; repo visible on GitHub with CI running

### Phase 1 — Vault Management & File Tree (Week 2)
**Deliverables**: VaultService, IndexService (SQLite), chokidar watcher, FileTree component, electron-store config
**Key files**: `src/main/services/VaultService.ts`, `src/main/services/IndexService.ts`, `src/renderer/components/Sidebar/FileTree.tsx`
**SQLite schema**: `notes` table + `notes_fts` FTS5 virtual table
**Skill generated**: `vault-filesystem`
**Verify**: Open any folder; file tree renders; create/rename/delete; watcher fires on external edits

### Phase 2 — Monaco Editor + Markdown Preview (Week 3)
**Deliverables**: MonacoEditor, MarkdownPreview (remark/rehype pipeline), PropertiesPanel (YAML frontmatter), TabBar, auto-save (1000ms debounce)
**Key files**: `src/renderer/components/Editor/MonacoEditor.tsx`, `src/renderer/lib/markdownPipeline.ts`, `src/renderer/lib/frontmatterParser.ts`
**Remark pipeline**: `remark-parse → remark-wiki-links → remark-gfm → remark-math → rehype-katex → rehype-highlight → rehype-sanitize → rehype-stringify`
**CSP note**: Monaco requires `'unsafe-eval'`; set in BrowserWindow webPreferences + index.html meta
**Skill generated**: `monaco-editor-setup`, `remark-rehype-pipeline`
**Verify**: Monaco + preview split view; YAML panel reads/writes frontmatter; wiki-link navigation works

### Phase 3 — GitHub Auth & Git Sync (Week 4)
**Deliverables**: AuthService (Device Flow + safeStorage), GitService (isomorphic-git), SyncService, ConnectGitHubModal, SyncPanel, ConflictModal, vault clone from GitHub flow
**Key files**: `src/main/services/AuthService.ts`, `src/main/services/GitService.ts`, `src/main/services/SyncService.ts`
**Skill generated**: `github-oauth-device-flow`, `isomorphic-git-sync`
**Verify**: Connect GitHub; clone test repo; edit note; auto-commit fires; conflict resolution modal works

### Phase 4 — Search, Quick Switcher & Tags (Week 5)
**Deliverables**: SearchService (FTS5), QuickSwitcher (Ctrl+P), SearchPanel with tag/folder filters, BacklinksPanel, TagsPanel
**Key files**: `src/main/services/SearchService.ts`, `src/renderer/components/Search/QuickSwitcher.tsx`
**Skill generated**: `sqlite-fts5-search`
**Verify**: Ctrl+P returns ranked results; tag filter works; backlinks panel shows correct inbound links

### Phase 5 — Images, Graph View & Daily Notes (Week 6)
**Deliverables**: ImageService (all 3 modes + path rewriting), clipboard paste handler in Monaco, drag-drop import, GraphView (D3.js force graph), DailyNotes with templates
**Key files**: `src/main/services/ImageService.ts`, `src/renderer/components/Graph/GraphView.tsx`, `src/renderer/lib/graphDataBuilder.ts`
**Skill generated**: `image-handling-ipc`, `d3-force-graph`
**Verify**: Paste PNG → saved to correct folder → correct relative path in markdown; move note → paths updated; graph renders all nodes

### Phase 6 — Polish, Settings & Packaging (Week 7–8)
**Deliverables**: CommandPalette (Ctrl+Shift+P), SettingsPanel (General/GitHub/Editor/Vault/Image/Theme tabs), ThemeEngine (CSS variable injection, light/dark/custom), electron-builder multi-platform config, GitHub Actions release workflow, electron-updater auto-update
**Key files**: `electron-builder.yml`, `.github/workflows/release.yml`, `src/renderer/components/CommandPalette/CommandPalette.tsx`
**Skill generated**: `electron-builder-packaging`, `command-palette-pattern`
**Verify**: All 3 platform builds produce correct installers; auto-update detects test release; themes persist across restarts

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

### Naming Conventions
- Format: `{technology|domain}-{verb|noun}` in kebab-case
- Technology-first for library-specific skills: `isomorphic-git-sync`, `monaco-editor-setup`
- Domain-first for pattern skills: `vault-filesystem`, `command-palette-pattern`
- No version numbers in names (version lives inside the file)

---

## 10. Complete Target File Structure

```
G:/aiprojects/MindPalace/
├── .claude/skills/          ← 11 skill files (generated per phase)
├── .github/workflows/ci.yml + release.yml
├── build/icons/             ← icon.ico, icon.icns, icon.png
├── src/
│   ├── main/
│   │   ├── index.ts         ← BrowserWindow, app lifecycle
│   │   ├── store.ts         ← electron-store instance
│   │   ├── ipc/             ← auth, vault, notes, search, git, images
│   │   └── services/        ← AuthService, VaultService, IndexService,
│   │                           SearchService, GitService, SyncService, ImageService
│   ├── preload/
│   │   └── index.ts         ← contextBridge window.api
│   ├── renderer/
│   │   ├── components/      ← Layout, Sidebar, Editor, Search, Sync,
│   │   │                       Auth, Graph, DailyNotes, CommandPalette,
│   │   │                       Settings, Modals
│   │   ├── stores/          ← vaultStore, notesStore, editorStore, syncStore, uiStore
│   │   ├── lib/             ← markdownPipeline, frontmatterParser, imageUtils,
│   │   │                       graphDataBuilder, themeEngine
│   │   └── styles/themes/   ← light.css, dark.css
│   └── types/               ← vault, notes, sync, search, ipc
├── CLAUDE.md
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── tsconfig.json (+ main/preload/renderer variants)
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
  owner: <github-owner>
  repo: mindpalace
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

---

## 12. Critical Architecture Constraints

1. **contextBridge is mandatory** — `nodeIntegration: false`, `contextIsolation: true` always
2. **SQLite runs in main process only** — never attempt `better-sqlite3` in renderer
3. **isomorphic-git must use `@isomorphic-git/http/node`** in main process (not browser plugin)
4. **safeStorage fallback** — check `safeStorage.isEncryptionAvailable()`; on headless Linux without keyring, fall back to in-memory token (session-only) with user warning
5. **Monaco CSP** — requires `'unsafe-eval'`; set in BrowserWindow and `index.html` meta tag
6. **chokidar on Windows network drives** — use `usePolling: true, interval: 1000` if vault is on mapped drive
7. **Auto-save debounce** — keep at 1000ms minimum; shorter causes git race conditions on auto-commit

---

## 13. Testing Strategy

| Phase | Unit | Integration | Manual |
|---|---|---|---|
| 0 | smoke test | CI lint+type-check | Electron window opens |
| 1 | VaultService (memfs mock), IndexService | chokidar fires IPC events | File tree CRUD |
| 2 | frontmatterParser, markdownPipeline | — | Monaco split view, YAML panel |
| 3 | AuthService safeStorage mock | GitService vs real test repo (GITHUB_TEST_TOKEN) | End-to-end sync cycle |
| 4 | SearchService (`:memory:` SQLite) | Incremental index update | Cmd+P, backlinks |
| 5 | ImageService all 3 modes, rewritePaths | — | Clipboard paste, graph renders |
| 6 | — | All 3 platform builds succeed | Packaged app smoke test, auto-update prompt |

---

## 14. CLAUDE.md Content (to write in Phase 0)

```markdown
# MindPalace — CLAUDE.md

Tech: Electron 28 + electron-vite 5 + React 18 + TypeScript + Monaco + isomorphic-git

## Architecture Rules
- Main process: Node.js services (Vault, Git, Auth, Search, Image, Sync)
- Renderer: React 18 + Zustand — IPC only via window.api (contextBridge)
- NEVER nodeIntegration: true. NEVER expose ipcRenderer to renderer directly.
- SQLite (better-sqlite3) is main-process ONLY.
- isomorphic-git uses @isomorphic-git/http/node in main process ONLY.
- GitHub token stored via safeStorage — never plaintext electron-store.
- Auto-save debounce: 1000ms minimum — do not reduce.

## Commands
npm run dev          # electron-vite HMR dev mode
npm run build:win    # Windows NSIS installer
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
npm run test         # Vitest (main + renderer envs)
npm run typecheck    # tsc --noEmit all three configs

## Skills
.claude/skills/README.md — index of all reusable skills
```
