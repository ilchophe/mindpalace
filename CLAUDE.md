# MindPalace — CLAUDE.md

Tech: Electron 28 + electron-vite 2 + React 18 + TypeScript 5 + Monaco Editor + isomorphic-git

## Architecture Rules

- **Main process** (Node.js): services only — VaultService, GitService, AuthService, SearchService, ImageService, SyncService
- **Renderer** (React 18 + Zustand): IPC only via `window.api` (contextBridge). Never import Node.js modules.
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
- [x] Phase 2 — Monaco Editor + Markdown Preview
- [x] Phase 3 — GitHub Auth & Git Sync
- [x] Phase 4 — Search, Quick Switcher & Tags
- [ ] Phase 5 — Images, Graph View & Daily Notes
- [ ] Phase 6 — Polish, Settings & Packaging
