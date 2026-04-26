import { ipcMain, shell, dialog } from 'electron'
import { readdirSync, statSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'fs'
import { join, relative, extname, dirname } from 'path'
import { IPC } from '../../types'
import type { NoteMetadata } from '../../types'
import { vaultService } from '../services/VaultService'
import { indexService } from '../services/IndexService'
import { syncService } from '../services/SyncService'
import { imageService } from '../services/ImageService'
import { createHash } from 'crypto'

function requireVaultPath(): string {
  const config = vaultService.getActiveConfig()
  if (!config) throw new Error('No vault is currently open')
  return config.localPath
}


function fileId(relPath: string): string {
  return createHash('sha256').update(relPath).digest('hex').slice(0, 16)
}

function titleFromPath(relPath: string): string {
  return relPath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? relPath
}

const ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp',
  '.pdf', '.zip', '.csv', '.xlsx', '.docx', '.mp4', '.mp3'
])

/** Walk a directory recursively and collect non-md asset file paths. */
function walkAssets(dir: string, vaultPath: string): string[] {
  const results: string[] = []
  let names: string[]
  try { names = readdirSync(dir) } catch { return results }
  for (const name of names) {
    if (name.startsWith('.')) continue
    const abs = join(dir, name)
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) {
      results.push(...walkAssets(abs, vaultPath))
    } else if (st.isFile() && ASSET_EXTS.has(extname(name).toLowerCase())) {
      results.push(relative(vaultPath, abs).replace(/\\/g, '/'))
    }
  }
  return results
}

/** Walk a directory recursively and collect .md file metadata from filesystem. */
function walkMdFiles(dir: string, vaultPath: string): NoteMetadata[] {
  const results: NoteMetadata[] = []
  let names: string[]
  try {
    names = readdirSync(dir) as string[]
  } catch {
    return results
  }

  for (const name of names) {
    if (name.startsWith('.')) continue
    const abs = join(dir, name)
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) {
      results.push(...walkMdFiles(abs, vaultPath))
    } else if (st.isFile() && extname(name) === '.md') {
      const relPath = relative(vaultPath, abs).replace(/\\/g, '/')
      results.push({
        id: fileId(relPath),
        relativePath: relPath,
        title: titleFromPath(relPath),
        tags: [],
        aliases: [],
        frontmatter: {},
        outlinks: [],
        inlinks: [],
        wordCount: 0,
        createdAt: st.birthtime.toISOString(),
        modifiedAt: st.mtime.toISOString()
      })
    }
  }
  return results
}

/**
 * Scan every .md file in the vault and rewrite any markdown link or image embed
 * that points to `oldRelPath` so it points to `newRelPath` instead.
 * Paths in markdown are relative to the note's directory, so we resolve each
 * href to an absolute path before comparing.
 */
function rewriteReferencesInVault(
  vaultPath: string,
  oldRelPath: string,
  newRelPath: string,
): void {
  const oldAbs = join(vaultPath, oldRelPath)
  const newAbs = join(vaultPath, newRelPath)
  const notes = walkMdFiles(vaultPath, vaultPath)

  for (const note of notes) {
    // Skip the file that was just renamed (already handled by the caller)
    const noteAbs = join(vaultPath, note.relativePath)
    if (noteAbs === newAbs) continue

    let content: string
    try { content = readFileSync(noteAbs, 'utf8') } catch { continue }

    const noteDir = dirname(noteAbs)
    let changed = false

    const updated = content.replace(
      /(!?\[[^\]]*\])\(([^)]+)\)/g,
      (match, prefix, href) => {
        if (/^https?:\/\/|^vault-file:/.test(href)) return match
        // Decode percent-encoded chars (e.g. %20 → space) before resolving
        const decoded = href.includes('%') ? decodeURIComponent(href) : href
        const resolvedAbs = join(noteDir, decoded)
        if (resolvedAbs !== oldAbs) return match
        // Compute new relative path and normalise to forward slashes
        const newHref = relative(noteDir, newAbs).replace(/\\/g, '/')
        changed = true
        return `${prefix}(${newHref})`
      }
    )

    if (changed) {
      try {
        writeFileSync(noteAbs, updated, 'utf8')
        indexService.indexFile(noteAbs)
      } catch { /* ignore */ }
    }
  }
}

