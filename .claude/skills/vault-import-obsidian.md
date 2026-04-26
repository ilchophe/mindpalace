# skill: vault-import-obsidian

## Purpose
Import an existing folder (e.g. an Obsidian vault) into the active MindPalace
vault. All `.md` files, images, and attachments are copied while preserving the
original directory structure. Obsidian wiki-link image embeds (`![[img.png]]`)
are rewritten to standard Markdown (`![](images/img.png)`) so they render
correctly in MindPalace's CM6 live preview. The search index is rebuilt after
the import completes.

---

## Key Files

| File | Role |
|---|---|
| `src/main/services/ImportService.ts` | Core import logic: copy, rewrite, index |
| `src/main/ipc/vault.ts` | `vault:importFolder` IPC handler |
| `src/renderer/src/components/VaultManager/ImportFolderModal.tsx` | Folder picker + progress UI |
| `src/types/index.ts` | `ImportProgress` + `ImportResult` types + IPC constant |

---

## IPC contract

```typescript
// src/types/index.ts
export interface ImportProgress {
  phase: 'scanning' | 'copying' | 'rewriting' | 'indexing' | 'done'
  total: number
  done: number
  currentFile: string
}

export interface ImportResult {
  notesImported: number
  imagesImported: number
  referencesRewritten: number
  errors: string[]            // non-fatal; import continues on errors
}

// IPC channel
VAULT: {
  // ...existing...
  IMPORT_FOLDER:    'vault:importFolder',
  IMPORT_PROGRESS:  'vault:importProgress',   // pushed event (webContents.send)
}
```

---

## ImportService core pattern

```typescript
// src/main/services/ImportService.ts
import { cpSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, relative, extname, dirname, basename } from 'path'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])
const MD_EXT = '.md'

export class ImportService {
  async importFolder(
    sourcePath: string,
    vaultPath: string,
    imageSubfolder: string,           // from VaultConfig, e.g. "images"
    onProgress: (p: ImportProgress) => void
  ): Promise<ImportResult> {
    // 1. Scan
    onProgress({ phase: 'scanning', total: 0, done: 0, currentFile: '' })
    const allFiles = this.walkDir(sourcePath)
    const mdFiles  = allFiles.filter(f => extname(f).toLowerCase() === MD_EXT)
    const imgFiles = allFiles.filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
    const total = mdFiles.length + imgFiles.length
    let done = 0
    const result: ImportResult = { notesImported: 0, imagesImported: 0, referencesRewritten: 0, errors: [] }

    // 2. Copy images (preserving subfolder structure)
    onProgress({ phase: 'copying', total, done, currentFile: '' })
    for (const imgAbs of imgFiles) {
      try {
        const rel = relative(sourcePath, imgAbs)
        const dest = join(vaultPath, rel)
        mkdirSync(dirname(dest), { recursive: true })
        cpSync(imgAbs, dest)
        result.imagesImported++
      } catch (e) {
        result.errors.push(`copy: ${imgAbs}: ${(e as Error).message}`)
      }
      onProgress({ phase: 'copying', total, done: ++done, currentFile: basename(imgAbs) })
    }

    // 3. Copy + rewrite .md files
    onProgress({ phase: 'rewriting', total, done, currentFile: '' })
    for (const mdAbs of mdFiles) {
      try {
        const rel = relative(sourcePath, mdAbs)
        const dest = join(vaultPath, rel)
        mkdirSync(dirname(dest), { recursive: true })
        let content = readFileSync(mdAbs, 'utf8')
        const { content: rewritten, count } = this.rewriteObsidianEmbeds(content, rel, imageSubfolder)
        result.referencesRewritten += count
        writeFileSync(dest, rewritten, 'utf8')
        result.notesImported++
      } catch (e) {
        result.errors.push(`rewrite: ${mdAbs}: ${(e as Error).message}`)
      }
      onProgress({ phase: 'rewriting', total, done: ++done, currentFile: basename(mdAbs) })
    }

    onProgress({ phase: 'done', total, done: total, currentFile: '' })
    return result
  }

  // Walk directory recursively, returning absolute paths of all files
  private walkDir(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue   // skip .obsidian, .git etc.
      const full = join(dir, entry.name)
      if (entry.isDirectory()) results.push(...this.walkDir(full))
      else results.push(full)
    }
    return results
  }

  // Rewrite Obsidian wiki-link embeds to standard Markdown img tags
  // ![[image.png]]  →  ![](images/image.png)     (subfolder mode)
  // ![[sub/img.png]] →  ![](sub/img.png)          (already-pathed — kept as-is)
  rewriteObsidianEmbeds(
    content: string,
    noteRelPath: string,
    imageSubfolder: string
  ): { content: string; count: number } {
    let count = 0

    // Match ![[...]] where the target looks like an image
    const rewritten = content.replace(
      /!\[\[([^\]]+)\]\]/g,
      (_match, target: string) => {
        const trimmed = target.trim()
        const ext = extname(trimmed).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) return _match   // wiki-link to another note — leave alone
        // If the source already has a path separator, trust it
        const imgPath = trimmed.includes('/')
          ? trimmed
          : `${imageSubfolder}/${trimmed}`
        count++
        return `![](${imgPath})`
      }
    )

    // Also fix bare ![](img.png) references that Obsidian stores without a subfolder
    // by prepending the imageSubfolder when the path has no directory component
    const rewritten2 = rewritten.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt: string, src: string) => {
        if (src.startsWith('http') || src.startsWith('/') || src.includes('/')) return _match
        const ext = extname(src).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) return _match
        count++
        return `![${alt}](${imageSubfolder}/${src})`
      }
    )

    return { content: rewritten2, count }
  }
}
export const importService = new ImportService()
```

