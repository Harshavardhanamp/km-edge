# Test Plan: V2 Sync

**Date:** 2026-09-30  
**Status:** Draft  
**Author:** Harshavardhana P  
**Scope:** V2 sync engine — delta transmission, attachment sync, checksum verification, blob purge, failure handling  
**Requirement:** REQ-0003 NF2 (Sync Reliability — highest-priority NFR)  
**Depends on:** GKS running and reachable via Tailscale, KM-Edge logged in

---

## Prerequisites

- GKS instance running, reachable at the configured server URL
- KM-Edge logged in with a valid GKS account
- StatusDot shows green (online)
- `delta_log` is empty at test start (or test creates a clean baseline)

---

## T1 — Happy Path: CREATE sync

**Setup:** Create a new Journal record with title "Sync test 1", no attachments.

| Step | Action | Expected |
|---|---|---|
| T1.1 | Open StatusDetailScreen | Pending count = 1 |
| T1.2 | Tap "Sync now" | StatusDot pulses while syncing |
| T1.3 | Sync completes | StatusDot returns to green; "Last synced: just now" |
| T1.4 | Open StatusDetailScreen | Pending count = 0; synced count = 1 |
| T1.5 | On GKS: `GET /api/v1/knowledge/<gks_id>` | Record exists with correct title, content, created, author, classification |
| T1.6 | On edge: `SELECT gks_id FROM records WHERE title = 'Sync test 1'` | Non-null GKS typed ID (e.g. `KNOW-000042`) |
| T1.7 | On edge: `SELECT status FROM delta_log ORDER BY seq DESC LIMIT 1` | `ACKNOWLEDGED` |

---

## T2 — Idempotency: Re-sync same record (409 dedup)

**Setup:** After T1, force the same CREATE delta to re-transmit.

| Step | Action | Expected |
|---|---|---|
| T2.1 | `UPDATE delta_log SET status='PENDING' WHERE status='ACKNOWLEDGED' AND operation='CREATE'` | — |
| T2.2 | Tap "Sync now" | Sync completes without error |
| T2.3 | On GKS | No duplicate record created; single record with that `edge_id` exists |
| T2.4 | On edge | Delta status = `ACKNOWLEDGED` with same GKS ID as T1.6 |

---

## T3 — Happy Path: DELETE sync (synced record)

**Setup:** After T1, delete the record on edge.

| Step | Action | Expected |
|---|---|---|
| T3.1 | Soft-delete "Sync test 1" from RecordDetailScreen | Record disappears from UI |
| T3.2 | On edge: `SELECT is_deleted, sync_status FROM records WHERE title = 'Sync test 1'` | `is_deleted=1` |
| T3.3 | Tap "Sync now" | Sync completes |
| T3.4 | On GKS: `GET /api/v1/knowledge/<gks_id>` | 404 or record has `deleted_at` set |
| T3.5 | On edge: `SELECT status FROM delta_log WHERE operation='DELETE' ORDER BY seq DESC LIMIT 1` | `ACKNOWLEDGED` |

---

## T4 — DELETE sync (never-synced record)

**Setup:** Create a record, do NOT sync, then delete it.

| Step | Action | Expected |
|---|---|---|
| T4.1 | Create record, skip sync | `delta_log` has PENDING CREATE |
| T4.2 | Delete record immediately | `delta_log` has PENDING CREATE + PENDING DELETE |
| T4.3 | Tap "Sync now" | Sync completes without hitting GKS for either delta |
| T4.4 | On GKS | No record with that `edge_id` exists |
| T4.5 | On edge | Both CREATE and DELETE deltas = `ACKNOWLEDGED`; no gks_id on either |

---

## T5 — UPDATE delta (already-synced record)

**Setup:** After T1, edit the record on edge.

| Step | Action | Expected |
|---|---|---|
| T5.1 | Edit "Sync test 1", change content | `delta_log` gains PENDING UPDATE |
| T5.2 | Tap "Sync now" | Sync completes; no network call to GKS for the UPDATE |
| T5.3 | On edge | UPDATE delta = `ACKNOWLEDGED`; local record retains edited content |
| T5.4 | On GKS | Record content unchanged (GKS is immutable; local edit is edge-only in V2) |

---

## T6 — Attachment sync

**Setup:** Create a record with one image attachment, sync.

| Step | Action | Expected |
|---|---|---|
| T6.1 | Tap "Sync now" | Sync completes |
| T6.2 | On GKS: `GET /api/v1/records/<gks_id>` | Record exists |
| T6.3 | On GKS: attachment visible on the record | Attachment bound to GKS record |
| T6.4 | On edge: `SELECT sync_status, gks_attachment_id FROM attachments` | `SYNCED`, non-null GKS attachment ID |

---

## T7 — Orphaned attachment retry (E gap fix)

**Setup:** Simulate an attachment left PENDING after its record was already synced.

| Step | Action | Expected |
|---|---|---|
| T7.1 | Sync a record (creates ACKNOWLEDGED delta + gks_id) | Record synced |
| T7.2 | `UPDATE attachments SET sync_status='PENDING', gks_attachment_id=NULL` for that record's attachment | — |
| T7.3 | Tap "Sync now" | Orphan retry pass at start of runSync() uploads the attachment |
| T7.4 | On edge | `attachments.sync_status = 'SYNCED'` |
| T7.5 | On GKS | Attachment visible on the record |

