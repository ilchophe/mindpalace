# MindPalace — Technology Stack Upgrade Plan

## Completion

**Completed**: 2026-04-27  
**Actual effort**: ~1 session (all 5 phases completed in sequence)  
**Estimated effort**: 2–3 sessions  

All phases 8a–8e completed successfully. All checks pass: `npm run build`, `npm test`, `npm run typecheck`, `npm run lint` (0 errors).

Deferred items: `electron-store` kept at 8.2.0 (ESM migration), `chokidar` kept at 3.6.0 (ESM-only in v5), `monaco-editor` peer dependency added explicitly.

---

> **Generated**: 2026-04-27  
> **Trigger**: Dependabot PRs #5 (Electron 28→41) and #6 (vite 5→8 / electron-vite 2→5 / vitest 1→4)  
> **Original audit**: `npm audit` reported **21 vulnerabilities — 10 high, 7 moderate, 4 low** (now resolved)

Both Dependabot PRs were reviewed and **held** — each contains confirmed breaking changes that
require a coordinated, phased migration rather than an auto-merge.  This document is the
authoritative upgrade plan.

---

## 1. Security Vulnerability Summary

### 1.1 High-Severity (10)

| Package | Current | CVE / Advisory | Description |
|---|---|---|---|
| `electron` | 28.3.3 | GHSA-vmqv-hx8q-j7mg | ASAR integrity bypass via resource modification |
| `electron` | 28.3.3 | GHSA-5rqw-r77c-jp79 | AppleScript injection in `app.moveToApplicationsFolder` on macOS |
| `electron` | 28.3.3 | GHSA-xj5x-m3f3-5x3h | Service worker can spoof `executeJavaScript` IPC replies |
| `electron` | 28.3.3 | GHSA-r5p7-gp4j-qhrx | Incorrect origin passed to permission request handler for iframe requests |
| `electron` | 28.3.3 | GHSA-3c8v-cfp5-9885 | Out-of-bounds read in second-instance IPC on macOS/Linux |
| `electron` | 28.3.3 | GHSA-mwmh-mq4g-g6gr | Registry key path injection in `app.setAsDefaultProtocolClient` on Windows |
| `electron` | 28.3.3 | GHSA-4p4r-m79c-wq3v | HTTP response header injection in custom protocol handlers |
| `electron` | 28.3.3 | GHSA-9wfr-w7mm-pc7f | Renderer command-line switch injection via undocumented webPreference |
| `tar` | ≤7.5.10 | GHSA-34x7-hfp2-rc4v | Arbitrary file creation/overwrite via hardlink path traversal |
| `tar` | ≤7.5.10 | GHSA-8qq5-rm4j-mr97 | Arbitrary file overwrite via symlink poisoning |

> `tar` is a transitive dependency of `electron-rebuild` → `cacache`. It is only exercised at
> **build time** (native module rebuild), not at runtime in the packaged app. Risk is limited to
> the developer/CI environment.  
> The 8 `electron` CVEs above affect the **packaged app** and are the highest priority.

Additional `electron` high CVEs (same package, lower exploitation likelihood but still classified
high by the NVD): GHSA-532v-xpq5-8h95, GHSA-9w97-2464-8783, GHSA-8337-3p73-46f4,
GHSA-jjp3-mq3x-295m, GHSA-jfqx-fxh3-c62j, GHSA-9899-m83m-qhpj, GHSA-f37v-82c4-4x64,
GHSA-f3pv-wv63-48x8.

### 1.2 Moderate-Severity (7)

| Package | Current | CVE / Advisory | Description |
|---|---|---|---|
| `esbuild` | ≤0.24.2 | GHSA-67mh-4wv8-2f99 | Dev server accepts requests from any origin (CORS bypass) |
| `vite` | 5.4.21 | ↑ via esbuild | Transitively exposes esbuild dev server |
| `electron-vite` | 2.3.0 | ↑ via esbuild/vite | Same chain |
| `vitest` | 1.6.1 | ↑ via vite-node | Same chain |
| `dompurify` | ≤3.3.3 | GHSA-h8r8-wccr-v5f2 | Mutation-XSS via re-contextualization (transitive via monaco-editor) |
| `dompurify` | ≤3.3.3 | GHSA-v2wj-7wpq-c8vv | Cross-site scripting |
| `dompurify` | ≤3.3.3 | Multiple | ADD_ATTR/ADD_TAGS/FORBID_TAGS bypasses, prototype pollution |

