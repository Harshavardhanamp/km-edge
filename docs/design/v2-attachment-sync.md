# V2 Attachment Sync and Blob Purge Deferral

**Date:** 2026-09-29  
**Author:** Harshavardhana P  
**Status:** Draft  
**Covers:** V2-F2 (Attachment Sync), V2-F3 (Blob Purge Deferral), V2-F6 (Attachment Durability)  
**Depends on:** REQ-0012, ADR-0005, ADR-0009, migration 001 (full V1 schema including `pending_delete`), migration 003 (adds `sync_status`, `sync_error`, `delete_delta_seq` to `attachments`)

---

## 1. Overview

### Attachment Sync

Attachment sync transmits locally-stored blobs to GKS after their parent record delta has been acknowledged. Each attachment is uploaded as a multipart POST to the GKS workflow endpoint, and the response checksum is compared with the locally-computed SHA-256. On a successful, verified upload the attachment is bound to its GKS record via a second POST call, and the local `sync_status` is updated to `SYNCED`. Uploads that fail transiently are retried on the next sync pass; permanent rejections and checksum mismatches are surfaced in StatusDetailScreen. Attachment failures are isolated — they do not block other attachment uploads or record delta processing.

### Blob Purge Deferral

Blob purge deferral prevents a locally-stored binary from being deleted before GKS has acknowledged the DELETE delta for its parent record. When a user deletes a record, the blob is not removed immediately. Instead, `softDeleteRecord()` marks all attachments for the record with `pending_delete = 1` and stamps `delete_delta_seq` with the newly-inserted DELETE delta seq — inside the same transaction as the delete. `unlinkAttachment()` handles the separate case of removing an attachment from a live record (see §5.4). The sync engine defers physical file removal until that specific delta reaches `ACKNOWLEDGED` status in `delta_log`. For records that were never synced to GKS, the blob is purged immediately because there is no in-flight operation to protect. This eliminates the window where a user could delete a record, GKS could fail to receive the delete, and the local blob would already be gone before a retry.

---

## 2. Schema Changes (Migration 003)

Migration 003 adds three columns to the `attachments` table, following the same `try/catch ALTER TABLE` pattern established in `002_v2.ts`.

```typescript
import type { SQLiteDatabase } from 'expo-sqlite';

export function migration003(db: SQLiteDatabase): void {
  // Track upload state for each attachment
  try {
    db.execSync(
      `ALTER TABLE attachments ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'PENDING'`
    );
  } catch { /* column already exists */ }

  // Stores failure reason when sync_status = 'FAILED'
  try {
    db.execSync(`ALTER TABLE attachments ADD COLUMN sync_error TEXT`);
  } catch { /* column already exists */ }

  // References delta_log.seq of the DELETE delta for the parent record.
  // Set by unlinkAttachment() when pending_delete is written.
  // Null until the attachment is unlinked.
  try {
    db.execSync(
      `ALTER TABLE attachments ADD COLUMN delete_delta_seq INTEGER`
    );
  } catch { /* column already exists */ }

  // Partial index: speeds up purge eligibility query during sync pass
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_attachments_purge_eligible
     ON attachments(edge_attachment_id)
     WHERE pending_delete = 1`
  );

  // Speeds up the per-record pending-upload query run after each record ack
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_attachments_sync_status
     ON attachments(sync_status)
     WHERE sync_status = 'PENDING'`
  );

  db.runSync(
    `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?)`,
    new Date().toISOString()
  );
}
```

**Post-migration `attachments` column set:**

| Column | Type | Source | Notes |
|---|---|---|---|
| `edge_attachment_id` | TEXT PK | migration 001 | |
| `sha256` | TEXT UNIQUE | migration 001 | |
| `original_filename` | TEXT | migration 001 | |
| `mime_type` | TEXT | migration 001 | |
| `size_bytes` | INTEGER | migration 001 | |
| `blob_path` | TEXT | migration 001 | Staging path during save; final path after move |
| `captured_at` | TEXT | migration 001 | |
| `gks_attachment_id` | TEXT | migration 001 | Null until SYNCED |
| `pending_delete` | INTEGER DEFAULT 0 | migration 002 | 1 = awaiting purge |
| `sync_status` | TEXT DEFAULT 'PENDING' | migration 003 | PENDING / SYNCED / FAILED |
| `sync_error` | TEXT | migration 003 | Null unless FAILED |
| `delete_delta_seq` | INTEGER | migration 003 | FK to `delta_log.seq` |