export function registerNotesHandlers(): void {
  ipcMain.handle(IPC.NOTES.LIST, () => {
    const vaultPath = requireVaultPath()
    if (indexService.enabled) return indexService.listAll()
    return walkMdFiles(vaultPath, vaultPath)
  })

  ipcMain.handle(IPC.NOTES.LIST_ASSETS, () => {
    const vaultPath = requireVaultPath()
    return walkAssets(vaultPath, vaultPath)
  })

  ipcMain.handle(IPC.NOTES.READ, (_e, relPath: string) => {
    const vaultPath = requireVaultPath()
    return readFileSync(join(vaultPath, relPath), 'utf8')
  })

  ipcMain.handle(IPC.NOTES.WRITE, (_e, relPath: string, content: string) => {
    const config = vaultService.getActiveConfig()
    if (!config) throw new Error('No vault is currently open')
    const abs = join(config.localPath, relPath)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
    indexService.indexFile(abs)
    syncService.scheduleSyncAfterSave(config)
  })

  ipcMain.handle(IPC.NOTES.RENAME, (_e, oldRelPath: string, newRelPath: string) => {
    const vaultPath = requireVaultPath()
    const oldAbs = join(vaultPath, oldRelPath)
    const newAbs = join(vaultPath, newRelPath)
    mkdirSync(dirname(newAbs), { recursive: true })
    const isDir = statSync(oldAbs).isDirectory()
    renameSync(oldAbs, newAbs)
    if (isDir) {
      // Chokidar will fire add/unlink for every file inside — index updates automatically
      return
    }
    // 1. Rewrite image embed paths inside the renamed note itself (if it's a .md)
    try {
      const content = readFileSync(newAbs, 'utf8')
      if (content.includes('![')) {
        const rewritten = imageService.rewritePaths(oldRelPath, newRelPath, content)
        if (rewritten !== content) writeFileSync(newAbs, rewritten, 'utf8')
      }
    } catch { /* ignore */ }
    // 2. Update every other .md file that links to the renamed file
    rewriteReferencesInVault(vaultPath, oldRelPath, newRelPath)
    indexService.removeFile(oldAbs)
    indexService.indexFile(newAbs)
  })

  ipcMain.handle(IPC.NOTES.DELETE, (_e, relPath: string) => {
    const vaultPath = requireVaultPath()
    const abs = join(vaultPath, relPath)
    const isDir = statSync(abs).isDirectory()
    if (isDir) {
      rmSync(abs, { recursive: true })
      // chokidar fires file-deleted events for contents — index updates automatically
    } else {
      rmSync(abs)
      indexService.removeFile(abs)
    }
  })

  ipcMain.handle(IPC.NOTES.SHOW_IN_EXPLORER, (_e, relPath: string) => {
    const vaultPath = requireVaultPath()
    const abs = join(vaultPath, relPath)
    shell.showItemInFolder(abs)
  })

  // Native confirmation dialog (window.confirm is blocked in Electron)
  ipcMain.handle(IPC.NOTES.CONFIRM, (_e, message: string) => {
    const result = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      message,
    })
    return result === 1  // true = user chose "Delete"
  })

  ipcMain.handle(IPC.NOTES.CREATE_FOLDER, (_e, relPath: string) => {
    const vaultPath = requireVaultPath()
    mkdirSync(join(vaultPath, relPath), { recursive: true })
  })

  ipcMain.handle(IPC.NOTES.GET_BACKLINKS, (_e, relPath: string) => {
    if (indexService.enabled) return indexService.getBacklinks(relPath)
    return []
  })

  ipcMain.handle(IPC.NOTES.RESOLVE_WIKI_LINK, (_e, link: string) => {
    if (indexService.enabled) {
      const all = indexService.listAll()
      const match = all.find(
        (n) => n.title.toLowerCase() === link.toLowerCase() || n.relativePath.includes(link)
      )
      return match?.relativePath ?? null
    }
    return null
  })
}
