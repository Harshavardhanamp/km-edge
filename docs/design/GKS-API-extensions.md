# Design: GKS API Extensions for KM-Edge Sync

**Date:** 2026-09-30 (rewritten — original 2026-09-29 draft was stale against REQ-0012)
**Status:** Reflects actual GKS implementation as of V2
**Author:** Harshavardhana P

---

## Status Summary

| Extension | Status | Notes |
|---|---|---|
| Ext 1: `edge_id` dedup on `POST /api/v1/records` | ✅ Implemented | 409 body is `{detail, record_id}` |
| Ext 2: `GET /api/v1/sync/status` | ✅ Implemented | New router in `sync_status.py` |
| Ext 3: `content_sha256` in frontmatter | ✅ Implemented | Accepted by `create_human_record` + `create_direct_record` |
| Ext 4: `preserve_authored_body` | ✅ Already unconditional | `knowledge.py` passes it always — no change needed |
| Ext 5: `DELETE /api/v1/records/{record_id}` | ✅ Implemented | Soft-delete; 204 success, 404 already gone |
| Ext 6: Attachment upload + bind endpoints | ✅ Existing GKS feature | Used as-is |
| Ext 7: `ALLOWED_EXT` expanded | ✅ Implemented | 23 extensions including heic/mp4/mov/mp3/m4a |
| Ext 8: Telemetry ingest endpoint | ✅ Implemented | `POST /api/v1/telemetry/events` |
| Ext 9: Batch ingest | ❌ Not built | YAGNI — single-record POST is sufficient |
| Ext 10: GKS admin dashboard (KM-Edge usage) | ❌ V3 | Deferred per REQ-0012 |
| Ext 11: GKS → Central server push | ❌ V3 | Deferred per REQ-0012 |

---

## Ext 1 — `edge_id` Deduplication on Record Creation

**Endpoint:** `POST /api/v1/records`

**GKS files:** `app.py` (lines 633–641), `knowledge.py`, `archive.py`

On POST, if `edge_id` is present in the payload, GKS scans existing records for a matching `edge_id`. If found:

```
HTTP 409
{ "detail": "EDGE_DUPLICATE", "record_id": "KNOW-000042" }
```

Edge treats 409 as success: extracts `record_id`, acknowledges the delta with that ID, proceeds to attachment upload.

**Request model fields sent by edge:**

```python
class DirectCaptureRequest(StrictModel):
    record_type: str          # lowercase: "journal", "note", "event", etc.
    capture_kind: str         # uppercase: "JOURNAL", "NOTE", etc.
    title: str | None
    content: str
    tags: list[str]
    importance: str           # "LOW" | "NORMAL" | "HIGH"
    classification: str       # "NORMAL" | "PRIVATE"
    life_areas: list[str]
    place: PlaceInput | None
    about: list[str]
    relationships: list[str]
    edge_id: str | None
    content_sha256: str | None
    preserve_authored_body: bool  # always True from edge
```

**201 response (relevant fields):**

```json
{
  "record": {
    "id": "KNOW-000042",
    "edge_id": "01927c4a-..."
  }
}
```

Edge reads `record.id` as `gks_record_id`.

---

## Ext 2 — Sync Status Endpoint

**Endpoint:** `GET /api/v1/sync/status`

**GKS file:** `src/generational_kb/api/sync_status.py` (router registered in `app.py`)

**Authentication:** MEMBER-level session cookie.

**Response:**

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

Returns only non-deleted records where `edge_id` is in frontmatter and `created_by_user_id` matches the caller. Used by `verifyChecksums()` at the end of each sync run.

---

## Ext 3 — `content_sha256` in Frontmatter

**GKS files:** `archive.py` (`create_human_record`), `knowledge.py` (`create_direct_record`), `app.py` (`DirectCaptureRequest`)

Both creation functions accept `content_sha256: str | None`. If provided, stored verbatim in YAML frontmatter. GKS does not recompute it — the edge-provided value is canonical.

---

## Ext 4 — `preserve_authored_body`

**GKS file:** `knowledge.py` line 86

`create_direct_record` passes `preserve_authored_body=True` unconditionally inside GKS — it does not read the value from the edge payload. The edge also sends `preserve_authored_body: true` in every POST, but this is redundant: GKS ignores the incoming value and hardcodes `True` regardless.

**Why the edge still sends it:** defensive — if a future GKS change makes the field conditional, the edge payload will already carry the correct value. Removing it from the edge payload would be a silent behaviour dependency on GKS internals. Leave as-is.

**Effect:** prevents GKS prepending `# Title\n\n` to the body, which would corrupt the `content_sha256` checksum comparison in `verifyChecksums()`.

---

## Ext 5 — Soft Delete

**Endpoint:** `DELETE /api/v1/records/{record_id}`

**GKS file:** `app.py` (lines 716–735)

Sets `deleted_at` and `deleted_by` in YAML frontmatter. File stays on disk (audit trail). `scan_records()` filters deleted records from all queries.

| Response | Edge action |
|---|---|
| 204 | Acknowledge delta, purge blobs after ack |
| 404 | Treat as success (already deleted) — acknowledge, purge blobs |
| 500 | Reset delta to PENDING, retry next run |
| Network error | Reset delta to PENDING, stop this sync run |

---

## Ext 6 — Attachment Endpoints

**Upload:** `POST /api/v1/attachments/workflow/NEW_ENTRY`
- Multipart POST: `file` field + `entity_ref=gks_record_id` parameter
- Response: `{ attachment_id, sha256 }`
- Edge compares `response.sha256` with local sha256; mismatch → `sync_status = FAILED`

**Bind:** `POST /api/v1/attachments/records/{gks_record_id}/attachments/{gks_attachment_id}`
- Called after successful upload + checksum match
- Links attachment to its GKS record

Both require session cookie auth.

---

## Ext 7 — `ALLOWED_EXT` Expansion

**GKS file:** `src/generational_kb/attachments.py`

Current set (23 extensions):
```
pdf txt md rtf csv json doc docx xls xlsx ppt pptx
jpg jpeg png webp gif svg heic mp4 mov mp3 m4a
```

Edge `validate.ts` enforces the same set.

---

## Ext 8 — Telemetry Ingest

**Endpoint:** `POST /api/v1/telemetry/events`

**Authentication:** MEMBER-level session cookie.

Called by `flushTelemetry()` in `syncEngine.ts` — up to 200 events per call.

**Request body:**

```json
{
  "events": [
    {
      "id": "123",
      "user_id": "usr-001",
      "session_id": "01927c4a-...",
      "event_type": "action",
      "action": "record_save",
      "metadata": {},
      "occurred_at": "2026-09-30T10:00:00Z"
    }
  ]
}
```

On 200: edge marks event rows `transmitted = 1`. On any failure: rows stay `transmitted = 0`, retry next sync run.

---

## Ext 9 — Batch Ingest (Not Built)

Not implemented. Single-record POST with `edge_id` dedup is sufficient. Add if sync round-trip latency becomes a measured problem.

---

## Ext 10 & 11 — GKS Admin Dashboard + Central Server Push (V3)

Deferred to V3 per REQ-0012. Not in scope until V3 design phase.