---

## 3. Attachment Save — Staging Area Protocol

The staging area eliminates the orphan-blob window that existed in V1, where a crash between the filesystem copy and the DB insert would leave a blob with no row.

### 3.1 Save Sequence (addAttachment)

1. **Validate.** Call `validateFile({ name, size })`. Return `{ ok: false }` on any violation. Check record limits via `validateRecordLimits`.

2. **Compress.** If `source === 'camera'` or `'gallery'`, call `compressImage(uri, mimeType)`. Update `workUri` to the compressed result.

3. **Compute SHA-256.** Call `sha256File(workUri)`. This is the canonical identifier for deduplication and verification.

4. **Copy to staging.** Write the blob to `attachments/staging/<sha256>` under `FileSystem.documentDirectory`. Create the staging directory if it does not exist. The file now exists on disk but has no DB row.

5. **DB transaction.** Within a single SQLite transaction:
   - `INSERT INTO attachments` with `blob_path = 'attachments/staging/<sha256>'` and `sync_status = 'PENDING'`. Skip insert if `sha256` already exists (deduplication).
   - `INSERT OR IGNORE INTO record_attachments (edge_id, edge_attachment_id)`.
   - Call `updateRecord(recordEdgeId, {})` to bump `updated_at` and enqueue a delta.

6. **Move to final path.** Move file from `attachments/staging/<sha256>` to `attachments/<xx>/<sha256>` where `<xx>` is the first two hex characters of the SHA-256. Create the target directory if needed.

7. **Update blob_path.** `UPDATE attachments SET blob_path = 'attachments/<xx>/<sha256>' WHERE sha256 = ?`.

### 3.2 Crash Recovery at Each Step

| Crash point | State on restart | Recovery |
|---|---|---|
| Between step 4 and step 5 | File in staging, no DB row | `cleanStagingDirectory()` deletes the orphan staging file |
| Between step 5 and step 6 | DB row with staging path, file in staging | `cleanStagingDirectory()` moves file to final path |
| Between step 6 and step 7 | File at final path, DB row still points to staging | `cleanStagingDirectory()` detects file at final path, updates `blob_path` |
| After step 7 | Fully consistent | No recovery needed |

The staging path is always distinguishable from a final path because it contains the literal string `/staging/`.

### 3.3 cleanStagingDirectory()

Called during `AppShell` mount, alongside `resetInFlightToPending()`, before any user interaction is possible.

Algorithm:
1. List all files under `attachments/staging/`.
2. For each file (filename = sha256):
   a. Query `SELECT blob_path FROM attachments WHERE sha256 = ?`.
   b. **No DB row:** Orphan staging file — call `FileSystem.deleteAsync()`.
   c. **DB row, blob_path is staging path:** Move file to final path `attachments/<xx>/<sha256>`. Update `blob_path` in DB.
   d. **DB row, blob_path is final path:** File was already moved but staging copy was not cleaned up — delete the staging copy.

`cleanStagingDirectory()` only touches the staging directory. It does not inspect `attachments/<xx>/` subdirectories — that is the responsibility of orphan cleanup (Section 6).

---

## 4. Attachment Upload Protocol

Attachment upload runs as a sub-phase of the sync engine, after each record delta is marked `ACKNOWLEDGED`.

### 4.1 Qualifying Attachments

After a record delta is acknowledged and `gks_record_id` is stored:

```sql
SELECT a.edge_attachment_id, a.sha256, a.blob_path, a.mime_type, a.original_filename
FROM attachments a
JOIN record_attachments ra ON ra.edge_attachment_id = a.edge_attachment_id
WHERE ra.edge_id = ?
  AND a.sync_status = 'PENDING'
  AND a.gks_attachment_id IS NULL
```

Attachments that are already `SYNCED` or `FAILED` are skipped. Attachments in `FAILED` state require a user-initiated retry.

### 4.2 Upload Call

```typescript
const result = await FileSystem.uploadAsync(
  `${GKS_SERVER_URL}/api/v1/attachments/workflow/NEW_ENTRY`,
  `${FileSystem.documentDirectory}${blobPath(sha256)}`,
  {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    parameters: { entity_ref: gks_record_id },
    headers: buildAuthHeaders(),
  }
);
```

Field names are fixed: `file` for the binary part, `entity_ref` for the GKS record ID. These must match the GKS multipart parser — do not rename them.

