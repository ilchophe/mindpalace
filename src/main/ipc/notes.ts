import { ipcMain } from 'electron'
import { readdirSync, statSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'fs'
import { join, relative, extname, dirname } from 'path'
import { IPC } from '../../types'
import type { NoteMetadata } from '../../types'
import { vaultService } from '../services/VaultService'
import { indexService } from '../services/IndexService'
import { syncService } from '../services/SyncService'
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

export function registerNotesHandlers(): void {
  ipcMain.handle(IPC.NOTES.LIST, () => {
    const vaultPath = requireVaultPath()
    if (indexService.enabled) return indexService.listAll()
    return walkMdFiles(vaultPath, vaultPath)
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
    mkdirSync(require('path').dirname(newAbs), { recursive: true })
    renameSync(oldAbs, newAbs)
    indexService.removeFile(oldAbs)
    indexService.indexFile(newAbs)
  })

  ipcMain.handle(IPC.NOTES.DELETE, (_e, relPath: string) => {
    const vaultPath = requireVaultPath()
    const abs = join(vaultPath, relPath)
    rmSync(abs)
    indexService.removeFile(abs)
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
