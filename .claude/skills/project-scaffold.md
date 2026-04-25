---
name: project-scaffold
description: Set up a new Electron + electron-vite + React 18 + TypeScript project with Tailwind, ESLint, Prettier, Vitest, and electron-builder multi-platform packaging
type: reference
---

# skill: project-scaffold

## Purpose
Bootstrap a production-ready Electron desktop app using electron-vite, React 18, TypeScript 5, Tailwind CSS, and electron-builder. Establishes all three process bundles (main / preload / renderer) with correct isolation, shared types, and CI.

## Inputs
- App name, appId (e.g. `com.yourapp.app`), GitHub owner/repo for electron-builder publish

## Outputs
- `package.json` with all deps and scripts
- `electron.vite.config.ts` — separate main/preload/renderer bundles with path aliases
- `tsconfig.json` + `tsconfig.node.json` + `tsconfig.web.json`
- `tailwind.config.ts` + `postcss.config.js`
- `.eslintrc.cjs` + `.prettierrc`
- `vitest.config.ts`
- `electron-builder.yml`
- `src/main/index.ts` — BrowserWindow with `contextIsolation: true`, `nodeIntegration: false`
- `src/preload/index.ts` — stub `contextBridge.exposeInMainWorld('api', {...})`
- `src/renderer/index.html` — CSP meta tag with `'unsafe-eval'` for Monaco
- `src/renderer/src/main.tsx` + `App.tsx`
- `src/types/index.ts` — shared interfaces + IPC channel name constants
- `CLAUDE.md`, `.env.example`, `.gitignore`
- `.github/workflows/ci.yml` — lint + typecheck + test + build on ubuntu/windows/macos
- `.claude/skills/README.md` + this file

## Key Packages
| Package | Version | Role |
|---|---|---|
| electron-vite | ^2.0.0 | Build tool: HMR, separate bundles, V8 cache |
| electron | ^28.x | Runtime |
| @electron-toolkit/utils | ^3.0.0 | `is.dev`, `electronApp`, `optimizer` helpers |
| @electron-toolkit/tsconfig | ^1.0.1 | Base tsconfig for node + web targets |
| @vitejs/plugin-react | ^4.x | Renderer React + HMR |
| tailwindcss | ^3.x | Utility CSS |
| vitest | ^1.x | Unit tests (node environment) |
| electron-builder | ^24.x | .exe / .dmg / .AppImage packaging |

## Core Pattern

### BrowserWindow (main/index.ts)
```typescript
new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    nodeIntegration: false,   // NEVER true
    contextIsolation: true    // ALWAYS true
  }
})
```

### contextBridge (preload/index.ts)
```typescript
contextBridge.exposeInMainWorld('api', {
  domain: { verb: (...args) => ipcRenderer.invoke('domain:verb', ...args) }
})
```

### Window.api type (renderer — declare global)
```typescript
// src/renderer/src/env.d.ts
interface Window {
  api: import('@shared/index').WindowApi
}
```

### CSP for Monaco
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'" />
```

## File Locations (relative to project root)
- Main entry: `src/main/index.ts`
- Preload: `src/preload/index.ts`
- Renderer HTML: `src/renderer/index.html`
- Renderer entry: `src/renderer/src/main.tsx`
- Shared types + IPC constants: `src/types/index.ts`
- Path alias `@shared/*` → `src/types/*` (both tsconfigs + electron.vite.config.ts)
- Path alias `@renderer/*` → `src/renderer/src/*` (tsconfig.web.json + electron.vite.config.ts)

## Reuse Notes
- Copy the IPC constants pattern from `src/types/index.ts` (`IPC` object) into every new project — keeps channel names in sync between main and renderer without string duplication.
- The CSS variable approach in `global.css` (`--vault-*`) is the theming foundation — each theme file just overrides these variables.
- `electron-builder.yml` `publish.owner` and `publish.repo` must be updated before running release builds.
- Device Flow OAuth requires no `client_secret` — only `GITHUB_OAUTH_CLIENT_ID` is needed (see `.env.example`).
