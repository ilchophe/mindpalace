# MindPalace

A cross-platform desktop note-taking app that delivers Obsidian's local-first markdown editing experience while treating a GitHub repository as the authoritative vault — seamless multi-device sync via native git, no subscription, no proprietary sync service, every note a plain `.md` file you own entirely.

Each vault maps 1:1 to a GitHub repository. Switch between as many independent vaults as you like from the built-in Vault Manager, all backed by your own GitHub account.

---

## Features (planned)

| Feature | Phase | Status |
|---|---|---|
| Electron scaffold + CI/CD | 0 | ✅ Done |
| Vault Manager (multi-vault, switch, filter, delete) | 1 | ✅ Done |
| File tree + SQLite index | 1 | ✅ Done |
| Monaco editor + markdown preview | 2 | ✅ Done |
| GitHub auth (Device Flow) + git sync | 3 | ✅ Done |
| Full-text search + quick switcher | 4 | ✅ Done |
| Image handling + graph view + daily notes | 5 | ✅ Done |
| Command palette + settings + packaging | 6 | ✅ Done |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Shell | Electron 28 |
| Build | electron-vite 2 |
| Frontend | React 18 + TypeScript 5 |
| Editor | Monaco Editor |
| Markdown | remark + rehype pipeline |
| Git | isomorphic-git |
| Auth | GitHub Device Flow + safeStorage |
| State | Zustand |
| Styling | Tailwind CSS 3 (Catppuccin Mocha/Latte) |
| Config | electron-store |
| Search | better-sqlite3 (FTS5) |
| File watching | chokidar |
| Graph | D3.js v7 |
| Packaging | electron-builder |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

> **Phase 1 note:** SQLite (`better-sqlite3`) requires native compilation. Install the **"C++ Clang tools for Windows"** component via the VS 2019 installer before running Phase 1 code on Windows.

### Install

```bash
git clone https://github.com/ilchophe/mindpalace.git
cd mindpalace
npm install
```

### Development

```bash
npm run dev          # electron-vite HMR dev mode — opens Electron window
```

### Build

```bash
npm run build        # compile all three bundles (main / preload / renderer)
npm run build:win    # Windows NSIS installer → dist-electron/
npm run build:mac    # macOS DMG → dist-electron/
npm run build:linux  # Linux AppImage → dist-electron/
```

### Test & lint

```bash
npm test             # Vitest (node environment)
npm run typecheck    # tsc --noEmit (main + renderer tsconfigs)
npm run lint         # ESLint
npm run format       # Prettier
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   ELECTRON SHELL                     │
│  ┌──────────────────────────────────────────────┐   │
│  │            MAIN PROCESS (Node.js)            │   │
│  │  VaultService · VaultRegistry · GitService   │   │
│  │  AuthService · SearchService · ImageService  │   │
│  │  SyncService · IndexService (SQLite/FTS5)    │   │
│  │         IPC Bridge (domain:verb channels)    │   │
│  └──────────────────┬───────────────────────────┘   │
│       contextBridge │ window.api (preload.ts)        │
│  ┌──────────────────▼───────────────────────────┐   │
│  │         RENDERER PROCESS (React 18)          │   │
│  │  VaultManager · FileTree · MonacoEditor      │   │
│  │  MarkdownPreview · Graph · Search · Sync     │   │
│  │  CommandPalette · Settings                   │   │
│  │              Zustand global state            │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  PERSISTENCE: electron-store (global vault registry) │
│               SQLite (per-vault index)               │
│               vault .md files · GitHub remote        │
└──────────────────────────────────────────────────────┘
```

**Security rules (non-negotiable):**
- `nodeIntegration: false` and `contextIsolation: true` always
- Renderer never imports Node.js modules — IPC only via `window.api`
- GitHub tokens stored via `safeStorage` (OS keychain), never plaintext

---

## Multi-Vault Management

MindPalace supports any number of independent vaults. Open the Vault Manager with `Ctrl+Shift+V`.

- Each vault's display name determines its GitHub repository name (slug, immutable after creation)
- Filter vaults by name or label; sort by last opened, name, or note count
- Pin frequently-used vaults to the top
- Switch vaults instantly — the file tree and editor reset to the selected vault

### Vault deletion

Deletion requires deliberate confirmation:

1. You must **type the vault's exact name** into a confirmation field
2. A final warning appears before anything is deleted
3. Optionally delete the GitHub repository at the same time (requires `delete_repo` OAuth scope — irreversible, destroys all git history)

