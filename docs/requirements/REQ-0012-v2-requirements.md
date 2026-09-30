# REQ-0012: V2 Functional and Non-Functional Requirements

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P  
**Supersedes:** REQ-0011 (V2 scope items — replaced by this document)  
**Depends on:** REQ-0002 (F7 sync), ADR-0005 (sync architecture), ADR-0009 (local SQLite)

---

## Scope

V2 delivers edge-to-GKS sync, attachment sync, verified delivery, blob purge deferral, soft delete transmission, deep linking infrastructure, attachment durability, and the GKS sync status endpoint.

**In V2:**
- V2-F1: GKS Sync — delta transmission, error handling, progress UI
- V2-F2: Attachment Sync — upload, checksum verify, GKS extension alignment
- V2-F3: Blob Purge Deferral — correct post-ack purge timing
- V2-F4: Soft Delete Transmission — DELETE delta to GKS
- V2-F5: Deep Linking — `kmedge://record/<edge_id>` scheme (no push notifications)
- V2-F6: Attachment Durability — staging area for atomic save
- V2-F7: Sync Status Endpoint — GKS-side `GET /api/v1/sync/status`
- V2-F8: Checksum Verification — post-sync batch SHA-256 comparison

**Explicitly out of V2:**
- V2-005 Biometric login — V3
- V2-006 Bidirectional sync (GKS → edge pull) — V3
- V2-007 Conflict resolution — V3
- Push notifications — V3
- GKS admin dashboard — V3
- Central observability server — V3
- Batch ingest endpoint — V3

**V2-004 (Buffer Durability) disposition:** Resolved by ADR-0009. Local SQLite is the store from day one — there is no memory buffer to upgrade. V2-004 is closed. Attachment staging area (V2-F6) covers the remaining durability gap.

---

## V2-F1 — GKS Sync (Delta Transmission)

### F1.1 Trigger

Sync runs:
- Automatically via `expo-background-fetch` every 15 minutes
- Manually via "Sync now" button in StatusDetailScreen
- On app foreground when GKS is reachable (probe result = online)

### F1.2 Pre-flight

Before processing any delta:
1. Check network connectivity via `expo-network`. No network → abort silently.
2. Confirm `GKS_SERVER_URL` is set. Missing → abort silently.
3. Probe `GET /api/v1/health` on the GKS server. Offline (failed / non-200) → abort silently. This catches Tailscale tunnel down, server off, or DNS failure — `expo-network` only knows the device has internet, not that the Tailscale VPN path to GKS is up.
4. Call `resetInFlightToPending()` to recover any deltas stuck IN_FLIGHT from a previous crash.

### F1.3 Delta Processing Order

Process all `PENDING` deltas in ascending `seq` order. Each delta is processed independently — a failure on one delta does not block subsequent deltas.

### F1.3a UPDATE Delta Handling

GKS records are immutable after creation — no PUT or PATCH endpoint exists. UPDATE deltas for records that already have a `gks_id` (i.e. already synced) are acknowledged locally without any network call. Local edits to synced records are preserved on the edge device but do not propagate to GKS in V2. Bidirectional sync and edit propagation are deferred to V3.

### F1.4 Per-Delta Protocol

For each PENDING delta:

1. Mark `IN_FLIGHT` before transmitting (durable before network call).
2. Build GKS payload:
   - `record_type`: lowercase (e.g. `journal`, `note`, `event`) — derived from `capture_kind`
   - `edge_id`: edge UUID
   - `content_sha256`: SHA-256 of raw content string
   - `preserve_authored_body`: always `true` for edge-originated records
   - Standard fields: `title`, `content`, `tags`, `importance`, `classification`, `life_areas`
   - `created`: ISO date string (user-editable capture date — must not be dropped)
   - `author`: string (default `"human"`)
   - `place`: JSON object or `null`
   - `owner_user_id`: GKS user ID — **only included when `classification = PRIVATE`**; required for GKS RBAC to scope visibility
   - Calendar fields (`native_calendar_event_id`, `reminder_minutes`) are **not sent** — calendar integration is edge-only
   - `schema_version` is **not sent** — GKS stamps this internally
