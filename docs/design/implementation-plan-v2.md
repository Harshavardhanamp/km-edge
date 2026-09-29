# Implementation Plan: V2 — Sync, Attachments, Deep Linking

**Date:** 2026-09-29
**Status:** Draft
**Author:** Harshavardhana P
**Requirement:** REQ-0012
**Design:** v2-sync-engine.md, v2-attachment-sync.md, v2-deep-linking.md, v2-sync-status.md

---

## Prerequisites Before Starting

- [ ] V1 tagged in git before any V2 work begins (Open Question A5)
- [ ] GKS repo accessible for server-side changes (Phases 2 and 6 touch GKS only)
- [ ] `expo-background-fetch` already installed (verify in package.json)

---

## Phase 1 — Foundation (no UI, no GKS changes)

### Step 1 — Migration 003 (`src/lib/db/migrations/003_v2_attachment_sync.ts`)
- New migration file following the `try/catch ALTER TABLE` pattern from `002_v2.ts`
- Add `sync_status TEXT NOT NULL DEFAULT 'PENDING'` to `attachments`
- Add `sync_error TEXT` to `attachments`
- Add `delete_delta_seq INTEGER` to `attachments`
- Create partial index `idx_attachments_purge_eligible` on `attachments(edge_attachment_id) WHERE pending_delete = 1`
- Create partial index `idx_attachments_sync_status` on `attachments(sync_status) WHERE sync_status = 'PENDING'`
- Insert row into `schema_migrations`
- Register `migration003` call in the migration runner (wherever `migration002` is called)
- **Complexity:** S
- **Depends on:** nothing

### Step 2 — `deltaStore.ts` — add `resetDeltaToPending(seq)`
- **File:** `src/lib/db/deltaStore.ts`
- Add `resetDeltaToPending(seq: number): void` — sets `status = 'PENDING'`, `gks_error = NULL`, increments `retry_count` for that single row
- Needed by checksum mismatch handling (Step 11) and the user-triggered Retry button (Step 24)
- Gap reference: sync-engine.md Gap 12
- **Complexity:** S
- **Depends on:** nothing

### Step 3 — `attachmentStore.ts` — `unlinkAttachment` and `sync_status` writes
- **File:** `src/lib/db/attachmentStore.ts`
- `unlinkAttachment()`: after setting `pending_delete = 1`, query `delta_log` for the most recent DELETE delta for `edge_id` and write its `seq` as `delete_delta_seq` (attachment-sync.md Section 5.3)
- Any new attachment insert (if handled here): ensure `sync_status = 'PENDING'` is explicit in the INSERT (the migration default covers existing rows; new inserts should be unambiguous)
- Gap reference: attachment-sync.md Gap 2
- **Complexity:** S
- **Depends on:** Step 1

---

## Phase 2 — GKS Server Changes

### Step 4 — GKS: store `content_sha256` in frontmatter
- **Files (GKS repo):** `archive.py` (`create_human_record`), `knowledge.py` (`create_direct_record`), `app.py` (Pydantic request model)
- Add `content_sha256: str | None = None` to `create_human_record` signature; store in metadata dict alongside `edge_id` if present
- Thread `content_sha256` parameter through `create_direct_record`
- Add `content_sha256: str | None = None` to the `POST /api/v1/records` request model; pass it into `create_direct_record`
- No DB migration — stored in YAML frontmatter only
- Gap reference: sync-status.md Gap 9, Gap 10
- **Complexity:** S
- **Depends on:** nothing (GKS-side only)

### Step 5 — GKS: sync status endpoint
- **Files (GKS repo):** new `src/generational_kb/api/sync_status.py`, `app.py`
- Create `sync_status.py` with `GET /api/v1/sync/status` router (sync-status.md Section 3 for exact implementation)
- Filter to `edge_id` present + `created_by_user_id` matches caller + `deleted_at` absent
- Return `user_id`, `synced_record_count`, `last_record_created`, `records[]` with `edge_id`, `gks_id`, `content_sha256`
- Register router in `app.py` alongside existing router imports and `include_router` calls
- Gap reference: sync-status.md Gap 11
- **Complexity:** S
- **Depends on:** Step 4 (so `content_sha256` is available in frontmatter at query time)