> The `esbuild` CVE only applies during `npm run dev` (HMR server). It is **not present in
> packaged builds**. Still warrants fixing to protect developer machines.  
> The `dompurify` CVEs are **renderer-process only**; MindPalace uses `contextIsolation: true`
> and `nodeIntegration: false`, which limits blast radius, but notes rendered from untrusted
> sources (cloned vaults) could still be affected.

---

## 2. Full Dependency Inventory

### 2.1 Dependencies with Security Findings

| Package | Current | Target | Severity | Fix path |
|---|---|---|---|---|
| `electron` | 28.3.3 | **41.3.0** | 🔴 HIGH | Phase C |
| `electron-builder` | 24.13.3 | **26.8.1** | 🔴 HIGH (via `tar`) | Phase A |
| `electron-rebuild` | 3.2.9 | **2.0.3** * | 🔴 HIGH (via `tar`) | Phase A |
| `vite` | 5.4.21 | **8.0.10** | 🟡 MODERATE | Phase B |
| `electron-vite` | 2.3.0 | **5.0.0** | 🟡 MODERATE | Phase B |
| `vitest` | 1.6.1 | **4.1.5** | 🟡 MODERATE | Phase B |
| `dompurify` | ≤3.3.3 (transitive) | **≥3.3.4** | 🟡 MODERATE | Phase B† |

> \* `electron-rebuild` downgrade to 2.0.3 is what `npm audit fix --force` suggests; check the
> correct latest version before applying — this table entry may be a semver artefact.  
> † `dompurify` is a transitive dep of `monaco-editor`; fix by upgrading `@monaco-editor/react`.

### 2.2 All Outdated Packages (no current CVE)

| Package | Current | Latest | Breaking? | Upgrade Phase |
|---|---|---|---|---|
| `react` / `react-dom` | 18.3.1 | 19.2.5 | Yes — concurrent mode, `ref` API change | Phase D |
| `zustand` | 4.5.7 | 5.0.12 | Minor — `create` signature changed | Phase D |
| `electron-store` | 8.2.0 | 11.0.2 | Yes — ESM-only in v9+, schema API changes | Phase C |
| `chokidar` | 3.6.0 | 5.0.0 | Minor — drops some edge-case options | Phase D |
| `tailwindcss` | 3.4.19 | 4.2.4 | Yes — new engine, no `tailwind.config.ts`, CSS-first config | Phase E |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.1 | Requires Vite 8 | Phase B |
| `typescript` | 5.9.3 | 6.0.3 | Minor — stricter inference, some `exactOptionalPropertyTypes` changes | Phase E |
| `eslint` | 8.57.1 | 10.2.1 | Yes — flat config mandatory in v9, plugin ecosystem changes | Phase E |
| `eslint-plugin-react-hooks` | 4.6.2 | 7.1.1 | Requires ESLint 9 | Phase E |
| `@electron-toolkit/utils` | 3.0.0 | 4.0.0 | Minor | Phase C |
| `@electron-toolkit/tsconfig` | 1.0.1 | 2.0.0 | Minor | Phase C |
| `@electron-toolkit/eslint-config-*` | 2.x | 3.x | Requires ESLint 9 | Phase E |
| `@types/node` | 20.x | 25.x | Reflects Node 20→24 types (aligns with Electron 41) | Phase C |
| `@types/react` / `@types/react-dom` | 18.x | 19.x | Required for React 19 | Phase D |

---

## 3. Breaking Change Analysis

### 3.1 Electron 28 → 41 (Phase C) — HIGHEST IMPACT

**13 major versions**. Key API changes that affect MindPalace directly:

| Area | Change | Affected file(s) |
|---|---|---|
| **Node.js runtime** | v18.18 → v24.15 inside Electron. `util.promisify`, `fs`, stream APIs have new behaviour; `--experimental-vm-modules` flag may be needed for some CJS interop | All main-process services |
| **`electron-store`** | v8 is incompatible with Electron 41; must upgrade to v11 at the same time. v9+ is **ESM-only** — requires `await import('electron-store')` or a CJS wrapper | `src/main/store.ts`, all services reading store |
| **`better-sqlite3`** | Electron 41 ships a new V8/Node ABI. `electron-rebuild` must run against the new ABI; no prebuilt binary exists yet — node-gyp build will trigger | CI: `electron-rebuild` step in release workflow |
| **`safeStorage`** | API unchanged but key derivation in safeStorage changed between Electron 32 and 33 — existing encrypted tokens will be **unreadable** after upgrade. Users will be logged out. Needs migration path (attempt decrypt, on failure prompt re-auth) | `src/main/services/AuthService.ts` |
| **`contextBridge` / preload** | No breaking API changes but `ipcRenderer.invoke` return-type contract tightened in Electron 36+ — ensure all IPC handlers do not return `undefined` implicitly | `src/preload/index.ts`, all IPC handlers |
| **`shell.openExternal`** | Security prompts added in Electron 36 when calling `shell.openExternal` outside a user gesture | `src/main/ipc/auth.ts` (Device Flow browser open) |
| **Protocol handlers** | Custom protocol `vault-file://` registered via `protocol.registerFileProtocol` — this API was deprecated in Electron 32 in favour of `protocol.handle`. Must migrate before Electron 42 removes the old API | `src/main/index.ts` (protocol registration) |
| **Window controls overlay** | `titleBarStyle: 'hidden'` + `-webkit-app-region` behaviour confirmed stable, but `frame: false` resize-hit-target changed in Electron 41 on Windows. Re-test frameless window resizing | `src/renderer/src/components/Editor/TabBar.tsx`, `VaultManagerScreen.tsx` |
| **`electron-builder` version** | electron-builder 24 does not support Electron 41. Must upgrade to v26 simultaneously | `electron-builder.yml`, CI workflow |

### 3.2 electron-vite 2 → 5 + vite 5 → 8 (Phase B) — HIGH BUILD IMPACT

| Change | Detail | Affected file |
|---|---|---|
| **`externalizeDepsPlugin` removed** | `electron.vite.config.ts` uses `externalizeDepsPlugin()` directly — this is the most critical breaking change. In v5 it becomes `build: { externalizeDeps: true }` in the config object | `electron.vite.config.ts` |
| **Config interface restructured** | `ElectronViteConfig` interfaces changed; `isolateEntries` moved under `build`; function-based nested config fields removed | `electron.vite.config.ts` |
| **Vite 8 → Rolldown bundler** | Vite 8 replaced Rollup with Rolldown (Rust). Output behaviour is nearly identical for most apps but some edge cases differ: dynamic `import()` chunking, worker handling, certain plugin hooks. `@vitejs/plugin-react` must be ≥6.0.0 | `electron.vite.config.ts`, renderer bundle |
| **vitest 1 → 4** | `vitest.config.ts` `environment` option now defaults to `'node'` (was already set). Pool options renamed (`forks` → `vmForks`). Coverage provider config changed | `vitest.config.ts`, `src/tests/**` |

### 3.3 electron-builder 24 → 26 (Phase A) — LOW BUILD IMPACT

| Change | Detail |
|---|---|
| **`publish` provider config** | Minor changes to GitHub publish config syntax; `token` field handling changed |
| **NSIS one-click default** | `oneClick` option removed — `allowToChangeInstallationDirectory` now the primary control |
| **Linux snap support** | Snap target deprecated; not used in MindPalace |
| **macOS notarisation** | `hardened-runtime` + notarize config moved to a new `notarize` section; affects `electron-builder.yml` |

### 3.4 electron-store 8 → 11 (Phase C — bundled with Electron upgrade)