3. POST to `GKS /api/v1/records`.
4. Handle response per F1.5.

### F1.5 Response Handling

| GKS response | Action |
|---|---|
| 201 Created | Extract `record.id` as `gks_record_id`. Mark ACKNOWLEDGED. Update `records.gks_id`. Upload attachments. |
| 409 EDGE_DUPLICATE | Extract `record_id` from body. Mark ACKNOWLEDGED with that ID. Upload attachments. Idempotent. |
| 400 / 422 | Mark REJECTED permanently. Store `gks_error`. Surface to user (see F1.7). Continue to next delta. |
| 500 | Reset to PENDING. Continue to next delta. Retry on next sync run. |
| Network error / timeout | Reset to PENDING. **Stop** processing remaining deltas for this run. Retry next sync run. |
| Auth failure after re-auth | Stop sync. Emit `session_expired` event. UI shows "Session expired — log in again". |

### F1.6 GKS Capture Kind Mapping

Edge `capture_kind` → GKS `record_type` (lowercase):

| Edge capture_kind | GKS record_type |
|---|---|
| JOURNAL | journal |
| NOTE | note |
| EVENT | event |
| DECISION | decision |
| LESSON | lesson |
| GOAL | goal |
| PERSON | person |

### F1.7 Failed Delta Visibility

- StatusDot shows a warning indicator (orange/amber) when any delta is in REJECTED state.
- StatusDetailScreen lists all REJECTED deltas with: record title, error reason, timestamp.
- Each failed delta has a per-record "Retry" button that resets it to PENDING and triggers sync.

### F1.8 Progress Visibility

- StatusDot animates (pulse) while sync is actively running.
- StatusDot returns to green (reachable) or red (unreachable) when sync completes.
- HomeScreen shows "Last synced X min ago" label below GKS status row, above recent records.
- Label reads from `last_synced_at` stored in SecureStore after each successful sync run.
- HomeScreen refreshes `getRecentRecords()` automatically after sync completes.

---

## V2-F2 — Attachment Sync

### F2.1 Upload Protocol

For each ACKNOWLEDGED record, upload any linked attachments where `sync_status = 'PENDING'`:

1. Read blob from `attachments/<xx>/<sha256>` on device filesystem.
2. POST multipart to `GKS /api/v1/attachments/workflow/NEW_ENTRY` with `file` field and `entity_ref=gks_record_id`.
3. On success (200/201): compare `response.sha256` with local `attachments.sha256`. If mismatch → mark FAILED with `sync_error = 'CHECKSUM_MISMATCH'`.
4. On success + checksum match: POST `GKS /api/v1/attachments/records/{gks_record_id}/attachments/{gks_attachment_id}` to bind.
5. Update `attachments.gks_attachment_id` and `attachments.sync_status = 'SYNCED'`.

### F2.2 Attachment Sync Status

`attachments` table gains two columns (migration 003):
- `sync_status TEXT NOT NULL DEFAULT 'PENDING'` — values: `PENDING`, `SYNCED`, `FAILED`
- `sync_error TEXT` — null unless FAILED

### F2.3 Failure Handling

| Upload response | Action |
|---|---|
| Network error / timeout | Leave `sync_status = 'PENDING'`. Retry next sync. Silent — no user notification. |
| GKS 400 (permanent rejection) | Set `sync_status = 'FAILED'`, `sync_error = <reason>`. Surface in StatusDetailScreen. |
| Checksum mismatch | Set `sync_status = 'FAILED'`, `sync_error = 'CHECKSUM_MISMATCH'`. Surface in StatusDetailScreen. |

Attachment failures do not block record delta processing or other attachment uploads.

### F2.4 delta_log attachment_edge_ids

`attachment_edge_ids` column in `delta_log` is populated at record save time:
- `createRecord()`: query `record_attachments` for the record and store current IDs as JSON array.
- `updateRecord()`: same — update to reflect current attached file set.
- `softDeleteRecord()`: query `record_attachments` at delete time and store IDs in the DELETE delta.