---

## Vault Storage

Notes are plain `.md` files in a folder you choose. A GitHub repo acts as the remote — push/pull happens automatically on save (configurable).

```
<vault-root>/
  *.md                         ← notes at any depth
  .mindpalace/config.json      ← committed vault config
  .mindpalace/sync-state.json  ← local only, never committed
  images/                      ← image attachments (configurable)
```

---

## Image Storage Modes

| Mode | Images saved at | Markdown embed |
|---|---|---|
| `same-folder` | next to the note | `![](img.png)` |
| `subfolder` *(default)* | `<note-dir>/images/` | `![](images/img.png)` |
| `global` | `<vault-root>/assets/images/` | `![](../assets/images/img.png)` |

---

## Phase Log

### Phase 6 — Command Palette, Settings & Packaging ✅
- `themeEngine.ts` — `applyTheme()` toggles `.light` class on `<html>`; `loadSavedTheme()` / `saveTheme()` persist to `localStorage`
- `uiStore.ts` — Zustand store for `isSettingsOpen`, `isGraphOpen`, `isCommandPaletteOpen`, `theme`; `toggleTheme()` applies + persists in one call
- `commands.ts` — `getAllCommands()` reads Zustand store snapshots at call time; returns typed `Command[]` with `id`, `label`, `shortcut`, `action`
- `CommandPalette` — `Ctrl+Shift+P` overlay; `useMemo` snapshots commands on open; substring filter; ↑↓ Enter Esc keyboard nav; runs action then closes
- `SettingsPanel` — tabbed modal (Appearance / Editor / Vault / Images / Sync); reads `activeConfig`; saves via `vault:updateConfig` + refreshes `vaultStore`
- `App.tsx` — applies persisted theme before first paint; `uiStore.setTheme` called on startup
- `MainLayout.tsx` — `Ctrl+,` opens settings; `Ctrl+Shift+P` opens command palette; graph/settings/palette state moved to `uiStore`; Settings button in sidebar
- `electron-updater` — `autoUpdater.checkForUpdatesAndNotify()` in main process (production builds only)
- `.github/workflows/release.yml` — tag-triggered (`v*`) matrix build across ubuntu/windows/macos; uploads installers to GitHub Release via `GH_TOKEN`

### Phase 5 — Images, Graph View & Daily Notes ✅
- `ImageService` — three storage modes (`same-folder`, `subfolder`, `global`); `paste()` saves base64 clipboard data; `importFile()` copies from arbitrary path; `rewritePaths()` fixes all `![](path)` embeds after a note is renamed
- `images IPC handlers` — `images:paste`, `images:importFile`, `images:rewritePaths`, `images:getMode`
- `MonacoEditor` — DOM capture paste listener (`addEventListener('paste', …, true)`) intercepts clipboard images before Monaco; converts to base64, calls `images:paste`, inserts `![](relPath)` at cursor
- `notes:rename` IPC — reads content after `renameSync`, calls `imageService.rewritePaths()` to fix embed paths, writes back if changed
- `graphDataBuilder.ts` — `buildGraphData(notes)` resolves `[[wiki-link]]` stems to note IDs and produces `{ nodes, links }` with per-node `linkCount` for radius sizing
- `GraphView` — D3 v7 force simulation in a React modal overlay; nodes are circles sized by link degree; active note highlighted in purple; zoom/pan via `d3.zoom`; drag via `d3.drag`; click opens note; `Ctrl+Shift+G` toggle
- `DailyNoteButton` — sidebar button creates/opens `{dailyNotesFolder}/{YYYY-MM-DD}.md`; applies `dailyNoteTemplate` with `{{date}}` substitution; `Ctrl+Shift+G` opens graph; daily note button always visible when a vault is open

### Phase 4 — Full-text Search & Quick Switcher ✅
- `IndexService` — added `body_text` column with schema migration; `extractOutlinks()` parses `[[wiki-links]]`; FTS5 virtual table now indexes title + tags + body
- `search()` — FTS5 prefix queries (`word*`) with BM25 ranking; `snippet()` highlights matched body text with `<mark>` tags
- `getBacklinks()` — SQL `json_each(outlinks)` query finds all notes linking to a given path or stem
- `getAllTags()` — SQL `json_each(tags)` aggregates all unique tags vault-wide
- `SearchService` — thin wrapper; `reindexVault()` re-walks all `.md` files for full rebuild
- `search IPC handlers` — `search:query`, `search:reindexVault`, `search:getAllTags`, `search:getBacklinks`
- `QuickSwitcher` — `Ctrl+P` modal; empty query shows 20 recently modified notes; debounced FTS search at 150ms; keyboard navigation (↑↓ / Enter / Esc)
- `BacklinksPanel` — collapsible panel below PropertiesPanel; lists notes linking to the active note; click to open
- `notes:getBacklinks` IPC — updated to use outlinks-based query instead of stale `inlinks` array

