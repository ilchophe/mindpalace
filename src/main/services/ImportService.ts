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

    // 2. Copy images (preserving subfolder structure under source root)
    onProgress({ phase: 'copying', total, done, currentFile: '' })
    for (const imgAbs of imgFiles) {
      try {
        // Guard against very large files
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

    // 3. Copy + rewrite .md files
    onProgress({ phase: 'rewriting', total, done, currentFile: '' })
    for (const mdAbs of mdFiles) {
      try {
        const rel = relative(sourcePath, mdAbs)
        const dest = join(vaultPath, rel)
        mkdirSync(dirname(dest), { recursive: true })
        const content = readFileSync(mdAbs, 'utf8')
        const { content: rewritten, count } = this.rewriteObsidianEmbeds(
          content,
          rel,
          imageSubfolder
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
      if (entry.name.startsWith('.')) continue // skip .obsidian, .git, .DS_Store etc.
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
   * Rewrite Obsidian wiki-link image embeds to standard Markdown img tags.
   *
   * ![[image.png]]        → ![](images/image.png)   (imageSubfolder prepended)
   * ![[sub/image.png]]    → ![](sub/image.png)       (path preserved)
   * [[Note Title]]        → unchanged                (wiki-link to another note)
   * ![](image.png)        → ![](images/image.png)    (bare ref, no dir component)
   * ![](images/img.png)   → unchanged                (already correct)
   * ![](https://...)      → unchanged                (external URL)
   */
  rewriteObsidianEmbeds(
    content: string,
    _noteRelPath: string,
    imageSubfolder: string
  ): { content: string; count: number } {
    let count = 0

    // Pass 1: ![[...]] wiki-link embeds
    const pass1 = content.replace(/!\[\[([^\]]+)\]\]/g, (_match, target: string) => {
      const trimmed = target.trim()
      const ext = extname(trimmed).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) return _match // wiki-link to another note — leave alone
      // If the source already has a path separator, trust it
      const imgPath = trimmed.includes('/') ? trimmed : `${imageSubfolder}/${trimmed}`
      count++
      return `![](${imgPath})`
    })

    // Pass 2: bare ![](img.png) references without a directory component
    const pass2 = pass1.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt: string, src: string) => {
        if (src.startsWith('http') || src.startsWith('/') || src.includes('/')) return _match
        const ext = extname(src).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) return _match
        count++
        return `![${alt}](${imageSubfolder}/${src})`
      }
    )

    return { content: pass2, count }
  }
}

export const importService = new ImportService()