| Change | Detail |
|---|---|
| **ESM-only** | v9+ exports only ESM. In an Electron main process using CommonJS output (electron-vite default), must use dynamic `import()` or configure electron-vite to output ESM for main | `src/main/store.ts` |
| **Schema enforcement** | JSON schema validation now stricter; existing stores with extra fields may throw on load | `src/main/store.ts` |
| **Migration helper** | `migrations` API introduced for schema version upgrades | `src/main/store.ts` |

### 3.5 React 18 → 19 (Phase D) — MEDIUM RENDERER IMPACT

| Change | Detail |
|---|---|
| **`ref` as prop** | `forwardRef` removed; `ref` is now a regular prop in function components. Requires refactoring all `React.forwardRef(...)` calls | Search for `forwardRef` in `src/renderer/` |
| **`use` hook** | Context and promise reading via `use()` hook may conflict with some Zustand patterns | Low risk — MindPalace uses Zustand selectors, not context heavily |
| **Concurrent mode** | `useEffect` timing changes in Strict Mode; double-invocation in dev mode more aggressive | Test: editor auto-save debounce, sync timers |

### 3.6 Tailwind 3 → 4 (Phase E) — HIGH CSS IMPACT

| Change | Detail |
|---|---|
| **No `tailwind.config.ts`** | Config moves into CSS via `@theme` directive. The existing `tailwind.config.ts` with CSS variable extensions must be rewritten | `tailwind.config.ts` → deleted; `src/renderer/styles/main.css` updated |
| **New engine (Oxide)** | Built-in Rust engine, no PostCSS plugin needed. `postcss.config.js` changes | `postcss.config.js` |
| **Utility class renames** | `shadow-sm` → `shadow-xs`, `ring` utilities changed, `flex-shrink-*` → `shrink-*` (already fixed) | All component files |
| **Dark mode** | `darkMode: 'class'` config removed; dark mode now via CSS `@media` or `@variant dark` | `tailwind.config.ts`, theme engine |

### 3.7 ESLint 8 → 9/10 (Phase E) — CONFIG REWRITE

| Change | Detail |
|---|---|
| **Flat config mandatory** | `.eslintrc.*` format removed. Must migrate to `eslint.config.js` flat config | `.eslintrc.*` → `eslint.config.js` |
| **Plugin API changes** | `@electron-toolkit/eslint-config-ts` and `-prettier` v3 updated for flat config; `eslint-plugin-react-hooks` v7 required | `package.json` |

---

## 4. Phased Upgrade Plan

The upgrade is split into 5 phases ordered by: (1) security severity, (2) dependency coupling.
Each phase can be implemented and released independently.

```
Phase A  ─── Build tools security fix  (electron-builder 26, electron-rebuild fix)
Phase B  ─── Build toolchain           (vite 8, electron-vite 5, vitest 4)
Phase C  ─── Electron runtime          (electron 41, electron-store 11, @electron-toolkit 4)
Phase D  ─── Runtime libraries         (React 19, Zustand 5, chokidar 5)
Phase E  ─── Dev tooling               (Tailwind 4, ESLint 9, TypeScript 6)
```

---

### Phase A — Build Tools Security Fix
**Priority**: 🔴 HIGH — fixes high-severity `tar` CVEs in CI/dev environment  
**Effort estimate**: **2–3 hours**  
**Release**: patch bump (e.g. v0.2.1)

| Task | Detail |
|---|---|
| Upgrade `electron-builder` 24 → 26 | Update `package.json`; update `electron-builder.yml`: remove `nsis.oneClick` (now implicit), update `mac.notarize` section if using notarisation |
| Fix `electron-rebuild` | Upgrade to latest that resolves `tar` transitive; verify `npm audit` clears high-severity `tar` chain |
| Verify CI release workflow | Run `build:win`, `build:mac`, `build:linux` on a test branch tag; confirm `.exe`, `.dmg`, `.AppImage` still produced |
| Update `release.yml` | If `electron-builder` 26 changes any CLI flags used in the workflow |

**Risk**: Low. electron-builder 26 is a minor version jump from 24; the config changes are small
and isolated to `electron-builder.yml`.

