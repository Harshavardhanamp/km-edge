# Design: KM-Edge Data Model

**Date:** 2026-09-29  
**Status:** Draft  
**Author:** Harshavardhana P  
**Related ADRs:** ADR-0001, ADR-0004, ADR-0005

---

## Principle

KM-Edge record fields are a strict subset of GKS frontmatter fields. Every record written on the edge must be transmittable to GKS without transformation. One exception: `edge_id` is an extension field not present in GKS schema — GKS is required to accept and index this field (see GKS-API-extensions.md).

---

## Edge Record Envelope (stored in cloud drive as `<edge_id>.json`)

```json
{
  "edge_id": "01927c4a-1234-7xxx-...",        // UUID v7, time-ordered, edge-assigned
  "gks_id": null,                             // null until synced; then e.g. "KNOW-000042"
  "schema_version": 1,                        // always 1
  "type": "KNOWLEDGE",                        // GKS canonical type
  "capture_kind": "JOURNAL",                  // GKS capture_kind value
  "title": "Morning reflection",
  "content": "Today I...",                    // Markdown body
  "created": "2026-09-29",                    // ISO date
  "author": "human",
  "classification": "NORMAL",                // NORMAL or PRIVATE
  "importance": "NORMAL",                     // LOW, NORMAL, HIGH
  "tags": ["reflection", "morning"],
  "life_areas": ["personal"],
  "place": {"name": "Home", "precision": "city"},
  "about": [],                                // list of edge_id or gks_id of PERSON records
  "relationships": [],
  "attachments": [
    {
      "edge_attachment_id": "01927c4b-...",
      "original_filename": "photo.jpg",
      "size_bytes": 204800,
      "sha256": "deadbeef...",
      "mime_type": "image/jpeg",
      "captured_at": "2026-09-29T10:00:00Z",
      "gks_attachment_id": null               // null until synced
    }
  ],
  "captured_at": "2026-09-29T10:00:00Z",     // device local time, ISO8601
  "device_id": "iPhone-XYZ",                 // for diagnostics; not sent to GKS
  "sync_status": "PENDING"                   // PENDING, ACKNOWLEDGED, REJECTED
}
```

---

## GKS Type Mapping Table

| User-facing label | GKS `type` | GKS `capture_kind` | GKS `id` prefix | Notes |
|---|---|---|---|---|
| Journal | `KNOWLEDGE` | `JOURNAL` | `KNOW` | Free-form daily/reflective writing |
| Note | `KNOWLEDGE` | `NOTE` | `KNOW` | Short-form capture |
| Event | `EVENT` | `EVENT` | `EVT` | Something that happened or is planned |
| Decision | `DECISION` | `DECISION` | `DEC` | A choice made with context |
| Lesson | `LESSON` | `LESSON` | `LES` | What was learned |
| Goal | `GOAL` | `GOAL` | `GOAL` | Future-oriented intention |
| Person | `PERSON` | `PERSON` | `PER` | A person record |

**Unmappable types requested:** None. All 7 requested types map cleanly.

**GKS types not exposed in KM-Edge initial release:** `PROJECT`, `QUESTION`, `TOPIC`, `PLACE`, `SOURCE`

---

## Fields That GKS Stamps (Not Set by Edge)

These fields must NOT be set by KM-Edge. GKS stamps them at ingest time:

| Field | GKS behavior |
|---|---|
| `id` | Assigned by GKS (`<PREFIX>-<digits>`) |
| `security_zone` | Always `"KNOWLEDGE"` — GKS hardcodes this |
| `provenance` | Set to `{"method": "EDGE_CAPTURE", "authority": "HUMAN"}` |
| `created_by_user_id` | Stamped from authenticated session |
| `created_by_display_name` | Stamped from authenticated session |

---

## Fields Edge Sends → GKS Must Accept

| Field | Type | Notes |
|---|---|---|
| `edge_id` | string (UUID v7) | Extension field; GKS must index for deduplication |
| `record_type` | string (lowercase) | Wire format only — e.g. `"journal"`, `"note"`, `"event"`. GKS derives `type` and `capture_kind` internally. This is **not** the GKS `type` field (`KNOWLEDGE`/`EVENT`/…). |
| All other fields in Record Envelope above | — | Already valid GKS frontmatter fields |

**Note on `type` field (updated 2026-09-30):** The GKS sync payload does NOT send `type` (the canonical uppercase string like `KNOWLEDGE`). The payload sends `record_type` (lowercase `capture_kind` equivalent, e.g. `"journal"`). GKS maps this to the correct `type` + `capture_kind` internally. The `type` field in the Record Envelope is for edge-local storage and display only.

---

## `classification: PRIVATE` Handling

When user sets a record as PRIVATE:
- Edge stores `classification: PRIVATE` in the envelope
- On sync, edge sends `owner_user_id: <gks_user_id>` (known from login)
- GKS RBAC enforces: only that user and ADMINISTRATORs can see the record
- On edge: PRIVATE records are encrypted with the same key as all records (cloud storage encryption covers this)

---

## Calendar Event Extension

A native calendar event linked to a KM-Edge EVENT record carries:
```json
{
  "native_calendar_event_id": "EKEvent-...",  // iOS/Android native ID; not sent to GKS
  "has_alarm": true,
  "alarm_minutes_before": 30
}
```
These fields are edge-only. Not synced to GKS.

---

## Schema Version

`schema_version: 1` is the only current version. Any breaking change to this schema requires a new ADR and a version bump. KM-Edge must refuse to read records with an unknown schema version.