### Step 6 — GKS: attachment extension list
- **File (GKS repo):** `src/generational_kb/attachments.py`
- Add `heic`, `mp4`, `mov`, `mp3`, `m4a` to `ALLOWED_EXT` (attachment-sync.md Section 9.3)
- Verify exact constant name and current contents before applying
- Gap reference: attachment-sync.md Gap 13
- **Complexity:** S
- **Depends on:** nothing (independent GKS change)

---

## Phase 3 — Sync Engine Fixes (the core)

### Step 7 — Fix `gksCaptureType()` → lowercase
- **File:** `src/lib/sync/syncEngine.ts`
- Change all map values from uppercase (`'JOURNAL'`, `'NOTE'`, …) to lowercase (`'journal'`, `'note'`, …)
- Add fallback `'note'` for unknown values
- Gap reference: sync-engine.md Gap 1
- **Complexity:** S
- **Depends on:** nothing

### Step 8 — Fix sync payload: `record_type`, `content_sha256`, `preserve_authored_body`
- **File:** `src/lib/sync/syncEngine.ts`, `syncDelta()` payload construction block
- Remove separate `capture_kind` field; set `record_type: gksCaptureType(record.capture_kind)` (lowercase via Step 7)
- Remove `record_type: record.type` (wrong — this is the local SQLite column, not the GKS field)
- Add `content_sha256: record.content_sha256`
- Add `preserve_authored_body: true`
- Gap reference: sync-engine.md Gap 2, Gap 3
- **Complexity:** S
- **Depends on:** Step 7

### Step 9 — Fix DELETE delta error handling
- **File:** `src/lib/sync/syncEngine.ts`, `syncDelta()` DELETE branch
- Auth failure (`res === null` after re-auth): stop sync, emit `session_expired` — do not reject the delta
- HTTP 500: reset delta to PENDING, continue to next delta
- Network exception (thrown): reset delta to PENDING, return sentinel to stop remaining deltas this run
- Add `markInFlight(delta.seq)` guard confirmation for never-synced path (verify no regression per sync-engine.md Gap 5)
- Gap reference: sync-engine.md Gap 4, Gap 11
- **Complexity:** M
- **Depends on:** nothing (but logically after Step 8 to work on a clean payload)

### Step 10 — Fix `uploadAttachments()`: `sync_status`, SHA-256 check, purge timing
- **File:** `src/lib/sync/syncEngine.ts`, `uploadAttachments()`
- Filter qualifying attachments by `sync_status = 'PENDING'` (not just absence of `gks_attachment_id`)
- After 200/201 response: compare `body.sha256` vs local `attachments.sha256`
  - Mismatch → `sync_status = 'FAILED'`, `sync_error = 'CHECKSUM_MISMATCH'`; skip bind step
  - Match → proceed to bind call, then `sync_status = 'SYNCED'`, `gks_attachment_id = <id>`, `sync_error = NULL`
- Network error: leave `sync_status = 'PENDING'` (no change)
- GKS 400: `sync_status = 'FAILED'`, `sync_error = <reason>`
- Fix blob purge: replace unconditional purge with the join query:
  ```
  SELECT a.edge_attachment_id FROM attachments a
  JOIN delta_log d ON d.seq = a.delete_delta_seq
  WHERE a.pending_delete = 1 AND d.status = 'ACKNOWLEDGED'
  ```
- Gap reference: sync-engine.md Gap 6, Gap 7; attachment-sync.md Gap 6, Gap 7
- **Complexity:** M
- **Depends on:** Step 1 (columns), Step 3 (unlinkAttachment writes delete_delta_seq)

### Step 11 — Add `verifyChecksums()` and call at end of `runSync()`
- **File:** `src/lib/sync/syncEngine.ts`
- Add `verifyChecksums(baseUrl: string): Promise<void>` — calls `GET /api/v1/sync/status`, iterates returned `records[]`, compares `content_sha256` against local `records.content_sha256`
- On mismatch: call `resetDeltaToPending(seq)` (Step 2); if `retry_count >= 3` after increment, reject with `gks_error = 'CHECKSUM_MISMATCH'`
- Records absent from GKS response: no action
- Call `verifyChecksums()` at the end of `runSync()` after `flushTelemetry()`
- Gap reference: sync-engine.md Gap 8; sync-status.md Gap 5
- **Complexity:** M
- **Depends on:** Step 2, Step 5 (GKS endpoint must exist)

