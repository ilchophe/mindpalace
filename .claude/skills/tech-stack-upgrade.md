# Tech Stack Upgrade Skill

**Phase**: 8 (Security + Modernization)
**Completed**: 2026-04-27

## What This Upgrades

Full coordinated upgrade of the Electron app tech stack from Phase 0 versions to current LTS/stable:

| Package | Old | New | Reason |
|---|---|---|---|
| `electron` | 28.3.3 | 41.3.0 | 17 HIGH CVEs |
| `electron-builder` | 24.9.4 | 26.8.1 | tar HIGH CVEs |
| `electron-vite` | 2.0.0 | 5.0.0 | esbuild MOD CVE, new API |
| `vite` | 5.1.4 | 7.3.2 | esbuild CVE (vite 8 not yet supported by electron-vite 5) |
| `vitest` | 1.3.1 | 4.1.5 | aligned with vite 7 |
| `@vitejs/plugin-react` | 4.2.1 | 5.2.0 | aligned with vite 7 |
| `react` / `react-dom` | 18.2.0 | 19.0.0 | latest stable |
| `@types/react` / `@types/react-dom` | 18.x | 19.x | match runtime |
| `zustand` | 4.5.2 | 5.0.12 | latest stable |
| `tailwindcss` | 3.4.1 | 4.2.4 | CSS-first config |
| `@tailwindcss/postcss` | — | 4.2.4 | NEW: replaces tailwindcss postcss plugin |
| `eslint` | 8.57.0 | 9.x | flat config |
| `eslint-plugin-react-hooks` | 4.6.2 | 5.2.0 | ESLint 9 compatible |
| `@eslint/eslintrc` | — | 3.3.1 | NEW: compat layer for legacy eslint configs |
| `@eslint/js` | — | 9.27.0 | NEW: flat config recommended |
| `typescript` | 5.3.3 | 6.0.3 | latest stable |
| `@electron-toolkit/tsconfig` | 1.0.1 | 2.0.0 | supports Electron 41 |
| `@electron-toolkit/utils` | 3.0.0 | 4.0.0 | supports Electron 41 |
| `@types/node` | 20.x | 25.x | Node types update |
| `monaco-editor` | (missing) | 0.55.x | peer dep now explicit |

**Kept at current version (deferred):**
- `electron-store`: 8.2.0 — ESM-only migration to v11 deferred (complex, no CVE)
- `chokidar`: 3.6.0 — ESM-only in v5, deferred

## Key Config Changes

### electron.vite.config.ts
`externalizeDepsPlugin()` is REMOVED in electron-vite 5. Replace with build option:
```typescript
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: { externalizeDeps: true },
    resolve: { alias: { '@shared': resolve('src/types') } }
  },
  preload: {
    build: { externalizeDeps: true }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/types')
      }
    },
    plugins: [react()]
  }
})
```

### postcss.config.js (Tailwind 4)
```javascript
module.exports = {
  plugins: { '@tailwindcss/postcss': {} }
}
```

### global.css (Tailwind 4 CSS-first)
Delete `tailwind.config.ts` entirely. Replace `@tailwind base/components/utilities` with:
```css
@import "tailwindcss";
@source "../**/*.{js,ts,jsx,tsx}";
@source "../../index.html";

@theme inline {
  --font-family-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --color-vault-bg: var(--vault-bg);
  --color-vault-surface: var(--vault-surface);
  --color-vault-border: var(--vault-border);
  --color-vault-text: var(--vault-text);
  --color-vault-muted: var(--vault-muted);
  --color-vault-accent: var(--vault-accent);
}
```
The `@theme inline` generates utility classes (bg-vault-surface etc.) referencing existing CSS vars.

Note on @source paths: relative to the CSS file at `src/renderer/src/styles/global.css`:
- `../` → `src/renderer/src/` (components)
- `../../index.html` → `src/renderer/index.html`

### eslint.config.mjs (ESLint 9 flat config)
Delete `.eslintrc.cjs`. Create `eslint.config.mjs`:
```javascript
import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
})

export default [
  { ignores: ['node_modules/**', 'out/**', 'dist-electron/**', '.eslintrc.cjs'] },
  ...compat.extends('@electron-toolkit/eslint-config-ts/recommended', '@electron-toolkit/eslint-config-prettier'),
  ...compat.plugins('react-hooks'),
  ...compat.extends('plugin:react-hooks/recommended'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
]
```

Also update the `lint` script: ESLint 9 flat config drops `--ext` and `--ignore-path` flags:
```json
"lint": "eslint ."
```

### AuthService.ts — safeStorage guard (Electron key rotation)
Between Electron 32 and 33, safeStorage key derivation changed. Catch decrypt failures and clear stale tokens:
```typescript
getToken(): string | null {
  const hex = settingsStore.get('settings.githubTokenEncrypted') as string
  if (!hex) return null
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(hex, 'hex'))
    }
    return null
  } catch {
    // Key changed between Electron versions — clear stale token
    this.clearToken()
    return null
  }
}
```

## Lessons Learned

1. **electron-vite 5 breaking change**: `externalizeDepsPlugin()` removed, use `build.externalizeDeps: true` instead.
2. **Tailwind 4**: CSS-first config means deleting `tailwind.config.ts` entirely. The `@theme inline` directive is the replacement for `extend.colors`. @source paths are relative to the CSS file.
3. **ESLint 9 flat config**: Old `--ext` and `--ignore-path` CLI flags removed. Use `ignores` in the config array instead.
4. **monaco-editor peer dep**: `@monaco-editor/react` requires `monaco-editor` as a peer, but it wasn't in package.json. TypeScript 6 made this visible. Install it explicitly.
5. **React 19 + Zustand 5**: Both were drop-in compatible — no source code changes needed beyond updating types.
6. **TypeScript 6**: No breaking changes encountered for this codebase. Stricter inference didn't affect existing code.
7. **npm install flag**: Use `--legacy-peer-deps` when multiple major upgrades are in flight simultaneously.

## Regression Verification

After all phases, verify:
- `npm run build` — all 3 bundles (main/preload/renderer)
- `npm test` — smoke tests pass
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors (CRLF warnings on Windows are expected, not errors)
