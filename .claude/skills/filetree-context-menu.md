# skill: filetree-context-menu

## Purpose
Add an Obsidian-style right-click context menu to a file tree component,
with inline rename, recursive delete, show-in-explorer, and copy-path.

## Key Components

### ContextMenu.tsx
Fixed-position dropdown rendered at cursor coords. Closes on outside
`mousedown` or Escape. Items support icons, separators, and a `danger` style.

```typescript
interface ContextMenuItem {
  label: string; icon?: string; danger?: boolean
  separator?: boolean; onClick?: () => void
}
// Rendered as a fixed div; clamps to viewport with Math.min(x, innerWidth-200)
```

### Inline rename
State: `renamingPath: string | null`. When set to a node's path, that
`TreeItem` replaces its label with a controlled `<input>`. Enter = submit,
Escape/blur = cancel. The submit handler constructs the new path by replacing
only the basename, preserving the directory prefix.

```typescript
async function handleRenameSubmit(oldPath: string, newName: string) {
  const parts = oldPath.split('/')
  const newBaseName = isFile ? ensureMdExt(newName) : newName
  parts[parts.length - 1] = newBaseName
  const newPath = parts.join('/')
  await window.api.notes.rename(oldPath, newPath)
  renameItemPath(oldPath, newPath)   // updates open tabs
}
```

### Recursive delete
The IPC handler must use `rmSync(abs, { recursive: true })` for directories.
In the renderer, also close any tabs whose `relativePath` starts with the
deleted folder path.

### Context menu items (per node type)
Both files and folders get:
- New note / New folder (creates inside same folder as target)
- Rename… (triggers inline rename)
- Copy path (`navigator.clipboard.writeText`)
- Show in Explorer (`window.api.notes.showInExplorer`)
- Delete (with `window.confirm` warning for folders)

## IPC additions
```typescript
// notes:showInExplorer
ipcMain.handle('notes:showInExplorer', (_e, relPath) => {
  shell.showItemInFolder(join(vaultPath, relPath))
})
```

## File Locations
- `src/renderer/src/components/Sidebar/ContextMenu.tsx`
- `src/renderer/src/components/Sidebar/FileTree.tsx`
- `src/main/ipc/notes.ts`
- `src/renderer/src/env.d.ts` — add `showInExplorer` to window.api.notes type

## Reuse Notes
- The context menu uses `position: fixed` + cursor coords, not a portal — works
  fine inside a scrollable sidebar since fixed positioning escapes the scroll.
- Clamp coords with `Math.min(y, window.innerHeight - menuHeight)` to prevent
  overflow at the bottom of the viewport.
- Use a `useEffect` cleanup to add/remove document-level listeners on open.
