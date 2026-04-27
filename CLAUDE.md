# MindPalace — CLAUDE.md

Tech: Electron 41 + electron-vite 5 + React 19 + TypeScript 6 + CodeMirror 6 + isomorphic-git

## Architecture Rules

- **Main process** (Node.js): services only — VaultService, GitService, AuthService, SearchService, ImageService, SyncService
- **Renderer** (React 19 + Zustand): IPC only via `window.api` (contextBridge). Never import Node.js modules.
- **NEVER** `nodeIntegration: true`. **NEVER** expose `ipcRenderer` directly to the renderer.
- `better-sqlite3` is **main-process ONLY**. Never bundle it in the renderer.
- `isomorphic-git` uses `@isomorphic-git/http/node` in main process **ONLY** (not the browser plugin).
- GitHub token stored via `safeStorage` — never write plaintext tokens to electron-store.
- Auto-save debounce: **1000ms minimum** — do not reduce (shorter causes git race conditions on auto-commit).
- Monaco requires `'unsafe-eval'` in CSP — this is already set in `src/renderer/index.html`.

## IPC Convention

Channel names: `domain:verb` (e.g. `notes:write`, `git:pull`).
All IPC constants live in `src/types/index.ts → IPC`.
All channels are exposed via `contextBridge` in `src/preload/index.ts → window.api`.

## Commands

```bash
npm run dev          # electron-vite HMR dev mode
npm run build        # compile all three bundles (main/preload/renderer)
npm run build:win    # Windows NSIS installer
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
npm test             # Vitest (node environment)
npm run typecheck    # tsc --noEmit (both tsconfig.node.json and tsconfig.web.json)
npm run lint         # ESLint
npm run format       # Prettier
```

## Project Structure

```
src/
  main/
    index.ts           ← BrowserWindow, app lifecycle
    store.ts           ← electron-store instance (Phase 1)
    ipc/               ← IPC handler registrations per domain
    services/          ← VaultService, IndexService, SearchService,
                          GitService, AuthService, SyncService, ImageService
  preload/
    index.ts           ← contextBridge window.api
  renderer/
    index.html         ← CSP meta tag lives here
    src/
      main.tsx         ← React root
      App.tsx
      components/      ← UI components by domain
      stores/          ← Zustand stores (vaultStore, notesStore, editorStore, syncStore, uiStore)
      lib/             ← markdownPipeline, frontmatterParser, imageUtils, graphDataBuilder, themeEngine
      styles/themes/   ← light.css, dark.css (CSS variable overrides)
  types/
    index.ts           ← Shared interfaces + IPC channel constants
```

## Skills

`.claude/skills/README.md` — index of all reusable skills generated per phase.
Each skill: `.claude/skills/{skill-name}.md`

## Phase Status

- [x] Phase 0 — Scaffold
- [x] Phase 1 — Vault Management & File Tree
- [x] Phase 2 — Monaco Editor + Markdown Preview (replaced by CM6 live preview, post-6)
- [x] Phase 3 — GitHub Auth & Git Sync
- [x] Phase 4 — Search, Quick Switcher & Tags
- [x] Phase 5 — Images, Graph View & Daily Notes
- [x] Phase 6 — Command Palette, Settings & Packaging
- [x] Post-6 — CM6 live preview, vault-file:// protocol, Lucide icons, context menu, Electron-safe dialogs
- [x] Phase 7a — Configurable Auto-Sync (user-selectable interval: Never / 5 / 15 / 30 min / 1 hour)
- [x] Phase 7b — Vault Import (import Obsidian or any folder: copy images, rewrite wiki-link embeds, rebuild index)
- [x] Phase 8a — Build Tools Security Fix (electron-builder 26 — HIGH tar CVEs)
- [x] Phase 8b — Build Toolchain (vite 7, electron-vite 5, vitest 4 — MOD esbuild CVE)
- [x] Phase 8c — Electron Runtime (Electron 41 — HIGH 17 electron CVEs)
- [x] Phase 8d — Runtime Libraries (React 19, Zustand 5)
- [x] Phase 8e — Dev Tooling (Tailwind 4, ESLint 9, TypeScript 6)

Phase 8 upgrade completed 2026-04-27. See [UPGRADE-PLAN.md](./UPGRADE-PLAN.md) for migration details.

## Phase 7 Specs

### Phase 7a — Configurable Auto-Sync
**Goal**: Let the user choose how often MindPalace auto-commits and pushes to GitHub.

**Deliverables**:
- `VaultConfig.syncIntervalMinutes` field (0 = disabled; options: 5, 15, 30, 60)
- `SyncService.startAutoSync` / `stopAutoSync` / `restartAutoSync` using `setInterval`
- `git:setSyncInterval` IPC handler — persists to config, restarts timer immediately
- Settings panel "Auto-sync interval" dropdown
- SyncPanel shows current interval ("every 5m") next to the sync status dot
- Migration: existing vaults without the field default to `syncIntervalMinutes: 5`

**Key files**:
- `src/types/index.ts` — add field to `VaultConfig`
- `src/main/services/SyncService.ts` — timer management
- `src/main/ipc/git.ts` — `git:setSyncInterval` handler
- `src/renderer/src/components/Settings/SettingsPanel.tsx` — interval picker
- `src/renderer/src/components/Sync/SyncPanel.tsx` — display label

**Skill**: `.claude/skills/configurable-auto-sync.md`

---

### Phase 7b — Vault Import (Obsidian / any folder)
**Goal**: Import an existing folder into the active vault, preserving images and
rewriting Obsidian-style wiki-link embeds to standard Markdown.

**Deliverables**:
- `ImportService.ts` — walk folder, copy `.md` + image files, rewrite `![[img.png]]` → `![](images/img.png)`
- `vault:importFolder` IPC handler + `vault:importProgress` push events
- `ImportFolderModal.tsx` — folder picker + live progress bar (scanning / copying / rewriting / done)
- "Import folder" button in VaultManagerScreen header
- After import: rebuild index, reload file tree

**Key files**:
- `src/main/services/ImportService.ts`
- `src/main/ipc/vault.ts` — add handler
- `src/renderer/src/components/VaultManager/ImportFolderModal.tsx`
- `src/types/index.ts` — `ImportProgress`, `ImportResult`, IPC constants

**Obsidian formats handled**:
| Format | Action |
|---|---|
| `![[image.png]]` | → `![](images/image.png)` |
| `![[folder/img.png]]` | → `![](folder/img.png)` |
| `[[Note Title]]` | unchanged (wiki-link, not image) |
| `![](image.png)` bare | → `![](images/image.png)` |
| `![](https://...)` | unchanged (external) |

**Skipped**: `.obsidian/`, `.git/`, any dot-directory, files > 50 MB

**Skill**: `.claude/skills/vault-import-obsidian.md`
