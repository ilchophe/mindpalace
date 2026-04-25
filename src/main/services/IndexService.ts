import { join, relative } from 'path'
import { readFileSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import type { NoteMetadata, SearchResult } from '../../types'

type BetterSqlite3 = typeof import('better-sqlite3')
type Database = import('better-sqlite3').Database

// Attempt to load the native module; degrade gracefully if unavailable.
let SQLite: BetterSqlite3 | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SQLite = require('better-sqlite3') as BetterSqlite3
} catch {
  console.warn('[IndexService] better-sqlite3 not available — note indexing disabled')
}

// Table schema — body_text added in v2; migration handles existing DBs.
const TABLE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    rel_path    TEXT UNIQUE NOT NULL,
    title       TEXT,
    tags        TEXT DEFAULT '[]',
    aliases     TEXT DEFAULT '[]',
    frontmatter TEXT DEFAULT '{}',
    outlinks    TEXT DEFAULT '[]',
    inlinks     TEXT DEFAULT '[]',
    word_count  INTEGER DEFAULT 0,
    body_text   TEXT DEFAULT '',
    created_at  TEXT,
    modified_at TEXT
  );
`

// FTS5 virtual table + triggers — recreated on schema migration.
const FTS_SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    tags,
    body_text,
    content=notes,
    content_rowid=rowid
  );
  CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, tags, body_text)
      VALUES (new.rowid, new.title, new.tags, new.body_text);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, tags, body_text)
      VALUES ('delete', old.rowid, old.title, old.tags, old.body_text);
    INSERT INTO notes_fts(rowid, title, tags, body_text)
      VALUES (new.rowid, new.title, new.tags, new.body_text);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, tags, body_text)
      VALUES ('delete', old.rowid, old.title, old.tags, old.body_text);
  END;
`

class IndexService {
  private db: Database | null = null
  private vaultPath: string | null = null
  enabled = false

  open(vaultPath: string): void {
    if (!SQLite) return
    this.close()

    const dbDir = join(vaultPath, '.mindpalace')
    mkdirSync(dbDir, { recursive: true })

    try {
      this.db = new SQLite!(join(dbDir, 'index.db'))
      this.db.exec(TABLE_SCHEMA)
      this.migrate()
      this.db.exec(FTS_SCHEMA)
      this.vaultPath = vaultPath
      this.enabled = true
    } catch (err) {
      console.error('[IndexService] Failed to open database:', err)
      this.db = null
      this.enabled = false
    }
  }

  /** Add body_text column to existing vaults, then rebuild FTS index. */
  private migrate(): void {
    if (!this.db) return
    type ColInfo = { name: string }
    const cols = this.db.prepare('PRAGMA table_info(notes)').all() as ColInfo[]
    if (!cols.find((c) => c.name === 'body_text')) {
      this.db.exec(`ALTER TABLE notes ADD COLUMN body_text TEXT DEFAULT ''`)
      this.db.exec(`
        DROP TABLE IF EXISTS notes_fts;
        DROP TRIGGER IF EXISTS notes_ai;
        DROP TRIGGER IF EXISTS notes_au;
        DROP TRIGGER IF EXISTS notes_ad;
      `)
      // FTS_SCHEMA created in open() after migrate() returns
    }
  }

  close(): void {
    try { this.db?.close() } catch { /* ignore */ }
    this.db = null
    this.vaultPath = null
    this.enabled = false
  }

  // ── Indexing ───────────────────────────────────────────────────────────────

  indexFile(absolutePath: string): void {
    if (!this.db || !this.vaultPath) return
    const relPath = relative(this.vaultPath, absolutePath).replace(/\\/g, '/')
    if (!relPath.endsWith('.md')) return

    let content = ''
    try {
      content = readFileSync(absolutePath, 'utf8')
    } catch {
      return
    }

    const id = createHash('sha256').update(relPath).digest('hex').slice(0, 16)
    const title = extractTitle(content, relPath)
    const tags = extractTags(content)
    const outlinks = extractOutlinks(content)
    const bodyText = stripFrontmatter(content)
    const now = new Date().toISOString()
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length

    this.db.prepare(`
      INSERT INTO notes (id, rel_path, title, tags, outlinks, body_text, word_count, created_at, modified_at)
      VALUES (@id, @relPath, @title, @tags, @outlinks, @bodyText, @wordCount, @now, @now)
      ON CONFLICT(rel_path) DO UPDATE SET
        title       = excluded.title,
        tags        = excluded.tags,
        outlinks    = excluded.outlinks,
        body_text   = excluded.body_text,
        word_count  = excluded.word_count,
        modified_at = excluded.modified_at
    `).run({ id, relPath, title, tags: JSON.stringify(tags), outlinks: JSON.stringify(outlinks), bodyText, wordCount, now })
  }