---

## T8 — Network drop mid-sync

**Setup:** Queue 3 records (PENDING). Kill Tailscale / network mid-sync.

| Step | Action | Expected |
|---|---|---|
| T8.1 | Tap "Sync now" | First delta goes IN_FLIGHT; network dies |
| T8.2 | Sync run ends | StatusDot returns to red (offline) |
| T8.3 | On edge: `SELECT status FROM delta_log` | First delta = PENDING (reset from IN_FLIGHT); others = PENDING |
| T8.4 | Restore network, tap "Sync now" | All 3 records sync successfully |

---

## T9 — App crash during sync (IN_FLIGHT recovery)

**Setup:** Manually set a delta to `IN_FLIGHT` without completing it.

| Step | Action | Expected |
|---|---|---|
| T9.1 | `UPDATE delta_log SET status='IN_FLIGHT' WHERE status='PENDING' LIMIT 1` | — |
| T9.2 | Re-open app, tap "Sync now" | `resetInFlightToPending()` resets the delta to PENDING |
| T9.3 | Sync completes | Delta transmitted successfully; status = ACKNOWLEDGED |

---

## T10 — GKS rejects a record (400/422)

**Setup:** Craft a delta with invalid data (e.g. tag exceeding 64 chars via direct DB write).

| Step | Action | Expected |
|---|---|---|
| T10.1 | Tap "Sync now" | Sync run continues past the bad record |
| T10.2 | On edge: `SELECT status, gks_error FROM delta_log WHERE …` | `REJECTED`, non-null error message |
| T10.3 | StatusDot | Shows amber (rejected delta present) |
| T10.4 | StatusDetailScreen | Shows the rejected record with error reason and a "Retry" button |
| T10.5 | Fix the data, tap "Retry" | `retry_count` reset to 0, delta re-queued as PENDING |

---

## T11 — Checksum mismatch

**Setup:** After sync, manually corrupt `content_sha256` on a synced record.

| Step | Action | Expected |
|---|---|---|
| T11.1 | `UPDATE records SET content_sha256='aaabbbccc' WHERE gks_id IS NOT NULL LIMIT 1` | — |
| T11.2 | Tap "Sync now" | `verifyChecksums()` runs; detects mismatch |
| T11.3 | First two mismatches | Delta reset to PENDING, `retry_count` incremented |
| T11.4 | Third mismatch | Delta marked `REJECTED` permanently |
| T11.5 | StatusDot | Amber |

---

## T12 — GKS offline at sync time (Tailscale down)

| Step | Action | Expected |
|---|---|---|
| T12.1 | Disconnect Tailscale | StatusDot turns red |
| T12.2 | Tap "Sync now" | Health probe fails; runSync() aborts immediately |
| T12.3 | On edge | No delta status changes; all remain PENDING |
| T12.4 | Reconnect Tailscale | StatusDot turns green |
| T12.5 | Tap "Sync now" | Sync proceeds normally |

---

## T13 — PRIVATE record sync

**Setup:** Create a record with `classification: PRIVATE`, sync.

| Step | Action | Expected |
|---|---|---|
| T13.1 | Tap "Sync now" | Sync completes |
| T13.2 | On GKS: inspect record frontmatter | `classification: PRIVATE`, `owner_user_id` set to the GKS user ID |
| T13.3 | On GKS: access with a different user account | 403 or record not visible |

---

## T14 — Blob purge (Settings → Clear deleted attachments)

**Setup:** After T6, delete the record (triggers DELETE sync + attachment pending-delete).

| Step | Action | Expected |
|---|---|---|
| T14.1 | Delete record, sync | DELETE delta ACKNOWLEDGED |
| T14.2 | On edge: `SELECT pending_delete FROM attachments` | `pending_delete = 1` |
| T14.3 | Settings → "Clear deleted attachments" | Confirmation dialog shown |
| T14.4 | Cancel | No blobs removed |
| T14.5 | Confirm | App probes GKS for the record; blob purged |
| T14.6 | On edge: `SELECT * FROM attachments WHERE pending_delete = 1` | Empty |
| T14.7 | On filesystem | Blob file no longer exists at `attachments/<xx>/<sha256>` |

---

## T15 — Background sync (manual simulation)

**Setup:** Create a record without syncing. Put app in background.

| Step | Action | Expected |
|---|---|---|
| T15.1 | Trigger background fetch manually via Xcode / Android Studio | `runSync()` executes in background |
| T15.2 | Bring app to foreground | StatusDot green; "Last synced: just now" |
| T15.3 | On GKS | Record exists |

---

## T16 — Offline capture, sync when back online

| Step | Action | Expected |
|---|---|---|
| T16.1 | Disconnect network | StatusDot red |
| T16.2 | Create 2 records | Saved locally; `delta_log` has 2 PENDING CREATEs |
| T16.3 | Reconnect | StatusDot triggers foreground sync |
| T16.4 | Sync completes | Both records on GKS; both deltas ACKNOWLEDGED |

---

## Pass Criteria

All 16 test cases pass with no data loss, no duplicate records on GKS, and no PENDING deltas left in an unrecoverable state.