### F2.5 GKS Extension Alignment

GKS allowed attachment extensions are expanded to match edge:
- Add to GKS allowed list: `heic`, `mp4`, `mov`, `mp3`, `m4a`
- Edge allowed list remains as-is (already includes these types)
- If GKS rejects a file type not yet added: `sync_status = 'FAILED'`, `sync_error = 'FILE_TYPE_NOT_SUPPORTED'`. Surface in StatusDetailScreen.

### F2.6 Auth on Upload

`buildAuthHeaders()` uses a direct import from `gksClient.authHeaders()` — no dynamic import.

---

## V2-F3 — Blob Purge Deferral

### F3.1 Purge Trigger

A blob is physically purged only when **both** conditions are met:
1. `attachments.pending_delete = 1`
2. `attachments.delete_delta_seq` references a `delta_log` row with `status = 'ACKNOWLEDGED'`

### F3.2 Never-Synced Delete

If a record is deleted before it was ever synced to GKS (`gks_record_id` is null on the DELETE delta), its blobs are purged immediately — there is no GKS record to protect.

### F3.3 Schema

`attachments` table gains one column (migration 003):
- `delete_delta_seq INTEGER` — set by `unlinkAttachment()` at the time `pending_delete = 1` is written. References `delta_log.seq` of the DELETE delta for the parent record.

### F3.4 Blob Pending-Delete Writers

Two separate paths set `pending_delete = 1`:

**softDeleteRecord()** (record deletion): Inside the transaction, after inserting the DELETE delta, sets `pending_delete = 1` and `delete_delta_seq = newSeq` on all `attachments` rows for that record. This is the primary purge-deferral path.

**unlinkAttachment()** (removing attachment from a live record): Deletes from `record_attachments`, checks ref count. If zero:
- If a DELETE delta exists for the record (parent record is also being deleted): set `pending_delete = 1`, `delete_delta_seq` = that delta's seq.
- If no DELETE delta exists (attachment removed from a live record): call `purgeAttachment()` immediately. There is no in-flight GKS operation to protect, so deferral is unnecessary.

### F3.5 Orphan Cleanup

During every sync run, after delta processing:
- Query: `SELECT edge_attachment_id FROM attachments WHERE pending_delete = 0 AND edge_attachment_id NOT IN (SELECT edge_attachment_id FROM record_attachments)`
- These are blobs with no record link and no pending delete — orphans from crashes.
- Purge each via `purgeAttachment()`.

### F3.6 Settings Button

"Clear deleted attachments" in SettingsScreen:
1. Purge orphan blobs (same query as F3.5).
2. Purge `pending_delete = 1` blobs whose `delete_delta_seq` is ACKNOWLEDGED.
3. Show alert: "Freed X MB".

---

## V2-F4 — Soft Delete Transmission

### F4.1 DELETE Delta Content

`softDeleteRecord()` populates `attachment_edge_ids` with the IDs of all attachments linked to the record at the moment of deletion (queried from `record_attachments`).

### F4.2 Sync Engine DELETE Handling

`gks_record_id` is stamped onto the DELETE delta row at insert time by `softDeleteRecord()` (reads `records.gks_id` inside the same transaction). This ensures the sync engine can distinguish never-synced from synced records without a secondary lookup.

For DELETE deltas:
- If `gks_record_id` is null (never synced): acknowledge immediately. Purge blobs immediately (F3.2).
- If `gks_record_id` is set: call `DELETE /api/v1/records/{gks_record_id}`.
  - 204: acknowledge. Purge blobs after ack per F3.1.
  - 404: treat as success (already deleted on GKS). Acknowledge. Purge blobs.
  - 500 / network error: reset to PENDING. Retry next sync.

### F4.3 Calendar Event on Delete

If a record with `has_calendar_entry = 1` is deleted, attempt `deleteEvent()`. If calendar deletion fails (permission revoked, event already gone), proceed with record delete anyway — calendar error is ignored.

### F4.4 GKS Side

