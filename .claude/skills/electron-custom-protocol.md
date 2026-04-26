# skill: electron-custom-protocol

## Purpose
Serve local vault files (images, attachments) from a custom Electron protocol
(`vault-file://`) so the renderer can load them without disabling `webSecurity`
or exposing `file://` access broadly.

## Key Packages
- `electron` — `protocol`, `net`

## Core Pattern

### 1. Register scheme BEFORE `app.whenReady()` (top-level in main/index.ts)
```typescript
import { protocol } from 'electron'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vault-file',
    privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true }
  }
])
```

### 2. Handle requests INSIDE `app.whenReady()`
```typescript
import { net, protocol } from 'electron'

protocol.handle('vault-file', async (request) => {
  // URL format: vault-file:///C:/path/to/file.png  (Windows)
  //             vault-file:///home/user/vault/img.png  (Unix)
  const rawPath = request.url.slice('vault-file:///'.length)
  const filePath = decodeURI(rawPath)
  return net.fetch(`file:///${filePath}`)
})
```

### 3. Compute URL in renderer (no Node.js `path` module — pure string ops)
```typescript
function toVaultFileUrl(vaultPath: string, noteRelPath: string, imgSrc: string): string {
  if (!vaultPath || imgSrc.startsWith('http')) return imgSrc
  const noteDirParts = noteRelPath.split('/').slice(0, -1)
  const rawParts = [
    ...vaultPath.replace(/\\/g, '/').split('/'),
    ...noteDirParts,
    ...imgSrc.split('/')
  ]
  const resolved: string[] = []
  for (const seg of rawParts) {
    if (seg === '..') resolved.pop()
    else if (seg && seg !== '.') resolved.push(seg)
  }
  return `vault-file:///${encodeURI(resolved.join('/'))}`
}
```

## File Locations
- `src/main/index.ts` — scheme registration + protocol.handle
- `src/renderer/src/lib/livePreviewPlugin.ts` — `toVaultFileUrl()` helper

## Reuse Notes
- `registerSchemesAsPrivileged` MUST be called synchronously at module load time,
  before `app.whenReady()`. If called after ready the scheme is not trusted.
- Works on Windows (`C:/...`) and Unix (`/home/...`) without special-casing.
- `encodeURI` (not `encodeURIComponent`) preserves `/` separators.
- For images in CM6 widgets, pass `vaultPath` + `noteRelPath` via a CM6 `Facet`.