### Step 12 — Write `last_synced_at` and `gks_synced_count` to SecureStore
- **File:** `src/lib/sync/syncEngine.ts`, `src/lib/secureStore.ts`
- Add `LAST_SYNCED_AT` and `GKS_SYNCED_COUNT` to the `KEYS` constant in `secureStore.ts`
- In `runSync()`, after `verifyChecksums()` completes successfully: write `KEYS.LAST_SYNCED_AT = now().toISOString()` and `KEYS.GKS_SYNCED_COUNT = String(count)`
- Write only on completion — do not write if the sync status call itself fails
- Gap reference: sync-engine.md Gap 9; sync-status.md Gap 7
- **Complexity:** S
- **Depends on:** Step 11

### Step 13 — Fix `buildAuthHeaders`: direct import, no dynamic import
- **File:** `src/lib/sync/syncEngine.ts`
- Replace `await import('../gksClient')` with a direct static import of `authHeaders` from `gksClient.ts`
- If circular dependency exists: move `authHeaders` logic into `src/lib/auth/headers.ts` and import from there in both `syncEngine.ts` and `gksClient.ts`
- Gap reference: sync-engine.md Gap 10
- **Complexity:** S
- **Depends on:** nothing

---

## Phase 4 — Attachment Durability (Staging Area)

### Step 14 — `cleanStagingDirectory()` function
- **File:** `src/lib/db/attachmentStore.ts` (or `src/lib/attachments/stagingCleanup.ts` if preferred for isolation)
- List all files under `attachments/staging/`
- For each file (filename = sha256):
  - No DB row → `FileSystem.deleteAsync()` (orphan staging file)
  - DB row, `blob_path` is staging path → move file to `attachments/<xx>/<sha256>`, update `blob_path` in DB
  - DB row, `blob_path` is final path → delete the leftover staging copy
- Algorithm from attachment-sync.md Section 3.3
- Gap reference: attachment-sync.md Gap 5
- **Complexity:** S
- **Depends on:** Step 1 (schema), Step 3 (consistent DB row shape)

### Step 15 — `addAttachment()` / `saveAttachment()` — staging protocol
- **Files:** `src/lib/db/attachmentStore.ts` (`saveAttachment()`), `src/lib/attachments/attachmentService.ts` (`addAttachment()`)
- Replace direct-copy-then-insert with the 7-step staging protocol (attachment-sync.md Section 3.1):
  1. Validate (extension, size)
  2. Compress if image
  3. Compute SHA-256
  4. Copy blob to `attachments/staging/<sha256>`
  5. DB transaction: `INSERT INTO attachments` with staging path + `sync_status = 'PENDING'`; `INSERT OR IGNORE INTO record_attachments`; `updateRecord()`
  6. Move file from staging to `attachments/<xx>/<sha256>`
  7. `UPDATE attachments SET blob_path = <final path>`
- If staging logic is entirely inside `saveAttachment()`, the gap in `addAttachment()` closes automatically
- Gap reference: attachment-sync.md Gap 3, Gap 4
- **Complexity:** M
- **Depends on:** Step 1 (schema), Step 14 (staging dir exists before first use)

### Step 16 — AppShell: call `cleanStagingDirectory()` on mount
- **File:** `src/navigation/AppShell.tsx` (or wherever `resetInFlightToPending()` is called on mount)
- Add `cleanStagingDirectory()` call alongside `resetInFlightToPending()` in the mount effect, before any user interaction
- Gap reference: attachment-sync.md Gap 5; REQ-0012 F6.3
- **Complexity:** S
- **Depends on:** Step 14

---

## Phase 5 — `attachment_edge_ids` Population