`DELETE /api/v1/records/{record_id}`:
- Sets `deleted_at` and `deleted_by` in YAML frontmatter.
- File stays on disk indefinitely (audit trail).
- `scan_records()` filters out records with `deleted_at` set — deleted records invisible in all GKS queries.
- Returns 204 on success, 404 if not found or already deleted.
- No GKS admin UI for deleted records in V2.

---

## V2-F5 — Deep Linking

### F5.1 URL Scheme

Register scheme `kmedge` in `app.json`. Only supported path in V2: `kmedge://record/<edge_id>`.

### F5.2 Warm Start

App is open. Incoming `kmedge://record/<edge_id>` link:
1. Look up `edge_id` in local `records` table.
2. If found: navigate to `RecordDetailScreen` pushed onto current navigation stack.
3. If not found: show toast "Record not found", navigate to HomeScreen.

### F5.3 Cold Start

App is not running. OS launches app with URL:
1. Store pending URL in memory during auth flow.
2. Complete normal auth (login screen / offline login / session restore).
3. Once `sessionValid = true`: consume pending URL and navigate per F5.2.

### F5.4 Unknown Paths

Any `kmedge://` URL that does not match `kmedge://record/<edge_id>`: navigate to HomeScreen silently.

### F5.5 No Sync on Miss

If `edge_id` is not found locally, do not trigger a sync. Show "Record not found" immediately. V2 is push-only — there is no mechanism to fetch a missing record from GKS.

### F5.6 Primary Use Case

Deep linking in V2 is infrastructure for V3 push notifications. No immediate user-facing use case beyond future-proofing.

---

## V2-F6 — Attachment Durability (Staging Area)

### F6.1 Problem

`addAttachment()` copies a blob to disk then inserts a DB row. If the app is killed between those two steps, an orphan blob accumulates with no DB entry. F3.5 orphan cleanup handles this eventually, but the staging area eliminates the window.

### F6.2 Staging Protocol

`addAttachment()` save sequence:

1. Validate (extension, size).
2. Compress if image.
3. Compute SHA-256.
4. Copy blob to `attachments/staging/<sha256>` (staging path).
5. Begin transaction:
   a. INSERT into `attachments` with `blob_path = staging path`.
   b. INSERT into `record_attachments`.
   c. `updateRecord()` to reflect new attachment.
6. Move file from staging to final path `attachments/<xx>/<sha256>`.
7. Update `attachments.blob_path` to final path.

If app is killed between step 4 and step 5: blob in staging, no DB row → cleaned up by startup scan.
If app is killed between step 5 and step 6: DB row points to staging path → file still accessible, move completes on next access or startup.

### F6.3 Startup Staging Cleanup

On `AppShell` mount, alongside `resetInFlightToPending()`:
- Call `cleanStagingDirectory()`.
- Delete any files in `attachments/staging/` that have no matching DB row (SHA-256 not in `attachments` table).
- Files in staging that DO have a DB row: attempt to move to final path (completing an interrupted save).

---

## V2-F7 — Sync Status Endpoint (GKS)

### F7.1 Endpoint

`GET /api/v1/sync/status`

Authentication: MEMBER-level session cookie (same as all other GKS endpoints).

### F7.2 Response

```json
{
  "user_id": "usr-001",
  "synced_record_count": 42,
  "last_record_created": "2026-09-29T10:00:00Z",
  "records": [
    {
      "edge_id": "01927c4a-...",
      "gks_id": "KNOW-000042",
      "content_sha256": "abc123..."
    }
  ]
}
```

### F7.3 Filter

Returns only records where:
- `edge_id` is present in frontmatter (i.e. created via edge sync)
- `created_by_user_id` matches the authenticated user
- `deleted_at` is absent (not deleted)

Uses `scan_records_authorized()` for correct PRIVATE record visibility.

### F7.4 SHA-256 Storage (GKS)

When `POST /api/v1/records` receives a payload with `edge_id`:
- Store `content_sha256` from the payload in the record's YAML frontmatter.
- Pass `preserve_authored_body=True` to `create_human_record()` so body is stored verbatim (no heading prefix added).
- GKS does not recompute SHA-256 — it stores the edge-provided value as the canonical checksum.

