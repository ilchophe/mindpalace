# skill: electron-builder-packaging

## Purpose
Multi-platform Electron packaging (Windows NSIS, macOS DMG, Linux AppImage) with GitHub Releases as the publish target, plus a GitHub Actions release workflow triggered by semver tags.

## Key Files
| File | Role |
|---|---|
| `electron-builder.yml` | Build config: targets, icons, artifact names, publish |
| `.github/workflows/release.yml` | CI workflow: builds all 3 platforms on tag push, uploads to GitHub Release |
| `src/main/index.ts` | `autoUpdater.checkForUpdatesAndNotify()` for packaged builds |
| `package.json` | `build:win/mac/linux` scripts + `electron-updater` dependency |

## electron-builder.yml Key Sections
```yaml
appId: com.yourapp.id
productName: YourApp
directories:
  output: dist-electron
  buildResources: build       # icons live here

win:
  target: [{ target: nsis, arch: [x64, ia32] }]
  icon: build/icons/icon.ico
  artifactName: YourApp-${version}-win-${arch}.${ext}

mac:
  target: [{ target: dmg, arch: [x64, arm64] }]
  icon: build/icons/icon.icns
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  artifactName: YourApp-${version}-mac-${arch}.${ext}

linux:
  target: [{ target: AppImage, arch: [x64] }]
  icon: build/icons         # directory of PNG icons
  category: Office
  artifactName: YourApp-${version}-linux-${arch}.${ext}

publish:
  provider: github
  owner: <github-owner>
  repo: <repo-name>

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

## GitHub Actions Release Workflow
```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['v*']
jobs:
  release:
    permissions:
      contents: write    # electron-builder needs this to create the release
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: ubuntu-latest,  build_cmd: build:linux }
          - { os: windows-latest, build_cmd: build:win   }
          - { os: macos-latest,   build_cmd: build:mac   }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npm run ${{ matrix.build_cmd }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # auto-provided, no extra secret needed
```

## Auto-Updater (electron-updater)
```typescript
// src/main/index.ts
import { autoUpdater } from 'electron-updater'

app.whenReady().then(() => {
  // ... register IPC handlers, createWindow() ...
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
  }
})
```

## Build Commands
```bash
npm run build:win    # → dist-electron/MindPalace-x.y.z-win-x64.exe
npm run build:mac    # → dist-electron/MindPalace-x.y.z-mac-x64.dmg
npm run build:linux  # → dist-electron/MindPalace-x.y.z-linux-x64.AppImage
```

## Release Flow
1. `git tag v1.0.0 && git push --tags` triggers release workflow
2. All three platform jobs run in parallel
3. electron-builder creates a GitHub Draft Release and uploads installers
4. Publish the draft on GitHub to make it live
5. `autoUpdater` in running instances detects the new version on next check

## Reuse Notes
- macOS requires `hardenedRuntime: true` + entitlements plist for notarisation; add a code-signing step if distributing publicly
- `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` is auto-provided in GitHub Actions — no extra secret needed unless using a PAT
- `electron-updater` reads the `publish` config from `electron-builder.yml` automatically
- In dev builds, `autoUpdater.checkForUpdatesAndNotify()` throws because there is no `latest.yml` — always guard with `if (!is.dev)`
- Icon assets go in `build/icons/`: `icon.ico` (Windows), `icon.icns` (macOS), `icon.png` or a `icons/` subfolder of PNGs (Linux)