### 4.3 SHA-256 Comparison

On a 200 or 201 response:

```typescript
const body = JSON.parse(result.body);
if (body.sha256 !== localSha256) {
  await db.runAsync(
    `UPDATE attachments SET sync_status = 'FAILED', sync_error = 'CHECKSUM_MISMATCH'
     WHERE edge_attachment_id = ?`,
    edgeAttachmentId
  );
  return; // do not proceed to bind
}
```

GKS computes SHA-256 server-side on receipt. A mismatch indicates corruption in transit or a filesystem error. The attachment is marked `FAILED` and surfaced in StatusDetailScreen.

### 4.4 Bind Call

On checksum match:

```
POST /api/v1/attachments/records/{gks_record_id}/attachments/{gks_attachment_id}
```

`gks_attachment_id` is extracted from the upload response body. This call associates the uploaded blob with the GKS record. The GKS endpoint is idempotent — re-binding the same attachment is safe.

### 4.5 DB Updates on Success

```sql
UPDATE attachments
SET gks_attachment_id = ?,
    sync_status = 'SYNCED',
    sync_error = NULL
WHERE edge_attachment_id = ?
```

### 4.6 DB Updates on Failure

| Condition | sync_status | sync_error |
|---|---|---|
| Network error / timeout | `PENDING` (unchanged) | (unchanged) |
| GKS 400 permanent rejection | `FAILED` | GKS error reason |
| Checksum mismatch | `FAILED` | `'CHECKSUM_MISMATCH'` |
| File type not supported | `FAILED` | `'FILE_TYPE_NOT_SUPPORTED'` |

Transient failures (`PENDING`) retry automatically on the next sync pass. `FAILED` attachments require explicit user retry.

---

## 5. Blob Purge Deferral

### 5.1 Purge Eligibility Query

A blob is eligible for physical deletion when both conditions hold:

```sql
SELECT a.edge_attachment_id, a.blob_path
FROM attachments a
WHERE a.pending_delete = 1
  AND a.delete_delta_seq IN (
    SELECT seq FROM delta_log WHERE status = 'ACKNOWLEDGED'
  )
```

This query runs during every sync pass (after delta processing) and from the Settings screen "Clear deleted attachments" button.

### 5.2 Calendar Event Cleanup on Delete (F4.3)

Before the sync engine transmits a DELETE delta, `softDeleteRecord()` must attempt to remove any associated native calendar event. This applies to records where `has_calendar_entry = 1`.

**`softDeleteRecord()` in `recordStore.ts`:**

```typescript
if (record.has_calendar_entry) {
  try {
    await deleteEvent(record.native_calendar_event_id);
  } catch {
    // Permission revoked or event already gone — proceed with record delete
  }
}
```

The calendar deletion is attempted locally, at soft-delete time, not during sync. It is not retried. Any failure (permission revoked, event already deleted, calendar unavailable) is silently ignored — the record deletion proceeds regardless. This matches REQ-0012 F4.3 exactly.

`deleteEvent` is imported from `src/lib/calendar.ts`. No new dependency.

---

### 5.3 Never-Synced Delete

**A1 fix (2026-09-30):** `gks_record_id` on a DELETE delta is now stamped at delete time by `softDeleteRecord()` — it reads `records.gks_id` inside the transaction and includes it in the `delta_log` INSERT. The sync engine check at `syncEngine.ts:144` is now correct: null means the record genuinely never reached GKS.

When a DELETE delta is processed and `gks_record_id` is null on that delta row, the record was never transmitted to GKS. There is no remote reference to protect. In this case:

1. Acknowledge the delta immediately (no network call needed).
2. Call `purgeAttachment()` for every attachment linked to the record, without waiting for an ack delta — the delta is being acknowledged in the same step.

This path is identified in the sync engine by checking `delta_log.gks_record_id IS NULL` on DELETE deltas before making any network call.

### 5.4 unlinkAttachment() — V2 Behavior

**A4 fix (2026-09-30):** Purge deferral only makes sense when the parent record is being deleted — the deferral waits for the DELETE delta to be acknowledged before removing the blob. When an attachment is removed from a *live* record, there is no DELETE delta to wait for; the blob should be purged immediately once the ref count hits zero. `unlinkAttachment()` now checks whether a DELETE delta exists for the record: if yes, defer (set `pending_delete = 1`, stamp `delete_delta_seq`); if no, call `purgeAttachment()` immediately.