### F7.5 Edge Consumption

`syncEngine.ts` calls `GET /api/v1/sync/status` once at the end of each sync run:
- Compare each returned `{edge_id, content_sha256}` against local `records.content_sha256`.
- Mismatch: reset that record's delta to PENDING, increment `retry_count`.
- If `retry_count >= 3` after reset: mark REJECTED with `gks_error = 'CHECKSUM_MISMATCH'`. Surface in StatusDetailScreen.
- Store `last_synced_at = now()` to SecureStore on completion.
- Store `gks_synced_count` to SecureStore for HomeScreen display.

---

## V2-F8 — Checksum Verification

### F8.1 Strategy

Batch verification at end of sync run via sync status endpoint (V2-F7). Not per-record after each ack.

### F8.2 Hash Source

Edge computes `content_sha256` using `expo-crypto` SHA-256 over the raw content string at capture time. GKS stores this value verbatim. Verification compares the stored values — no recomputation on either side.

### F8.3 Body Preservation Requirement

GKS must pass `preserve_authored_body=True` for all edge-originated records. This prevents GKS from prepending `# Title\n\n` to the body, which would cause permanent SHA-256 mismatch.

### F8.4 Mismatch Handling

| retry_count after reset | Action |
|---|---|
| 1–2 | Reset to PENDING. Retry next sync. |
| ≥ 3 | Mark REJECTED. `gks_error = 'CHECKSUM_MISMATCH'`. Surface in StatusDetailScreen with retry button. |

---

## Non-Functional Requirements (V2)

### NF1 — Durability

Every record write is atomic (SQLite transaction). Every attachment save uses the staging area (V2-F6). IN_FLIGHT deltas reset to PENDING on app start. No data loss on app kill at any point in the capture or sync flow.

### NF2 — Accuracy over Speed

Every synced record is checksum-verified (V2-F8). Mismatch resets and retries. Permanent mismatch is surfaced — never silently accepted. This satisfies the hard constraint from ADR-0005.

### NF3 — Idempotency

All sync operations are safe to retry:
- Record creation: GKS returns 409 EDGE_DUPLICATE on duplicate `edge_id` — edge treats as success.
- Attachment upload: GKS deduplicates by SHA-256 — re-uploading the same file is safe.
- Record deletion: GKS returns 404 if already deleted — edge treats as success.

### NF4 — Transparency

User always knows sync state:
- StatusDot: green (idle online), red (offline), pulsing (syncing), amber (rejected deltas exist).
- StatusDetailScreen: pending count, last sync result, rejected record list with per-record retry.
- HomeScreen: "Last synced X min ago" or "Never synced".

### NF5 — No Interruption

Sync never interrupts the user:
- Background sync is silent.
- Sync failures surface passively via StatusDot badge.
- No modal dialogs from sync.

---

## Open Questions (V2)

| ID | Question | Owner |
|---|---|---|
| E8 | tenant_id: GKS has no tenant concept. Edge drops tenantId entirely — userId is the scope. ✅ Resolved | Closed |
| A5 | V1→V2 boundary: tag V1 in git before V2 ships | Harshavardhana P |
| V3 | Bidirectional sync: which record types and fields flow back to edge? | Deferred to V3 |
| V3 | Conflict resolution strategy | Deferred to V3 |

---

## REQ-0011 Disposition

| REQ-0011 Item | V2 status |
|---|---|
| V2-001 Deep Linking + Push | Deep linking ✅ V2-F5. Push notifications → V3. |
| V2-002 GKS Sync | ✅ V2-F1 |
| V2-003 Telemetry Transmission | ✅ Implemented (JSONL to GKS archive) |
| V2-004 Buffer Durability | ✅ Closed — resolved by ADR-0009. Attachment staging (V2-F6) covers remaining gap. |
| V2-005 Biometric Login | → V3 |
| V2-006 Bidirectional Sync | → V3 |
| V2-007 Conflict Resolution | → V3 |