  removeFile(absolutePath: string): void {
    if (!this.db || !this.vaultPath) return
    const relPath = relative(this.vaultPath, absolutePath).replace(/\\/g, '/')
    this.db.prepare('DELETE FROM notes WHERE rel_path = ?').run(relPath)
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  listAll(): NoteMetadata[] {
    if (!this.db) return []
    const rows = this.db.prepare('SELECT * FROM notes ORDER BY modified_at DESC').all() as RawRow[]
    return rows.map(rowToMetadata)
  }

  getByRelPath(relPath: string): NoteMetadata | null {
    if (!this.db) return null
    const row = this.db.prepare('SELECT * FROM notes WHERE rel_path = ?').get(relPath) as RawRow | undefined
    return row ? rowToMetadata(row) : null
  }

  /** FTS5 full-text search with BM25 ranking and body snippet. */
  search(query: string): SearchResult[] {
    if (!this.db || !query.trim()) return []
    // Each token becomes a prefix query (word*) so partial words match.
    const ftsQuery = query
      .trim()
      .split(/\s+/)
      .map((w) => `${w.replace(/[*"]/g, '')}*`)
      .join(' ')
    try {
      const rows = this.db.prepare(`
        SELECT n.id, n.rel_path, n.title,
               snippet(notes_fts, 2, '<mark>', '</mark>', '…', 20) AS snippet,
               bm25(notes_fts) AS score
        FROM notes_fts
        JOIN notes n ON n.rowid = notes_fts.rowid
        WHERE notes_fts MATCH ?
        ORDER BY bm25(notes_fts)
        LIMIT 50
      `).all(ftsQuery) as Array<{ id: string; rel_path: string; title: string; snippet: string; score: number }>
      return rows.map((r) => ({
        id: r.id,
        relativePath: r.rel_path,
        title: r.title,
        snippet: r.snippet ?? '',
        score: r.score
      }))
    } catch {
      return []
    }
  }

  /**
   * Returns rel paths of notes whose outlinks reference the given note.
   * Matches both full rel path ("folder/note.md") and bare stem ("note").
   */
  getBacklinks(relPath: string): string[] {
    if (!this.db) return []
    const stem = relPath.replace(/\.md$/, '').split('/').pop() ?? relPath
    const rows = this.db.prepare(`
      SELECT DISTINCT n.rel_path
      FROM notes n, json_each(n.outlinks) j
      WHERE j.value = ? OR j.value = ?
    `).all(relPath, stem) as Array<{ rel_path: string }>
    return rows.map((r) => r.rel_path)
  }

  /** All unique tags across the vault, sorted alphabetically. */
  getAllTags(): string[] {
    if (!this.db) return []
    const rows = this.db.prepare(`
      SELECT DISTINCT j.value
      FROM notes n, json_each(n.tags) j
      WHERE j.value != ''
      ORDER BY j.value
    `).all() as Array<{ value: string }>
    return rows.map((r) => r.value)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawRow {
  id: string
  rel_path: string
  title: string
  tags: string
  aliases: string
  frontmatter: string
  outlinks: string
  inlinks: string
  word_count: number
  body_text: string
  created_at: string
  modified_at: string
}

function rowToMetadata(row: RawRow): NoteMetadata {
  return {
    id: row.id,
    relativePath: row.rel_path,
    title: row.title,
    tags: JSON.parse(row.tags || '[]'),
    aliases: JSON.parse(row.aliases || '[]'),
    frontmatter: JSON.parse(row.frontmatter || '{}'),
    outlinks: JSON.parse(row.outlinks || '[]'),
    inlinks: JSON.parse(row.inlinks || '[]'),
    wordCount: row.word_count,
    createdAt: row.created_at,
    modifiedAt: row.modified_at
  }
}

function extractTitle(content: string, relPath: string): string {
  const h1 = content.match(/^#\s+(.+)/m)
  if (h1) return h1[1].trim()
  return relPath.split('/').pop()?.replace(/\.md$/, '') ?? relPath
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
}

function extractTags(content: string): string[] {
  const tags: string[] = []
  const fm = content.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const tagLine = fm[1].match(/^tags:\s*\[([^\]]*)\]/m)
    if (tagLine) {
      tags.push(...tagLine[1].split(',').map((t) => t.trim().replace(/['"]/g, '')))
    }
    const tagBlock = fm[1].match(/^tags:\s*\n((?:\s+-\s*.+\n?)+)/m)
    if (tagBlock) {
      tags.push(
        ...tagBlock[1]
          .split('\n')
          .map((l) => l.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean)
      )
    }
  }
  const inline = content.matchAll(/#([\w/-]+)/g)
  for (const m of inline) tags.push(m[1])
  return [...new Set(tags)]
}

/** Extract [[wiki-link]] targets from content. */
function extractOutlinks(content: string): string[] {
  const links: string[] = []
  const re = /\[\[([^\]|#\n]+)(?:[|#][^\]]*)?]]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim())
  }
  return [...new Set(links)]
}

export const indexService = new IndexService()