Previous V1 behavior set `pending_delete = 1` but did not populate `delete_delta_seq`. V2 adds the seq lookup:

```typescript
export async function unlinkAttachment(
  edge_id: string,
  edge_attachment_id: string
): Promise<void> {
  db.runSync(
    `DELETE FROM record_attachments WHERE edge_id = ? AND edge_attachment_id = ?`,
    edge_id,
    edge_attachment_id
  );

  const refCount = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM record_attachments WHERE edge_attachment_id = ?`,
    edge_attachment_id
  );

  if (refCount && refCount.n === 0) {
    // Find the most recent DELETE delta for this record
    const delta = db.getFirstSync<{ seq: number }>(
      `SELECT seq FROM delta_log
       WHERE edge_id = ? AND operation = 'DELETE'
       ORDER BY seq DESC LIMIT 1`,
      edge_id
    );

    db.runSync(
      `UPDATE attachments
       SET pending_delete = 1,
           delete_delta_seq = ?
       WHERE edge_attachment_id = ?`,
      delta?.seq ?? null,
      edge_attachment_id
    );
  }
}
```

If no DELETE delta exists yet (the attachment was unlinked before `softDeleteRecord()` ran), `delete_delta_seq` is set to null. The purge eligibility query will not match a null `delete_delta_seq`, so the blob is safe. The seq will be back-filled when `softDeleteRecord()` runs and the DELETE delta is inserted — a subsequent `unlinkAttachment()` call is not needed.

Note: `softDeleteRecord()` must write `delete_delta_seq` onto any `pending_delete = 1` attachment rows for the record that still have a null `delete_delta_seq`, immediately after inserting the DELETE delta. This covers the case where unlink runs before delete.

### 5.5 purgeAttachment() Behavior

No change to the existing function signature. Behavior:

1. `SELECT blob_path FROM attachments WHERE edge_attachment_id = ?`
2. `DELETE FROM attachments WHERE edge_attachment_id = ?`
3. `FileSystem.deleteAsync(documentDirectory + blob_path, { idempotent: true })`

The DB row is deleted before the file, so a crash between steps 2 and 3 leaves an orphan file on disk. Orphan cleanup (Section 6) handles this during the next sync pass.

---

## 6. Orphan Cleanup

### 6.1 Orphan Definition

An orphan is a row in `attachments` that has `pending_delete = 0` but no corresponding row in `record_attachments`. This condition arises when the app is killed after the DB insert in `saveAttachment()` but before the `record_attachments` insert, or after a partial rollback.

### 6.2 Orphan Query

```sql
SELECT edge_attachment_id
FROM attachments
WHERE pending_delete = 0
  AND edge_attachment_id NOT IN (
    SELECT edge_attachment_id FROM record_attachments
  )
