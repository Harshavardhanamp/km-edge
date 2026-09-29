# REQ-0005: Local Storage + Delta Log

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Related:** ADR-0009, ADR-0010

---

## S1 — Storage Technology

- Records stored in `expo-sqlite` (SQLite on device)
- Attachment blobs stored in `expo-file-system` app sandbox
- No cloud drive, no external provider (ADR-0009)
- OS backup (iCloud / Android Auto Backup) provides passive durability

---

## S2 — Record Lifecycle

### S2.1 Create
- New record written to SQLite with a UUID v7 `edge_id`
- `captured_at` set to device local time (ISO8601)
- `sync_status` set to `PENDING`
- Delta log entry appended: `{ operation: CREATE, edge_id, timestamp, content_sha256 }`

### S2.2 Edit
- Record overwritten in place — no version history in V1
- `updated_at` timestamp updated
- `sync_status` reset to `PENDING`
- Delta log entry appended: `{ operation: UPDATE, edge_id, timestamp, content_sha256 }`

### S2.3 Delete
- **Soft delete only** — record is never removed from SQLite in V1
- `deleted_at` timestamp set, `is_deleted: true` flag set
- Record hidden from all UI queries (filtered out)
- `sync_status` set to `PENDING`
- Delta log entry appended: `{ operation: DELETE, edge_id, timestamp }`
- Physical purge deferred to V2: record removed from SQLite only after GKS confirms receipt of the DELETE operation

### S2.4 No version history
- Edits overwrite the record. No previous versions kept. Acceptable for V1.

---

## S3 — Delta Log

### S3.1 Purpose
The delta log is a durable, append-only record of every change made on the edge. It exists in V1 even though sync does not. When V2 sync ships, it replays this log to push all changes to GKS — including changes made before sync existed.

### S3.2 Operations logged
All three operations logged from day one: `CREATE`, `UPDATE`, `DELETE`.

### S3.3 Entry schema
```json
{
  "seq": 1,
  "edge_id": "01927c4a-...",
  "operation": "CREATE",
  "record_type": "KNOWLEDGE",
  "capture_kind": "JOURNAL",
  "timestamp": "2026-09-29T10:00:00Z",
  "content_sha256": "abc123...",
  "attachment_edge_ids": [],
  "status": "PENDING",
  "gks_id": null,
  "gks_acknowledged_at": null,
  "gks_error": null,
  "retry_count": 0
}
```

`status` values: `PENDING` → (V2) `IN_FLIGHT` → `ACKNOWLEDGED` | `REJECTED`

### S3.4 Storage location
Delta log stored in SQLite (separate `delta_log` table, not a JSON file) for queryability and atomic writes alongside record operations.

### S3.5 Immutability
Delta log entries are never modified in V1 — only `status`, `gks_id`, `gks_acknowledged_at`, `gks_error`, `retry_count` fields are updated by V2 sync. The `seq`, `edge_id`, `operation`, `timestamp`, `content_sha256` fields are write-once.

---

## S4 — Attachment Storage

- Blob stored at `<app_documents>/attachments/<sha256[:2]>/<sha256>` (content-addressed, matches GKS pattern)
- Metadata (filename, mime_type, size_bytes, sha256, captured_at, linked `edge_id`) stored in SQLite `attachments` table
- Attachment linked to record via `record_attachments` join table
- Delta log entry for CREATE includes `attachment_edge_ids` array

---

## S5 — Storage Limits

- No enforced record count or size limit
- OS handles storage pressure
- When device storage is critically low (OS threshold), app shows a warning banner: "Device storage is low — consider freeing space"
- No automatic deletion of records in response to low storage

---

## S6 — Data Integrity

- Every write to SQLite wrapped in a transaction — record + delta log entry written atomically
- If the transaction fails, neither the record nor the delta entry is written (no partial state)
- `content_sha256` computed on the record content before writing, stored in both the record and the delta log entry

---

## S7 — Query Requirements (consumed by UI)

| Query | Used by |
|---|---|
| Last 5 records by `captured_at` DESC, excluding deleted | Home screen recent |
| All records, paginated, excluding deleted | Records screen |
| Single record by `edge_id` | Record detail screen |
| All delta entries with `status = PENDING` ordered by `seq` | V2 sync |
| Attachment metadata by `edge_id` | Record detail, sync |