### Phase 3 — GitHub Auth & Git Sync ✅
- `AuthService` — GitHub Device Flow: request code → display → poll → safeStorage token encryption
- `GitService` — isomorphic-git wrapper: init, clone, addAll, commit, push, pull, sync, getLog, conflict resolution
- `SyncService` — sync orchestration: 30s debounce on save, interval timer, `syncNow()` via IPC
- `ConnectGitHubModal` — multi-step modal: configure OAuth client ID → Device Flow auth → create/link GitHub repo
- `SyncPanel` — sidebar sync status badge (synced / pulling / pushing / conflict / error) + manual sync button
- `ConflictModal` — side-by-side "Your version" vs "Remote version" with Keep Mine / Use Remote buttons
- `vault:clone` IPC — clone GitHub repo to local dir and open as vault
- `git:connectRemote` IPC — init + add remote + initial push for existing local vault
- `git:sync` IPC — stage all → commit if dirty → pull → push (retry once on PushRejectedError)
- Auto-sync wired into `notes:write` (30s debounce) and vault open (interval timer)
- `settingsStore` — app-settings electron-store for OAuth client ID, encrypted token, GitHub user
- `syncStore` Zustand store — auth status, device flow state, sync status, conflict list

### Phase 2 — Monaco Editor + Markdown Preview ✅
- `editorStore` — Zustand store: open tabs, active tab, view mode (`edit`/`split`/`preview`), dirty tracking, auto-save
- `MonacoEditor` — `@monaco-editor/react` uncontrolled (key-remount per tab), 1000ms debounce auto-save
- `MarkdownPreview` — async remark→rehype pipeline: GFM tables + task lists, KaTeX math (`$...$` / `$$...$$`), highlight.js syntax highlighting, `rehype-sanitize`
- `PropertiesPanel` — collapsible YAML frontmatter editor (key/value pairs); reads+writes via gray-matter
- `TabBar` — open tabs with dirty indicator and close button; activates nearest neighbour on close
- `EditorPane` — split-view orchestrator: left Monaco + right preview with toggle toolbar
- `markdownPipeline.ts` — singleton unified processor; safe for concurrent calls
- `frontmatterParser.ts` — `parseFrontmatter()` / `stringifyFrontmatter()` via gray-matter
- Vault switch closes all open tabs via `editorStore.closeAllTabs()`

### Phase 1 — Vault Management & File Tree ✅
- `VaultService` — open/create/close vaults, `config.json` read/write
- `VaultRegistry` — global electron-store registry of all vaults (`VaultSummary[]`)
- `IndexService` — per-vault SQLite (FTS5) with graceful fallback if native build unavailable
- chokidar file watcher → IPC push events (`vault:file-changed/created/deleted`)
- `VaultManagerScreen` — full-screen overlay: vault card grid, filter/label/sort, new vault form, open existing
- `VaultCard` — sync status badge, pin, context menu
- `DeleteVaultModal` — typed confirmation + 3-second hold-to-confirm final step; optional GitHub repo deletion
- `FileTree` — recursive tree with folder collapse, filter, live watcher updates
- `vault:switch` IPC — tears down watcher + SQLite, re-opens new vault
- `better-sqlite3` + `electron-rebuild` added; `@shared` alias exposed in both tsconfigs

### Phase 0 — Scaffold ✅
- Electron 28 + electron-vite 2 skeleton
- React 18 + TypeScript 5 renderer
- Tailwind CSS (Catppuccin Mocha dark / Latte light themes)
- Vitest smoke tests
- ESLint + Prettier
- electron-builder multi-platform config (NSIS / DMG / AppImage)
- GitHub Actions CI (ubuntu / windows / macos × Node 20)
- Initial push to [github.com/ilchophe/mindpalace](https://github.com/ilchophe/mindpalace)

---

## License

MIT