---

## IPC handler

```typescript
// src/main/ipc/vault.ts  (inside registerVaultHandlers)
import { importService } from '../services/ImportService'

ipcMain.handle(IPC.VAULT.IMPORT_FOLDER, async (event, sourcePath: string) => {
  const config = vaultService.getActiveConfig()
  if (!config) throw new Error('No active vault')
  const result = await importService.importFolder(
    sourcePath,
    config.localPath,
    config.imageSubfolderName,
    (progress) => event.sender.send(IPC.VAULT.IMPORT_PROGRESS, progress)
  )
  // Rebuild index so new notes are searchable immediately
  await indexService.reindexVault(config.localPath)
  return result
})
```

---

## ImportFolderModal UI

```tsx
// src/renderer/src/components/VaultManager/ImportFolderModal.tsx
export default function ImportFolderModal({ onClose }: { onClose: () => void }) {
  const [sourcePath, setSourcePath] = useState('')
  const [progress, setProgress]     = useState<ImportProgress | null>(null)
  const [result, setResult]         = useState<ImportResult | null>(null)

  useEffect(() => {
    const off = window.api.vault.onImportProgress((p) => setProgress(p))
    return off
  }, [])

  async function handleImport() {
    const result = await window.api.vault.importFolder(sourcePath)
    setResult(result)
  }

  // Progress bar: (progress.done / progress.total) * 100
  // Phase label map: scanning → 'Scanning files…', copying → 'Copying images…',
  //                  rewriting → 'Rewriting links…', indexing → 'Rebuilding index…', done → 'Done!'
}
```

Trigger the modal from:
- VaultManagerScreen (new "Import folder" button next to "Open existing")
- The sidebar's right-click context menu on the vault root (optional)

---

## Preload additions

```typescript
vault: {
  // ...existing...
  importFolder: (sourcePath: string) => Promise<ImportResult>,
  onImportProgress: (cb: (p: ImportProgress) => void) => () => void,
}
```

---

## What gets skipped

| Item | Reason |
|---|---|
| `.obsidian/` directory | Obsidian config, not user data |
| `.git/` directory | Would corrupt MindPalace's own repo |
| Any path starting with `.` | Hidden/config dirs |
| Files > 50 MB | Guard with `statSync(f).size < 50_000_000` |
| Non-image, non-md files (`.pdf`, `.zip`) | Can be opt-in in a future "copy attachments" toggle |

---

## Obsidian link formats handled

| Format | Action |
|---|---|
| `![[image.png]]` | Rewritten to `![](images/image.png)` |
| `![[folder/image.png]]` | Rewritten to `![](folder/image.png)` (path preserved) |
| `[[Note Title]]` | Left as-is (wiki-link to another note, not an image) |
| `![](image.png)` | Prefixed with imageSubfolder if no dir component |
| `![](images/image.png)` | Left as-is (already correct) |
| `![](https://...)` | Left as-is (external URL) |

---

## Reuse Notes
- Run the rewrite pass on `.md` content **after** copying images, so if the
  copy fails the rewrite doesn't create dangling references
- Skip dot-directories (`entry.name.startsWith('.')`) to avoid importing
  `.obsidian`, `.git`, `.DS_Store` etc.
- `cpSync` (Node 16.7+) is synchronous and handles both files and directories;
  for very large vaults consider streaming with `fs.createReadStream`
- After import, call `vaultService.loadNotes()` in the renderer to refresh the
  file tree without requiring an app restart
- Progress events are pushed via `event.sender.send` (not `ipcMain.emit`) so
  they reach only the window that triggered the import
