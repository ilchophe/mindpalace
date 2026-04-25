# skill: sqlite-fts5-search

## Purpose
Full-text search over a `better-sqlite3` database using an FTS5 content table with BM25 ranking, body snippet extraction, backlink queries via `json_each`, and incremental schema migration for existing vaults.

## Key Files
| File | Role |
|---|---|
| `src/main/services/IndexService.ts` | FTS5 schema, migration, search(), getBacklinks(), getAllTags() |
| `src/main/services/SearchService.ts` | Thin wrapper: search, reindexVault, getAllTags, getBacklinks |
| `src/main/ipc/search.ts` | IPC handlers for search:* channels |
| `src/renderer/src/components/Search/QuickSwitcher.tsx` | Ctrl+P modal with debounced FTS search |
| `src/renderer/src/components/Search/BacklinksPanel.tsx` | Inline backlinks panel for current note |

## FTS5 Schema Pattern
```sql
-- Content table (notes) + FTS5 virtual table wired via content= + triggers
CREATE TABLE notes (
  id TEXT PRIMARY KEY, rel_path TEXT UNIQUE NOT NULL,
  title TEXT, tags TEXT DEFAULT '[]', body_text TEXT DEFAULT '', ...
);
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, tags, body_text,
  content=notes, content_rowid=rowid
);
-- Three triggers keep FTS in sync with the content table
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, tags, body_text)
    VALUES (new.rowid, new.title, new.tags, new.body_text);
END;
CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, tags, body_text)
    VALUES ('delete', old.rowid, old.title, old.tags, old.body_text);
  INSERT INTO notes_fts(rowid, title, tags, body_text)
    VALUES (new.rowid, new.title, new.tags, new.body_text);
END;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, tags, body_text)
    VALUES ('delete', old.rowid, old.title, old.tags, old.body_text);
END;
```

## Schema Migration Pattern
```typescript
// In open(), after CREATE TABLE IF NOT EXISTS:
private migrate(): void {
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
    // FTS_SCHEMA is applied after migrate() returns in open()
  }
}
// After migration: INSERT INTO notes_fts(notes_fts) VALUES('rebuild')
// is handled automatically by the content= link; the triggers refire on next write.
```

## FTS5 Search with BM25 + Snippet
```typescript
search(query: string): SearchResult[] {
  // Prefix query: each word becomes word*
  const ftsQuery = query.trim().split(/\s+/).map(w => `${w}*`).join(' ')
  const rows = this.db.prepare(`
    SELECT n.id, n.rel_path, n.title,
           snippet(notes_fts, 2, '<mark>', '</mark>', '…', 20) AS snippet,
           bm25(notes_fts) AS score
    FROM notes_fts
    JOIN notes n ON n.rowid = notes_fts.rowid
    WHERE notes_fts MATCH ?
    ORDER BY bm25(notes_fts)   -- bm25 returns negative values; lower = better
    LIMIT 50
  `).all(ftsQuery)
}
```

## Backlinks via json_each
```sql
-- Notes whose outlinks reference the given path or stem
SELECT DISTINCT n.rel_path
FROM notes n, json_each(n.outlinks) j
WHERE j.value = ? OR j.value = ?   -- full relPath or bare stem
```

## Tags Query
```sql
SELECT DISTINCT j.value
FROM notes n, json_each(n.tags) j
WHERE j.value != ''
ORDER BY j.value
```

## Wiki-link Extraction (outlinks)
```typescript
function extractOutlinks(content: string): string[] {
  const re = /\[\[([^\]|#\n]+)(?:[|#][^\]]*)?]]/g
  // Captures link target before any | (display) or # (heading anchor)
}
```

## Reuse Notes
- `better-sqlite3` must run in **main process only** — never bundle in renderer
- FTS5 `content=` tables don't store data directly; `content_rowid=rowid` links back to the real table
- `bm25()` returns negative values: ORDER BY `bm25(notes_fts)` ASC gives best matches first
- `snippet()` args: `(table, column_index, start_tag, end_tag, ellipsis, num_tokens)`; column index 2 = `body_text`
- Sanitize user FTS query input — strip `*` and `"` to prevent FTS5 syntax errors, then append `*` yourself
- `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')` forces full FTS re-index from the content table