```

### 6.3 When It Runs

Orphan cleanup runs during every sync pass, after delta processing and attachment uploads complete. It also runs when the user taps "Clear deleted attachments" in SettingsScreen (Section 7).

### 6.4 cleanStagingDirectory() vs Orphan Cleanup — Distinction

These are two separate operations targeting different failure modes:

| | `cleanStagingDirectory()` | Orphan cleanup |
|---|---|---|
| Runs | App startup (AppShell mount) | Every sync pass + Settings button |
| Scope | `attachments/staging/` directory only | `attachments` DB table |
| Finds | Files in staging with no DB row (or with stale DB path) | DB rows with no `record_attachments` link |
| Action | Delete orphan staging files; complete interrupted moves | Call `purgeAttachment()` for each orphan row |
| Root cause addressed | Crash between filesystem copy and DB insert | Crash between `attachments` insert and `record_attachments` insert |

`cleanStagingDirectory()` cannot detect orphan rows in the main `attachments/<xx>/` directories — those require the SQL query. Orphan cleanup cannot detect orphan staging files because they have no DB row to query against.

---

## 7. Settings Screen — Clear Deleted Attachments

The "Clear deleted attachments" button in SettingsScreen performs the following steps in sequence, then reports the total space freed:

1. **Orphan cleanup.** Run the orphan query from Section 6.2. For each result, call `purgeAttachment()`. Accumulate `size_bytes` from each deleted row.

2. **Pending-delete purge.** Run the purge eligibility query from Section 5.1. For each result, call `purgeAttachment()`. Accumulate `size_bytes`.

3. **Report.** Sum the bytes freed from both steps. Convert to MB (divide by 1,048,576, round to one decimal). Show system alert: `"Freed X.X MB"`. If zero bytes were freed, show `"Nothing to clear"`.

The button does not purge blobs whose `delete_delta_seq` is still `PENDING` or `IN_FLIGHT` — those deletions have not yet reached GKS, and the blob must be retained until they do.

---

## 8. attachment_edge_ids in delta_log

### 8.1 Current State

`delta_log.attachment_edge_ids` is defined in migration 001 with `DEFAULT '[]'`. All three record mutation functions — `createRecord()`, `updateRecord()`, `softDeleteRecord()` — currently insert the literal string `'[]'` rather than querying `record_attachments` to build the real array.

### 8.2 Required State (V2)

Each record mutation must query `record_attachments` at write time and store the actual attachment IDs:

**createRecord():** After inserting into `records` and `record_attachments`, before inserting into `delta_log`:

```typescript
const attachmentRows = db.getAllSync<{ edge_attachment_id: string }>(
  `SELECT edge_attachment_id FROM record_attachments WHERE edge_id = ?`,
  edge_id
);
const attachmentEdgeIds = JSON.stringify(
  attachmentRows.map(r => r.edge_attachment_id)
);
// Use attachmentEdgeIds in the delta_log INSERT
```

**updateRecord():** Same query at the point of delta insert, reflecting the attachment set at the time of the update.

**softDeleteRecord():** Query `record_attachments` at the moment of deletion. This is what GKS uses to know which blobs were associated with the deleted record. After inserting the DELETE delta, back-fill `delete_delta_seq` on any `pending_delete = 1` attachment rows for this record that still have `delete_delta_seq IS NULL`:

```typescript
const newSeq = db.getFirstSync<{ seq: number }>(
  `SELECT last_insert_rowid() AS seq`
)!.seq;

db.runSync(
  `UPDATE attachments
   SET delete_delta_seq = ?
   WHERE edge_attachment_id IN (
     SELECT edge_attachment_id FROM record_attachments WHERE edge_id = ?
   )
   AND pending_delete = 1
   AND delete_delta_seq IS NULL`,
  newSeq,
  edge_id
);
```

### 8.3 Why This Matters

The sync engine uses `attachment_edge_ids` from the DELETE delta to identify which blobs to purge after GKS acknowledges the delete. An empty array means no blobs are ever purged by the sync engine — they accumulate on device until the Settings button is tapped.

---

## 9. GKS Extension Alignment

### 9.1 Extensions to Add

GKS must accept the following file types that the edge app already allows:

| Extension | MIME type |
|---|---|
| `heic` | `image/heic` |
| `mp4` | `video/mp4` |
| `mov` | `video/quicktime` |
| `mp3` | `audio/mpeg` |
| `m4a` | `audio/mp4` |

### 9.2 File to Change

`src/generational_kb/attachments.py` — the `ALLOWED_EXT` set (or equivalent constant that gates extension validation).

### 9.3 Exact Change

Locate the set definition and add the five extensions:

```python
# Before
ALLOWED_EXT = {"jpg", "jpeg", "png", "gif", "pdf", "txt", "md"}

# After
ALLOWED_EXT = {"jpg", "jpeg", "png", "gif", "pdf", "txt", "md",
               "heic", "mp4", "mov", "mp3", "m4a"}
