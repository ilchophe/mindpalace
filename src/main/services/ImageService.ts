import { join, dirname, relative, basename, extname } from 'path'
import { writeFileSync, mkdirSync, copyFileSync } from 'fs'
import type { VaultConfig } from '../../types'
import { vaultService } from './VaultService'

function targetDir(vaultPath: string, config: VaultConfig, noteRelPath: string): string {
  const noteDir = join(vaultPath, dirname(noteRelPath))
  switch (config.imageStorageMode) {
    case 'same-folder':
      return noteDir
    case 'subfolder':
      return join(noteDir, config.imageSubfolderName)
    case 'global':
      return join(vaultPath, config.globalImagePath)
  }
}

function embedPath(vaultPath: string, noteRelPath: string, imageAbsPath: string): string {
  const noteAbsDir = join(vaultPath, dirname(noteRelPath))
  return relative(noteAbsDir, imageAbsPath).replace(/\\/g, '/')
}

function extForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  }
  return map[mime] ?? '.png'
}

class ImageService {
  /** Save a base64-encoded image next to (or under) the given note. Returns the embed-relative path. */
  paste(noteRelPath: string, base64Data: string, mimeType: string): string {
    const config = vaultService.getActiveConfig()
    if (!config) throw new Error('No vault open')

    const ext = extForMime(mimeType)
    const fileName = `img-${Date.now()}${ext}`
    const dir = targetDir(config.localPath, config, noteRelPath)
    mkdirSync(dir, { recursive: true })
    const absPath = join(dir, fileName)
    writeFileSync(absPath, Buffer.from(base64Data, 'base64'))
    return embedPath(config.localPath, noteRelPath, absPath)
  }

  /** Copy an image file from an arbitrary source path into the vault. Returns the embed-relative path. */
  importFile(noteRelPath: string, sourcePath: string): string {
    const config = vaultService.getActiveConfig()
    if (!config) throw new Error('No vault open')

    const ext = extname(sourcePath)
    const stem = basename(sourcePath, ext)
    const fileName = `${stem}-${Date.now()}${ext}`
    const dir = targetDir(config.localPath, config, noteRelPath)
    mkdirSync(dir, { recursive: true })
    const absPath = join(dir, fileName)
    copyFileSync(sourcePath, absPath)
    return embedPath(config.localPath, noteRelPath, absPath)
  }

  /**
   * Rewrite all `![alt](path)` embeds in `content` after a note is moved from
   * `oldRelPath` to `newRelPath`. Image files are not moved — only the relative
   * path strings in the markdown change.
   */
  rewritePaths(oldRelPath: string, newRelPath: string, content: string): string {
    const config = vaultService.getActiveConfig()
    if (!config) throw new Error('No vault open')

    const { localPath } = config
    const oldDir = join(localPath, dirname(oldRelPath))
    const newDir = join(localPath, dirname(newRelPath))

    return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, imgPath) => {
      if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
        return `![${alt}](${imgPath})`
      }
      const absImg = join(oldDir, imgPath)
      const newRel = relative(newDir, absImg).replace(/\\/g, '/')
      return `![${alt}](${newRel})`
    })
  }

  getMode(): string {
    return vaultService.getActiveConfig()?.imageStorageMode ?? 'subfolder'
  }
}

export const imageService = new ImageService()
