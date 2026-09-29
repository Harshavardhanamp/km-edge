# Design: Local Storage + Delta Log

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Requirement:** REQ-0005  
**Related ADRs:** ADR-0009, ADR-0010

---

## Technology

- **Database:** `expo-sqlite` — single `.db` file in app documents directory
- **Blobs:** `expo-file-system` — content-addressed directory in app documents
- **Migrations:** sequential versioned scripts, run on app launch

---

## Database File

Single file: `<app_documents>/km-edge.db`  
All tables in one file — guarantees atomic transactions across records + delta log.

---

## Schema

### Table: `records`

```sql
CREATE TABLE records (
  edge_id       TEXT PRIMARY KEY,           -- UUID v7
  gks_id        TEXT,                       -- null until synced
  schema_version INTEGER NOT NULL DEFAULT 1,
  type          TEXT NOT NULL,              -- GKS canonical type
  capture_kind  TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',   -- Markdown body
  created       TEXT NOT NULL,              -- ISO date YYYY-MM-DD
  author        TEXT NOT NULL DEFAULT 'human',
  classification TEXT NOT NULL DEFAULT 'NORMAL',
  importance    TEXT NOT NULL DEFAULT 'NORMAL',
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON array
  life_areas    TEXT NOT NULL DEFAULT '[]', -- JSON array
  place         TEXT,                       -- JSON object or null
  about         TEXT NOT NULL DEFAULT '[]', -- JSON array of edge_id/gks_id
  relationships TEXT NOT NULL DEFAULT '[]', -- JSON array
  captured_at   TEXT NOT NULL,              -- ISO8601 full timestamp
  updated_at    TEXT,                       -- ISO8601, null if never edited
  is_deleted    INTEGER NOT NULL DEFAULT 0, -- soft delete flag
  deleted_at    TEXT,                       -- ISO8601, null if not deleted
  sync_status   TEXT NOT NULL DEFAULT 'PENDING',
  content_sha256 TEXT NOT NULL
);

CREATE INDEX idx_records_captured_at ON records(captured_at DESC)
  WHERE is_deleted = 0;
CREATE INDEX idx_records_sync_status ON records(sync_status)
  WHERE is_deleted = 0;
```

JSON columns (`tags`, `life_areas`, `place`, `about`, `relationships`) stored as JSON strings — parsed in application layer, not DB layer. Keeps schema simple, avoids separate junction tables for list fields.

---

### Table: `delta_log`

```sql
CREATE TABLE delta_log (
  seq               INTEGER PRIMARY KEY AUTOINCREMENT,
  edge_id           TEXT NOT NULL,
  operation         TEXT NOT NULL,          -- CREATE | UPDATE | DELETE
  record_type       TEXT NOT NULL,
  capture_kind      TEXT NOT NULL,
  timestamp         TEXT NOT NULL,          -- ISO8601
  content_sha256    TEXT,                   -- null for DELETE
  attachment_edge_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
  status            TEXT NOT NULL DEFAULT 'PENDING',
  gks_id            TEXT,                   -- filled by V2 sync on ACKNOWLEDGED
  gks_acknowledged_at TEXT,
  gks_error         TEXT,
  retry_count       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_delta_pending ON delta_log(seq)
  WHERE status = 'PENDING';
```

`seq`, `edge_id`, `operation`, `timestamp`, `content_sha256` are write-once.  
`status`, `gks_id`, `gks_acknowledged_at`, `gks_error`, `retry_count` updated by V2 sync only.

---

### Table: `attachments`

```sql
CREATE TABLE attachments (
  edge_attachment_id TEXT PRIMARY KEY,      -- UUID v7
  sha256             TEXT NOT NULL UNIQUE,  -- content-addressed dedup key
  original_filename  TEXT NOT NULL,
  mime_type          TEXT NOT NULL,
  size_bytes         INTEGER NOT NULL,
  blob_path          TEXT NOT NULL,         -- relative path in app documents
  captured_at        TEXT NOT NULL,
  gks_attachment_id  TEXT                   -- null until synced
);
```

`sha256 UNIQUE` enforces content-addressed deduplication — identical files share one blob on disk.

---

### Table: `record_attachments`

```sql
CREATE TABLE record_attachments (
  edge_id            TEXT NOT NULL REFERENCES records(edge_id),
  edge_attachment_id TEXT NOT NULL REFERENCES attachments(edge_attachment_id),
  PRIMARY KEY (edge_id, edge_attachment_id)
);
```

Many-to-many join. One attachment blob can be linked to multiple records.

---

### Table: `schema_migrations`

```sql
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

Tracks which migrations have run. On app launch, compare current version against applied migrations and run any pending scripts in order.

---

## Attachment Blob Layout

```
<app_documents>/
  km-edge.db
  attachments/
    <sha256[:2]>/
      <sha256>        ← raw blob, no extension
```

Content-addressed: path derived from sha256. Identical files (same sha256) occupy one blob regardless of how many records reference it.

---

## Write Pattern (atomic)

Every record mutation follows this pattern inside a single SQLite transaction:

```
BEGIN TRANSACTION
  1. Write / update record in `records` table
  2. Compute content_sha256 of serialised record
  3. Append entry to `delta_log` table
COMMIT
```

If the transaction fails at any point, both the record write and the delta entry are rolled back. No partial state ever exists.

---

## Migration Strategy

- Migrations live in `src/lib/migrations/` as numbered TypeScript files: `001_initial.ts`, `002_add_field.ts`, etc.
- On app launch, `runMigrations()` reads `schema_migrations`, finds unapplied versions, runs them in order
- Each migration is a function receiving the SQLite db handle and executing SQL statements
- Migrations are never modified after release — only new ones added

---

## Key Queries (TypeScript layer)

```typescript
// Home screen recent
SELECT * FROM records
WHERE is_deleted = 0
ORDER BY captured_at DESC
LIMIT 5;

// All records (paginated)
SELECT * FROM records
WHERE is_deleted = 0
ORDER BY captured_at DESC
LIMIT ? OFFSET ?;

// V2 sync: pending delta entries
SELECT * FROM delta_log
WHERE status = 'PENDING'
ORDER BY seq ASC;
```

---

## V2 Sync Readiness

- Delta log is written in V1 for every CREATE, UPDATE, DELETE
- When V2 sync runs, it reads all `PENDING` delta entries in `seq` order and transmits them to GKS
- Soft-deleted records are purged from SQLite only after their DELETE delta entry is `ACKNOWLEDGED` by GKS
- No schema changes needed in V2 for the storage layer — sync reads what V1 already writes
