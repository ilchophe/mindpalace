import { join, relative } from 'path'
import { readFileSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import type { NoteMetadata } from '../../types'

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

const SCHEMA = `
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
    created_at  TEXT,
    modified_at TEXT
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    tags,
    content=notes,
    content_rowid=rowid
  );
  CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, tags) VALUES (new.rowid, new.title, new.tags);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, tags) VALUES ('delete', old.rowid, old.title, old.tags);
    INSERT INTO notes_fts(rowid, title, tags) VALUES (new.rowid, new.title, new.tags);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, tags) VALUES ('delete', old.rowid, old.title, old.tags);
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
      this.db.exec(SCHEMA)
      this.vaultPath = vaultPath
      this.enabled = true
    } catch (err) {
      console.error('[IndexService] Failed to open database:', err)
      this.db = null
      this.enabled = false
    }
  }

  close(): void {
    try {
      this.db?.close()
    } catch {
      // ignore
    }
    this.db = null
    this.vaultPath = null
    this.enabled = false
  }

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
    const now = new Date().toISOString()
    const wordCount = content.split(/\s+/).filter(Boolean).length

    this.db.prepare(`
      INSERT INTO notes (id, rel_path, title, tags, word_count, created_at, modified_at)
      VALUES (@id, @relPath, @title, @tags, @wordCount, @now, @now)
      ON CONFLICT(rel_path) DO UPDATE SET
        title = excluded.title,
        tags  = excluded.tags,
        word_count = excluded.word_count,
        modified_at = excluded.modified_at
    `).run({ id, relPath, title, tags: JSON.stringify(tags), wordCount, now })
  }

  removeFile(absolutePath: string): void {
    if (!this.db || !this.vaultPath) return
    const relPath = relative(this.vaultPath, absolutePath).replace(/\\/g, '/')
    this.db.prepare('DELETE FROM notes WHERE rel_path = ?').run(relPath)
  }

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
  const filename = relPath.split('/').pop()?.replace(/\.md$/, '') ?? relPath
  return filename
}

function extractTags(content: string): string[] {
  const tags: string[] = []
  // YAML frontmatter tags
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
  // Inline #tags
  const inline = content.matchAll(/#([\w/-]+)/g)
  for (const m of inline) tags.push(m[1])
  return [...new Set(tags)]
}

export const indexService = new IndexService()