```

The exact current contents of `ALLOWED_EXT` must be verified in the GKS repo before applying this change. The set name and file path are confirmed by REQ-0012 V2-F2.5.

### 9.4 Edge Handling Until GKS is Updated

If GKS rejects a file type with a 400 response, the attachment is marked `sync_status = 'FAILED'`, `sync_error = 'FILE_TYPE_NOT_SUPPORTED'` and surfaced in StatusDetailScreen. No retry occurs automatically — a user retry after the GKS extension list is updated will succeed.

---

## 10. Gaps in Current Implementation

The following gaps exist between the current codebase and what REQ-0012 requires. Each entry identifies the file, the function or construct, and the specific change needed.

### Gap 1 — Migration 003 does not exist

**File:** `src/lib/db/migrations/` (missing)  
**Gap:** The `sync_status`, `sync_error`, and `delete_delta_seq` columns required by V2-F2.2 and V2-F3.3 are not in the database. No migration 003 file exists. The migration runner must also be updated to call `migration003`.

### Gap 2 — attachmentStore.ts: unlinkAttachment does not set delete_delta_seq

**File:** `src/lib/db/attachmentStore.ts`, `unlinkAttachment()`  
**Gap:** The function sets `pending_delete = 1` but does not query `delta_log` for the DELETE delta seq and does not write `delete_delta_seq`. Purge deferral (V2-F3) cannot function correctly without this. See Section 5.3 for the required implementation.

### Gap 3 — attachmentStore.ts: saveAttachment does not use staging area

**File:** `src/lib/db/attachmentStore.ts`, `saveAttachment()`  
**Gap:** The function copies directly to the final blob path and then inserts the DB row. V2-F6 requires copy to staging first, DB insert, move to final path, update `blob_path`. The staging area protocol (Section 3) is entirely absent.

### Gap 4 — attachmentService.ts: addAttachment does not use staging protocol

**File:** `src/lib/attachments/attachmentService.ts`, `addAttachment()`  
**Gap:** Delegates to `saveAttachment()` which lacks staging. Once `saveAttachment()` is updated, `addAttachment()` must also be updated if any staging-area steps are split between the two layers. If staging is implemented entirely inside `saveAttachment()`, this gap closes automatically.

### Gap 5 — cleanStagingDirectory does not exist

**File:** `src/lib/db/attachmentStore.ts` or a new `src/lib/attachments/stagingCleanup.ts`  
**Gap:** The function described in V2-F6.3 and Section 3.3 is not implemented. The AppShell mount call is also missing.

### Gap 6 — Sync engine: no attachment upload phase

**File:** `src/lib/sync/syncEngine.ts` (or equivalent)  
**Gap:** After a record delta is acknowledged, no code uploads qualifying attachments. The entire upload protocol (Section 4) — `FileSystem.uploadAsync`, checksum comparison, bind call, DB update — is missing.

### Gap 7 — Sync engine: no purge deferral enforcement

**File:** `src/lib/sync/syncEngine.ts`  
**Gap:** The sync engine does not run the purge eligibility query (Section 5.1) after delta processing. Blobs marked `pending_delete = 1` are never physically removed by the sync engine.

### Gap 8 — Sync engine: no orphan cleanup pass

**File:** `src/lib/sync/syncEngine.ts`  
**Gap:** The orphan query (Section 6.2) is not run during the sync pass. Orphan rows accumulate indefinitely until the Settings button is tapped.

### Gap 9 — delta_log.attachment_edge_ids is always '[]'

**File:** `src/lib/db/recordStore.ts`, `createRecord()`, `updateRecord()`, `softDeleteRecord()`  
**Gap:** All three functions write the literal `'[]'` string instead of querying `record_attachments`. See Section 8.2 for the required implementation in each function.

### Gap 10 — softDeleteRecord does not back-fill delete_delta_seq

**File:** `src/lib/db/recordStore.ts`, `softDeleteRecord()`  
**Gap:** After inserting the DELETE delta, the function must back-fill `delete_delta_seq` on any `pending_delete = 1` attachments with a null seq (Section 8.2). This covers the case where the user unlinked an attachment before soft-deleting the record.

### Gap 11 — Never-synced delete path not implemented

**File:** `src/lib/sync/syncEngine.ts`  
**Gap:** DELETE delta processing does not check `gks_record_id IS NULL`. When a never-synced record is deleted, its blobs must be purged immediately (V2-F3.2, V2-F4.2). Without this check, blobs accumulate with `pending_delete = 1` and `delete_delta_seq` pointing to a delta that is acknowledged locally but never transmitted, leaving them in limbo.

### Gap 12 — Settings screen Clear Deleted Attachments button is V1 behavior

**File:** `src/screens/SettingsScreen.tsx` (or equivalent)  
**Gap:** The button's current behavior is unknown from this codebase snapshot, but V2 requires the specific three-step sequence in Section 7: orphan cleanup, acknowledged pending-delete purge, and MB-freed alert. Verify and update accordingly.

### Gap 13 — GKS ALLOWED_EXT not updated

**File:** `src/generational_kb/attachments.py` in the GKS repository  
**Gap:** `heic`, `mp4`, `mov`, `mp3`, `m4a` are not in the GKS allowed extension list. Until this is added, uploads of these types will receive a 400 from GKS and be marked `FAILED`. This is a GKS-side change, not an edge-side change.

---

*End of document.*
