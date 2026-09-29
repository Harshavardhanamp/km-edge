# ADR-0005: Sync Architecture — Delta Log + Append-Only Audit Trail

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Context

Sync is the cornerstone feature. The hard constraints (from REQ-0002 F7 and REQ-0003 NF2):
- Durable at every failure point
- No duplicates in GKS
- Every record checksum-verified after sync
- User sees progress at all times
- Accuracy over speed

## Decision: Append-Only Delta Log

Every write operation on the edge appends an entry to `delta.json` in cloud storage before the operation is considered complete. This log is the ground truth for sync state. It is never compacted or overwritten — only acknowledged entries are skipped on retry.

### Delta Entry Schema

```json
{
  "seq": 1,
  "edge_id": "01927c4a-...",
  "operation": "CREATE",
  "record_type": "KNOWLEDGE",
  "capture_kind": "JOURNAL",
  "timestamp": "2026-09-29T10:00:00Z",
  "content_sha256": "abc123...",
  "attachment_edge_ids": ["01927c4b-..."],
  "status": "PENDING",
  "gks_id": null,
  "gks_acknowledged_at": null,
  "gks_error": null,
  "retry_count": 0
}
```

`status` values: `PENDING` → `IN_FLIGHT` → `ACKNOWLEDGED` | `REJECTED`

### Sync Protocol (Edge → GKS)

1. **Probe:** `GET <gks>/api/v1/health` — if offline, abort and show status
2. **Authenticate:** refresh GKS session (or use stored cookie if still valid)
3. **Load delta:** read `delta.json` from cloud storage; collect all `PENDING` entries in `seq` order
4. **For each entry:**
   a. Mark `IN_FLIGHT` in delta.json (durable write before transmitting)
   b. `POST <gks>/api/v1/knowledge` (or appropriate type endpoint) with full record + `edge_id` field
   c. On GKS success (201): record `gks_id`, `gks_acknowledged_at`; set status `ACKNOWLEDGED`
   d. On GKS conflict (409 with same `edge_id`): GKS already has it → fetch GKS ID from response; mark `ACKNOWLEDGED` (idempotent)
   e. On GKS rejection (400/422): mark `REJECTED` with error; surface to user; continue to next entry
   f. On network error: mark back to `PENDING`; stop batch; retry on next sync trigger
5. **Attachments:** for each `ACKNOWLEDGED` record, sync pending attachments independently (multipart upload to GKS)
6. **Verify:** for each newly acknowledged record, `GET <gks>/api/v1/knowledge/<gks_id>` and compare SHA-256
7. **Update home screen:** last synced timestamp, pending count

### GKS-Side: `edge_id` Deduplication

GKS must index the `edge_id` field and return 409 + existing GKS ID if a record with the same `edge_id` is submitted twice. This prevents duplicates on retry.  
**This requires a GKS API change** — tracked in `docs/design/GKS-API-extensions.md`.

### Conflict Resolution (Future Bidirectional Sync)

Not in initial sync release. Decision deferred to ADR-0008 (not yet written). The open question: if the same record is edited on edge and in GKS before sync, which wins? Likely: GKS wins for PRIVATE records owned by others; user is prompted for their own records.

## Consequences

- `delta.json` grows unboundedly (it's an audit trail by design). A compaction pass (keeping only unacknowledged entries in the live file, archiving acknowledged to `delta_archive_<year>.json`) is a future operational concern.
- Cloud storage write for every local capture (appending to delta.json) requires connectivity to cloud drive at capture time. If cloud drive is also offline, writes are buffered in device memory and flushed when cloud drive reconnects.
- The `IN_FLIGHT` status ensures that a crash during transmission leaves the entry retryable, not silently dropped.

## Addendum — 2026-09-29: V1 Implementation Deviations (ADR-0009 supersedes cloud storage)

**Delta log moved to local SQLite:** ADR-0009 replaced cloud drive with local SQLite. In V1, `delta_log` is a SQLite table in `km-edge.db`, not a `delta.json` file in cloud storage. The schema maps directly: `seq` → `id` (autoincrement), same `operation`/`status` fields. Transmission to GKS is V2 work; V1 only appends.

**Attachment blob purge timing — V1 vs V2:**

In V1, `unlinkAttachment()` in `attachmentStore.ts` ref-counts and physically deletes the blob immediately when an attachment is removed (ref count reaches zero). This differs from the protocol above which implies blobs should be retained until GKS acknowledges the delete delta.

Tradeoff accepted for V1: since V1 never transmits, there is no GKS to acknowledge. Immediate purge is correct for V1.

V2 must change this: when a delete delta is `PENDING` or `IN_FLIGHT`, the blob must be retained so the V2 sync engine can upload the delete record to GKS before purging. Implementation: add a `pending_delete` flag to `attachments` table; purge only after delta reaches `ACKNOWLEDGED`.