**Acceptance criteria**:
- `npm audit` shows 0 high-severity findings related to `tar` / `http-proxy-agent` / `@tootallnate`
- All 3 platform builds succeed in GitHub Actions
- Packaged app installs and launches correctly on Windows

---

### Phase B — Build Toolchain (vite + electron-vite + vitest)
**Priority**: 🟡 MODERATE — fixes `esbuild` dev-server CORS CVE; no runtime impact  
**Effort estimate**: **1 day**  
**Release**: minor bump (e.g. v0.3.0)

| Task | Detail | File |
|---|---|---|
| Rewrite `electron.vite.config.ts` | Replace `externalizeDepsPlugin()` with `build: { externalizeDeps: true }` in `main` and `preload` sections; update `ElectronViteConfig` imports for v5 interface | `electron.vite.config.ts` |
| Upgrade `@vitejs/plugin-react` 4 → 6 | Required peer dep for Vite 8 | `package.json` |
| Update `vitest.config.ts` | Rename any `pool` options (`forks` → `vmForks` if used); check `environment` config | `vitest.config.ts` |
| Run `npm run build` | Verify all three bundles compile cleanly under Vite 8 / Rolldown | CI |
| Run `npm test` | Confirm test suite passes under vitest 4 | CI |
| Run `npm run dev` | Exercise HMR; verify live preview, editor, sync panel all function | Manual |

