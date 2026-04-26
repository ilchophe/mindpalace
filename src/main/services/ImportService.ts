import { cpSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, relative, extname, dirname, basename } from 'path'
import type { ImportProgress, ImportResult } from '../../types'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])
const MD_EXT = '.md'
const MAX_FILE_SIZE = 50_000_000 // 50 MB

class ImportService {
  async importFolder(
    sourcePath: string,
    vaultPath: string,
    imageSubfolder: string,
    onProgress: (p: ImportProgress) => void
  ): Promise<ImportResult> {
    // 1. Scan
    onProgress({ phase: 'scanning', total: 0, done: 0, currentFile: '' })
    const allFiles = this.walkDir(sourcePath)
    const mdFiles = allFiles.filter((f) => extname(f).toLowerCase() === MD_EXT)
    const imgFiles = allFiles.filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
    const total = mdFiles.length + imgFiles.length
    let done = 0

    const result: ImportResult = {
      notesImported: 0,
      imagesImported: 0,
      referencesRewritten: 0,
      errors: []
    }

    // 2. Build a map of image basename → vault-relative-path (before copying).
    //    Obsidian's ![[img.png]] is resolved by global filename search, so we
    //    replicate that: first match wins when basenames collide.
    const imageMap = new Map<string, string>()
    for (const imgAbs of imgFiles) {
      const rel = relative(sourcePath, imgAbs).replace(/\\/g, '/')
      const base = basename(imgAbs)
      if (!imageMap.has(base)) imageMap.set(base, rel)
    }

    // 3. Copy images (preserving subfolder structure under source root)
    onProgress({ phase: 'copying', total, done, currentFile: '' })
    for (const imgAbs of imgFiles) {
      try {
        const size = statSync(imgAbs).size
        if (size > MAX_FILE_SIZE) {
          result.errors.push(`skip (>50 MB): ${imgAbs}`)
          onProgress({ phase: 'copying', total, done: ++done, currentFile: basename(imgAbs) })
          continue
        }
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

    // 4. Copy + rewrite .md files
    onProgress({ phase: 'rewriting', total, done, currentFile: '' })
    for (const mdAbs of mdFiles) {
      try {
        const rel = relative(sourcePath, mdAbs).replace(/\\/g, '/')
        const dest = join(vaultPath, rel)
        mkdirSync(dirname(dest), { recursive: true })
        const content = readFileSync(mdAbs, 'utf8')
        const { content: rewritten, count } = this.rewriteObsidianEmbeds(
          content,
          rel,
          imageSubfolder,
          imageMap
        )
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

  /** Walk directory recursively, returning absolute paths of all files. Skips dot-directories. */
  private walkDir(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...this.walkDir(full))
      } else {
        results.push(full)
      }
    }
    return results
  }

  /**
   * Compute a path from noteRelPath's directory to imgVaultRelPath.
   *
   * Examples:
   *   note "notes/arch.md", img "images/photo.png"  → "../images/photo.png"
   *   note "arch.md",        img "images/photo.png"  → "images/photo.png"
   *   note "a/b/note.md",   img "photo.png"          → "../../photo.png"
   */
  private relativeToNote(noteRelPath: string, imgVaultRelPath: string): string {
    const noteDepth = noteRelPath.split('/').length - 1 // number of directory segments
    const prefix = '../'.repeat(noteDepth)
    return prefix + imgVaultRelPath
  }

  /**
   * Rewrite Obsidian wiki-link image embeds to standard Markdown img tags.
   * Uses imageMap (basename → vault-relative-path) to resolve Obsidian's global
   * filename search behaviour, then computes the correct relative path from the
   * note's location.
   */
  rewriteObsidianEmbeds(
    content: string,
    noteRelPath: string,
    imageSubfolder: string,
    imageMap?: Map<string, string>
  ): { content: string; count: number } {
    let count = 0

    // Pass 1: ![[...]] Obsidian wiki-link embeds
    const pass1 = content.replace(/!\[\[([^\]]+)\]\]/g, (_match, target: string) => {
      const trimmed = target.trim()
      const ext = extname(trimmed).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) return _match // wiki-link to another note — leave alone

      let vaultRelPath: string
      if (!trimmed.includes('/') && imageMap?.has(trimmed)) {
        // Use the actual vault-relative path from the scan map
        vaultRelPath = imageMap.get(trimmed)!
      } else if (trimmed.includes('/')) {
        // Already has a path — treat as vault-relative
        vaultRelPath = trimmed
      } else {
        // Fallback: assume imageSubfolder
        vaultRelPath = `${imageSubfolder}/${trimmed}`
      }

      count++
      return `![](${this.relativeToNote(noteRelPath, vaultRelPath)})`
    })

    // Pass 2: bare ![](img.png) references without any directory component
    // (Obsidian sometimes writes these when attachments are at vault root)
    const pass2 = pass1.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt: string, src: string) => {
        if (src.startsWith('http') || src.startsWith('/') || src.includes('/')) return _match
        const ext = extname(src).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) return _match

        let vaultRelPath: string
        if (imageMap?.has(src)) {
          vaultRelPath = imageMap.get(src)!
        } else {
          vaultRelPath = `${imageSubfolder}/${src}`
        }

        count++
        return `![${alt}](${this.relativeToNote(noteRelPath, vaultRelPath)})`
      }
    )

    return { content: pass2, count }
  }
}

export const importService = new ImportService()
