# Implementation Plan: Local Storage + Delta Log

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0005  
**Design:** local-storage.md  
**ADRs:** ADR-0009, ADR-0010

---

## Prerequisites

- [ ] `expo-sqlite` — already in Expo SDK 57, no install needed
- [ ] `expo-file-system` — already in Expo SDK 57, no install needed
- [ ] `expo-crypto` — for SHA-256 computation (already in Expo SDK 57)

---

## Steps

### Step 1 — Migration runner (`src/lib/db/migrations.ts`)
- `runMigrations(db)` — reads `schema_migrations`, runs pending scripts in order
- Called once on app launch before any other DB access
- Each migration is a numbered function in `src/lib/db/migrations/`

### Step 2 — Initial migration (`src/lib/db/migrations/001_initial.ts`)
Creates all four tables: `records`, `delta_log`, `attachments`, `record_attachments`, `schema_migrations`.
All indexes included. This is the V1 schema — no changes after release without a new migration.

### Step 3 — Database initialiser (`src/lib/db/index.ts`)
- Opens `km-edge.db` via `expo-sqlite`
- Calls `runMigrations(db)`
- Exports a typed `db` handle used by all store modules
- Singleton — opened once, reused across the app

### Step 4 — Record store (`src/lib/db/recordStore.ts`)
Typed functions, each wrapping a transaction:
- `createRecord(record)` → writes record + delta log entry atomically
- `updateRecord(edge_id, changes)` → overwrites record + appends UPDATE delta entry
- `softDeleteRecord(edge_id)` → sets `is_deleted`, `deleted_at` + appends DELETE delta entry
- `getRecord(edge_id)` → single record or null
- `listRecords(limit, offset)` → paginated, excludes deleted
- `getRecentRecords(n)` → last N by `captured_at`, excludes deleted

### Step 5 — Delta log store (`src/lib/db/deltaStore.ts`)
- `appendDelta(entry)` → insert (called internally by recordStore, not directly by UI)
- `getPendingDeltas()` → all PENDING entries ordered by seq (used by V2 sync)
- `acknowledgeDelta(seq, gks_id)` → update status to ACKNOWLEDGED (V2 sync)
- `rejectDelta(seq, error)` → update status to REJECTED (V2 sync)

### Step 6 — Attachment store (`src/lib/db/attachmentStore.ts`)
- `saveAttachment(file)` → compute sha256, copy blob to content-addressed path, write metadata to SQLite
- `linkAttachment(edge_id, edge_attachment_id)` → insert into `record_attachments`
- `getAttachmentsForRecord(edge_id)` → list of attachment metadata
- `blobPath(sha256)` → derives filesystem path from sha256

### Step 7 — SHA-256 utility (`src/lib/crypto.ts`)
- `sha256File(uri)` → string — uses `expo-crypto` to hash a file
- `sha256String(content)` → string — hashes record content for delta log

---

## Definition of Done

- [ ] All four tables created by migration on first launch
- [ ] `createRecord` writes record + delta entry in one transaction; rollback if either fails
- [ ] `updateRecord` overwrites record, appends UPDATE delta entry atomically
- [ ] `softDeleteRecord` sets flags, appends DELETE delta entry atomically; record hidden from all list queries
- [ ] `getRecentRecords(5)` returns last 5 non-deleted records correctly
- [ ] `getPendingDeltas()` returns all three operation types in seq order
- [ ] Identical file attached to two records: one blob on disk, two rows in `record_attachments`
- [ ] Migration runner skips already-applied migrations on subsequent launches
- [ ] TypeScript: zero errors