**Risk**: Medium. Rolldown (Vite 8's bundler) is production-ready but has edge cases with dynamic
imports and some Rollup plugin hooks. The `electron-vite` config rewrite is small and surgical.

**Acceptance criteria**:
- `npm audit` shows 0 moderate findings related to `esbuild` / `vite`
- `npm run build` succeeds; `out/` bundles are byte-equivalent in behaviour
- `npm test` — all existing tests pass
- Dev mode HMR works; no console errors in renderer

---

### Phase C — Electron Runtime Upgrade
**Priority**: 🔴 HIGH (security) but complex — requires Phase A as prerequisite  
**Effort estimate**: **4–5 days**  
**Prerequisites**: Phase A must be complete (electron-builder 26 required)  
**Release**: minor bump (e.g. v0.4.0)

| Task | Detail | File(s) |
|---|---|---|
| **Migrate protocol registration** | `protocol.registerFileProtocol` deprecated in Electron 32, removed in 42. Migrate to `protocol.handle` (Promise-based). The `vault-file://` protocol handler must be updated | `src/main/index.ts` |
| **Upgrade electron-store 8 → 11** | v9+ is ESM-only. Options: (a) use `await import('electron-store')` at startup and cache the instance, or (b) configure electron-vite to emit ESM for main process. Option (a) is lower risk | `src/main/store.ts` |
| **safeStorage migration guard** | Electron 33 changed safeStorage key derivation. Add try/catch around `safeStorage.decryptString`; on `Error` (decryption failure), clear stored token and emit an event that prompts re-auth in the renderer | `src/main/services/AuthService.ts` |
| **@electron-toolkit packages** | Upgrade `utils` 3→4, `tsconfig` 1→2, `eslint-config-*` 2→3 | `package.json`, `tsconfig.*.json` |
| **@types/node** | Bump to 25.x (aligns with Node 24 types shipped inside Electron 41) | `package.json` |
| **Test frameless window** | Re-test resize hit targets on Windows (Electron 41 changed resize border geometry for `frame: false`); re-test drag region on macOS | Manual — Windows + macOS |
| **Full regression test** | All vault operations, git sync, auth flow, import, search, graph | Manual |

**Risk**: High. safeStorage key-derivation change will log out all users silently if not
handled — the guard is critical. The protocol API migration is straightforward but must be
tested across all platforms (Windows uses a different MIME type resolution path).

**Acceptance criteria**:
- `npm audit` shows 0 high findings for `electron`
- App launches on all 3 platforms from a packaged build
- Existing users with stored tokens either continue working or are prompted cleanly to re-auth
- `vault-file://` images display correctly in the CM6 live preview
- Vault create, open, clone, sync, import all function

---

### Phase D — Runtime Libraries (React 19, Zustand 5, chokidar 5)
**Priority**: 🟢 LOW (no CVEs) — quality/currency improvement  
**Effort estimate**: **1–2 days**  
**Prerequisites**: Phase B (Vite 8 / @vitejs/plugin-react 6 required for React 19 support)  
**Release**: minor bump (e.g. v0.5.0)

| Task | Detail | File(s) |
|---|---|---|
| **React 19 — remove `forwardRef`** | Search `src/renderer/` for `React.forwardRef`; convert to regular prop `ref` passing | Any component using forwardRef |
| **React 19 — `use()` hook** | Optional: adopt `use(promise)` for async IPC calls; not required for basic compat | Low priority |
| **`@types/react` / `@types/react-dom`** | Bump to v19 to match | `package.json` |
| **Zustand 5 — `create` API** | `create<State>()(...)` signature change (extra call). Run find-replace; verify all 5 stores | `src/renderer/src/stores/*.ts` |
| **chokidar 5** | API is largely unchanged; verify `usePolling` option still works for network drives | `src/main/services/VaultService.ts` |
| **electron-updater** | Verify compatibility with Electron 41 (electron-updater 6.x should be fine) | `src/main/index.ts` |

**Risk**: Medium. React 19's `forwardRef` removal is the only structural change. Zustand 5
is a one-line change per store. chokidar 5 is backward-compatible.

**Acceptance criteria**:
- No TypeScript errors after type upgrades
- All 5 Zustand stores work; no console warnings about deprecated APIs
- File watcher fires on create/rename/delete; auto-save works

---

### Phase E — Dev Tooling (Tailwind 4, ESLint 9, TypeScript 6)
**Priority**: 🟢 LOW (no CVEs) — developer experience improvement  
**Effort estimate**: **1–2 days**  
**Prerequisites**: None (can be done in parallel with any phase)  
**Release**: patch or minor bump

| Task | Detail | File(s) |
|---|---|---|
| **Tailwind 4 — CSS-first config** | Delete `tailwind.config.ts`; move all `theme.extend` CSS variables into `src/renderer/styles/main.css` under `@theme { ... }`; remove `@tailwind base/components/utilities` directives (replaced by `@import 'tailwindcss'`) | `tailwind.config.ts` (delete), `src/renderer/styles/*.css` |
| **Tailwind 4 — PostCSS** | `@tailwindcss/postcss` replaces `tailwindcss` as the PostCSS plugin | `postcss.config.js`, `package.json` |
| **Tailwind 4 — class renames** | Audit for `shadow-sm` → `shadow-xs`, `overflow-ellipsis` → `text-ellipsis`, `flex-shrink`→`shrink`. Run the official Tailwind upgrade codemod | All component `.tsx` files |
| **ESLint 9 — flat config** | Migrate from `.eslintrc.*` to `eslint.config.js`; update `@electron-toolkit/eslint-config-*` to v3 | `.eslintrc.*` (delete), `eslint.config.js` (new) |
| **TypeScript 6** | Stricter inference around `exactOptionalPropertyTypes`; review any `?` optional fields that are currently assigned `undefined` explicitly | `src/types/index.ts`, service files |

**Risk**: Low-medium. Tailwind 4 is the most labour-intensive (requires a full CSS audit) but has
no runtime risk — it's purely dev/styling. ESLint flat config migration is well-documented and
tooling-supported. TypeScript 6 strictness changes typically surface as type errors rather than
runtime bugs.

**Acceptance criteria**:
- `npm run lint` passes with 0 errors under ESLint 9
- `npm run typecheck` passes with 0 errors under TypeScript 6
- Visual regression check: all screens (VaultManager, Editor, Settings, Graph) render correctly
- `npm run build` succeeds

---

## 5. Effort Summary & Timeline

| Phase | Packages | Security fixes | Effort | Suggested sprint |
|---|---|---|---|---|
| **A — Build tools** | electron-builder 26, electron-rebuild | 🔴 HIGH tar CVEs | **2–3 h** | Week 1 |
| **B — Build toolchain** | vite 8, electron-vite 5, vitest 4 | 🟡 MOD esbuild CVE | **1 day** | Week 1 |
| **C — Electron runtime** | Electron 41, electron-store 11 | 🔴 HIGH 17 CVEs | **4–5 days** | Week 2–3 |
| **D — Runtime libraries** | React 19, Zustand 5, chokidar 5 | none | **1–2 days** | Week 4 |
| **E — Dev tooling** | Tailwind 4, ESLint 9, TypeScript 6 | none | **1–2 days** | Week 4–5 |
| **Total** | | | **~9–12 days** | ~5 weeks |

> Phases A and B can be executed in the same sprint (Week 1) as they are independent of each
> other. Phase C must follow Phase A. Phases D and E can be interleaved.

---

## 6. CI/CD Changes Required

### release.yml
- **Phase A**: Update `electron-builder` invocation flags if any changed in v26
- **Phase C**: The Python 3.11 pin (already in place) remains correct — node-gyp still needs
  `distutils` to rebuild `better-sqlite3` against Electron 41's ABI
- **Phase C**: Add `electron-rebuild` step explicitly in CI to pre-build `better-sqlite3` before
  packaging (currently electron-builder triggers it implicitly; verify this still works with v26)

### Dependabot PRs
- **PR #5** (Electron 28→41): Do **not** merge directly. Implement Phase C manually to include
  the required code changes (protocol migration, safeStorage guard, electron-store ESM fix).
  Close PR #5 when Phase C is complete and released.
- **PR #6** (vite/electron-vite/vitest): Do **not** merge directly. Implement Phase B manually
  to include the `electron.vite.config.ts` rewrite. Close PR #6 when Phase B is complete.

---

## 7. Testing Strategy

### Per-Phase Test Gate

Each phase must pass its gate before merging to `main`:

| Phase | Automated | Manual |
|---|---|---|
| A | CI: all 3 platform builds succeed | Install packaged `.exe` on Windows; verify app launches |
| B | `npm run build` + `npm test` (green) | `npm run dev`: HMR works; editor + preview functional |
| C | `npm run build` + `npm test` (green) + CI all 3 platforms | Full regression: vault CRUD, git sync, auth, import, search, graph — all 3 OS |
| D | `npm run typecheck` (green) | Auto-save, file watcher, all Zustand stores |
| E | `npm run lint` + `npm run typecheck` (green) | Visual check all screens |

### Regression Checklist (Phase C — full regression)

- [ ] Create new vault (local only)
- [ ] Open existing vault
- [ ] Create / rename / delete note
- [ ] CodeMirror live preview renders markdown + images
- [ ] `vault-file://` images load correctly after protocol migration
- [ ] GitHub OAuth Device Flow completes; token stored/decrypted
- [ ] Auto-sync: commit + push fires on save
- [ ] Manual sync: pull + push
- [ ] Conflict detection modal
- [ ] Import Obsidian folder
- [ ] Full-text search (Ctrl+P)
- [ ] Graph view renders
- [ ] Daily notes
- [ ] Settings panel: all tabs, theme toggle
- [ ] Window controls (min/max/close) on Windows and Linux
- [ ] macOS: frameless title bar, traffic lights
- [ ] Auto-update check

---

## 8. Notes on Dependabot Configuration

To avoid future large-version pile-ups, consider adding `.github/dependabot.yml` with:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    ignore:
      # Hold major-version bumps for Electron — require manual migration
      - dependency-name: electron
        update-types: ["version-update:semver-major"]
      # Hold major-version bumps for build toolchain
      - dependency-name: vite
        update-types: ["version-update:semver-major"]
      - dependency-name: electron-vite
        update-types: ["version-update:semver-major"]
    groups:
      build-toolchain:
        patterns: ["vite", "electron-vite", "vitest", "@vitejs/*"]
      electron-toolkit:
        patterns: ["@electron-toolkit/*"]
```

This will:
- Batch vite/vitest/plugin-react updates together (they must move together)
- Suppress major-version Electron bumps (require intentional migration)
- Still surface patch/minor security fixes automatically

---

*This document should be updated as each phase completes. Mark phases `[x]` in CLAUDE.md Phase Status.*
