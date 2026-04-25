import { join } from 'path'
import { readdirSync, statSync, existsSync } from 'fs'
import { indexService } from './IndexService'
import type { SearchResult } from '../../types'

class SearchService {
  /** FTS5 full-text search. Returns ranked results with body snippets. */
  search(query: string): SearchResult[] {
    return indexService.search(query)
  }

  /** Walk all .md files in vaultPath and re-index them. */
  reindexVault(vaultPath: string): void {
    if (!indexService.enabled) return
    walkMd(vaultPath).forEach((abs) => indexService.indexFile(abs))
  }

  /** All unique tags in the current vault. */
  getAllTags(): string[] {
    return indexService.getAllTags()
  }

  /** Rel paths of notes whose outlinks point to the given note. */
  getBacklinks(relPath: string): string[] {
    return indexService.getBacklinks(relPath)
  }
}

function walkMd(dir: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const abs = join(dir, name)
    try {
      const st = statSync(abs)
      if (st.isDirectory()) results.push(...walkMd(abs))
      else if (st.isFile() && name.endsWith('.md')) results.push(abs)
    } catch { /* skip inaccessible entries */ }
  }
  return results
}

export const searchService = new SearchService()