### Step 17 — Calendar cleanup on soft delete + populate `attachment_edge_ids`
- **File:** `src/lib/db/recordStore.ts`
- `softDeleteRecord()`: before inserting the DELETE delta, attempt `deleteEvent(record.native_calendar_event_id)` if `record.has_calendar_entry === 1`; catch and ignore all errors (attachment-sync.md Section 5.2 / REQ-0012 F4.3)
- `createRecord()`: after inserting into `records` and `record_attachments`, query `record_attachments` for current attachment IDs, JSON-stringify, pass to `delta_log` INSERT (replacing `'[]'` literal)
- `updateRecord()`: same — query at delta INSERT time to reflect current attachment set
- `softDeleteRecord()`: query `record_attachments` at deletion time, store IDs in DELETE delta; after inserting DELETE delta, back-fill `delete_delta_seq` on any `pending_delete = 1` attachments for this record where `delete_delta_seq IS NULL` (attachment-sync.md Section 8.2)
- Gap reference: attachment-sync.md Gap 9, Gap 10; REQ-0012 F2.4, F4.3
- **Complexity:** M
- **Depends on:** Step 1 (delete_delta_seq column), Step 3 (unlinkAttachment writes seq)

---

## Phase 6 — Deep Linking

### Step 18 — `app.json`: register `kmedge` scheme
- **File:** `app.json`
- Add `"scheme": "kmedge"` under the `expo` key
- Gap reference: deep-linking.md Section 2
- **Complexity:** S
- **Depends on:** nothing

### Step 19 — `RootNavigator.tsx` / `AppShell.tsx`: Linking config + URL handler
- **File:** `src/navigation/RootNavigator.tsx`
- Add module-level `let pendingDeepLinkUrl: string | null = null`
- On mount: call `Linking.getInitialURL()`, parse with `parseRecordUrl`, store in `pendingDeepLinkUrl` if non-null
- On mount: add `Linking.addEventListener('url', handleUrl)` listener; remove on unmount
- `handleUrl`: parse URL, look up record via `getRecord(edge_id)`, navigate to `RecordDetail` or show toast + navigate to HomeScreen
- Add `useEffect([sessionValid])`: when `sessionValid` becomes true, consume `pendingDeepLinkUrl` and execute same lookup-navigate logic
- Add `navigationRef` to `NavigationContainer` for navigation outside React tree
- Gap reference: deep-linking.md Section 3, Section 4, Section 6
- **Complexity:** M
- **Depends on:** Step 18, Step 20

### Step 20 — `parseRecordUrl()` utility
- Inline in `RootNavigator.tsx` (extract to `src/lib/deepLink.ts` only if reused elsewhere — not needed in V2)
- Returns `edge_id` string if URL matches `kmedge://record/<uuid>`, `null` for any other input including malformed URLs
- Gap reference: deep-linking.md Section 6
- **Complexity:** S
- **Depends on:** nothing

### Step 21 — Cold start: pending URL buffer through auth flow
- Covered by the `pendingDeepLinkUrl` module variable and `useEffect([sessionValid])` wired in Step 19
- No additional file changes required
- Gap reference: deep-linking.md Section 4
- **Complexity:** S (included in Step 19)
- **Depends on:** Step 19

---

## Phase 7 — UI Wiring

### Step 22 — `StatusDot.tsx`: pulsing animation during sync, amber state
- **File:** `src/components/StatusDot.tsx`
- Add `'syncing'` and `'rejected'` to the `gksState` prop type (or a new `syncState` prop — choose whichever the existing component shape supports cleanly)
- Pulsing: use `Animated.loop` + `Animated.sequence` on opacity while `gksState === 'syncing'`
- Amber dot when `gksState === 'rejected'` (one or more REJECTED deltas); amber takes precedence over green
- Offline (red) takes precedence over all other states
- Gap reference: sync-engine.md Section 7.1; REQ-0012 NF4
- **Complexity:** M
- **Depends on:** nothing (the component exists; this extends it)

### Step 23 — HomeScreen: "Last synced X min ago" label + auto-refresh after sync
- **File:** `src/screens/HomeScreen.tsx`
- Add `lastSyncedAt` state read from `KEYS.LAST_SYNCED_AT` (SecureStore)
- Add `gksSyncedCount` state read from `KEYS.GKS_SYNCED_COUNT`
- Convert current `useEffect` to `useFocusEffect` so values refresh when navigating back to HomeScreen
- Render `"Last synced X min ago"` (or `"Never synced"`) below the StatusDot row
- After sync completes, call `getRecentRecords()` to refresh the record list
- Gap reference: sync-status.md Section 7, Gap 8; REQ-0012 F1.8
- **Complexity:** S
- **Depends on:** Step 12 (SecureStore keys must exist and be written)

