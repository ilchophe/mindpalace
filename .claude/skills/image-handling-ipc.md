# skill: image-handling-ipc

## Purpose
Three image storage modes (same-folder / subfolder / global) for Electron apps with a markdown editor. Handles clipboard paste (base64 → file), file import (copy), and relative-path rewriting when a note is renamed.

## Key Files
| File | Role |
|---|---|
| `src/main/services/ImageService.ts` | All image logic: targetDir, paste, importFile, rewritePaths, getMode |
| `src/main/ipc/images.ts` | IPC handlers for images:* channels |
| `src/renderer/src/components/Editor/MonacoEditor.tsx` | Clipboard paste handler wired via onMount + DOM capture listener |

## Three Storage Modes
```typescript
function targetDir(vaultPath: string, config: VaultConfig, noteRelPath: string): string {
  const noteDir = join(vaultPath, dirname(noteRelPath))
  switch (config.imageStorageMode) {
    case 'same-folder': return noteDir
    case 'subfolder':   return join(noteDir, config.imageSubfolderName)  // default: "images"
    case 'global':      return join(vaultPath, config.globalImagePath)   // default: "assets/images"
  }
}
// Embed path is always relative from note dir → image abs path
function embedPath(vaultPath, noteRelPath, imageAbsPath): string {
  return relative(join(vaultPath, dirname(noteRelPath)), imageAbsPath).replace(/\\/g, '/')
}
```

## Clipboard Paste (Renderer → Main)
```typescript
// In Monaco onMount handler — DOM capture before Monaco's own paste
const onPaste = async (e: ClipboardEvent) => {
  const imgItem = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
  if (!imgItem) return
  e.preventDefault(); e.stopPropagation()
  const blob = imgItem.getAsFile()
  const ab = await blob.arrayBuffer()
  const bytes = new Uint8Array(ab)
  let binary = ''; for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  const relPath = await window.api.images.paste(tab.relativePath, btoa(binary), imgItem.type)
  editor.executeEdits('', [{ range: cursorRange, text: `![](${relPath})` }])
}
domNode.addEventListener('paste', onPaste, true)  // capture phase
```

## Path Rewriting on Note Rename
```typescript
rewritePaths(oldRelPath, newRelPath, content): string {
  const oldDir = join(localPath, dirname(oldRelPath))
  const newDir = join(localPath, dirname(newRelPath))
  return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, imgPath) => {
    if (imgPath.startsWith('http')) return `![${alt}](${imgPath})`
    const absImg = join(oldDir, imgPath)
    return `![${alt}](${relative(newDir, absImg).replace(/\\/g, '/')})`
  })
}
// Call in notes:rename IPC handler after renameSync
```

## IPC Channel Registration
```typescript
ipcMain.handle(IPC.IMAGES.PASTE, (_e, noteRelPath, base64Data, mimeType) =>
  imageService.paste(noteRelPath, base64Data, mimeType))
ipcMain.handle(IPC.IMAGES.IMPORT_FILE, (_e, noteRelPath, sourcePath) =>
  imageService.importFile(noteRelPath, sourcePath))
ipcMain.handle(IPC.IMAGES.REWRITE_PATHS, (_e, old, next, content) =>
  imageService.rewritePaths(old, next, content))
ipcMain.handle(IPC.IMAGES.GET_MODE, () => imageService.getMode())
```

## Reuse Notes
- All file I/O stays in main process; renderer sends base64, receives relative embed path
- `btoa(String.fromCharCode(...bytes))` overflows the stack for large images — iterate with a loop instead
- Monaco's `onMount` is called once per key-change remount; use a `tabRef` so the paste closure always reads the current tab without re-registering
- Add `domNode.addEventListener` in capture phase (`true`) so it intercepts before Monaco's internal paste handler
- `VaultConfig.imageStorageMode` / `imageSubfolderName` / `globalImagePath` already exist in the type — read them from `vaultService.getActiveConfig()`
