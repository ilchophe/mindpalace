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
| GitHub auth (Device Flow) + git sync | 3 | 🔲 Next |
| Full-text search + quick switcher | 4 | 🔲 Planned |
| Image handling + graph view + daily notes | 5 | 🔲 Planned |
| Command palette + settings + packaging | 6 | 🔲 Planned |

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