### Step 24 — `StatusDetailScreen.tsx`: rejected delta list + per-record Retry button
- **File:** `src/screens/StatusDetailScreen.tsx`
- Add `rejectedDeltas` state, populated by SQL query joining `delta_log` and `records` where `status = 'REJECTED'`
- Add `gksSyncedCount` row reading from `KEYS.GKS_SYNCED_COUNT`
- Add `lastSyncedAt` row reading from `KEYS.LAST_SYNCED_AT`
- Render rejected delta list: record title, `gks_error` reason, Retry button per row
- Retry handler: `UPDATE delta_log SET status = 'PENDING', retry_count = 0, gks_error = NULL WHERE seq = ?` then trigger `runSync()`
- Expand `relTime` in this file to handle hours and days (or extract shared `relTime` to `src/lib/formatTime.ts` and use in both screens)
- Gap reference: sync-status.md Section 8, Gap 1–4; REQ-0012 F1.7
- **Complexity:** M
- **Depends on:** Step 12, Step 2 (resetDeltaToPending available for Retry)

---

## Order Rationale

Phase 1 has no external dependencies and establishes the schema and store primitives everything else builds on. Phase 2 is GKS-side work that can proceed in parallel with Phase 3 on a separate branch; Phase 3 Step 11 and Step 12 gate on Phase 2 Step 5 being deployed. Phase 4 (staging) is independent of Phases 2 and 3 and can be developed in parallel. Phase 5 must come after Phase 1 (delete_delta_seq column). Phases 6 and 7 are UI-only and can be worked in parallel with any Phase 3/4/5 item; Phase 7 Step 23 and Step 24 require Phase 3 Step 12 to be complete for SecureStore values to be present.

---

## Definition of Done

- [ ] Migration 003 runs on fresh install and upgrade without error
- [ ] `sync_status`, `sync_error`, `delete_delta_seq` columns present in `attachments` table
- [ ] `gksCaptureType()` returns lowercase strings; verified against GKS record creation
- [ ] GKS payload includes `record_type` (lowercase), `content_sha256`, `preserve_authored_body: true`; no `capture_kind` field
- [ ] DELETE delta: auth fail stops sync and emits `session_expired`; 500/network resets to PENDING
- [ ] Attachment upload sets `sync_status` correctly for all outcomes; SHA-256 comparison present
- [ ] Blob purge only fires after DELETE delta reaches ACKNOWLEDGED
- [ ] `verifyChecksums()` calls `GET /api/v1/sync/status`; checksum mismatch retries up to 3 times then rejects
- [ ] `last_synced_at` and `gks_synced_count` written to SecureStore after each successful sync run
- [ ] `buildAuthHeaders` uses direct import (no dynamic import)
- [ ] Staging area protocol in `addAttachment()` / `saveAttachment()`; `cleanStagingDirectory()` called on AppShell mount
- [ ] `softDeleteRecord()` attempts `deleteEvent()` when `has_calendar_entry = 1`; ignores calendar failure
- [ ] `attachment_edge_ids` populated correctly in all three record mutation functions
- [ ] `softDeleteRecord()` back-fills `delete_delta_seq` on pending-delete attachments
- [ ] GKS `content_sha256` stored in frontmatter for edge-originated records
- [ ] GKS `GET /api/v1/sync/status` endpoint returns correct shape and filters to caller's records
- [ ] GKS `ALLOWED_EXT` includes `heic`, `mp4`, `mov`, `mp3`, `m4a`
- [ ] `kmedge` scheme registered in `app.json`
- [ ] Warm-start deep link navigates to RecordDetail or shows "Record not found" toast
- [ ] Cold-start deep link survives auth flow and navigates after session restore
- [ ] AppShell foreground trigger: `AppState 'active'` fires `runSync()` when GKS is reachable
- [ ] StatusDot pulses during sync; shows amber when any delta is REJECTED
- [ ] HomeScreen shows "Last synced X min ago" label; refreshes recent records after sync
- [ ] StatusDetailScreen lists REJECTED deltas with per-record Retry button
- [ ] TypeScript: zero errors
