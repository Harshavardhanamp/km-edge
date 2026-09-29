# Design: GKS API Extensions Required for KM-Edge Sync

**Date:** 2026-09-29  
**Status:** Draft — changes needed in GKS repo  
**Author:** Harshavardhana P

---

## Overview

KM-Edge sync requires one extension to the GKS API and one new endpoint. These changes must be made in the `generational-knowledge-system` repo before sync can be implemented.

---

## Extension 1: `edge_id` Field Acceptance and Deduplication

**Change:** GKS must accept an `edge_id` field in the frontmatter of any incoming record (via `POST /api/v1/knowledge` or type-specific endpoints) and store it. On subsequent `POST` with the same `edge_id`, GKS must return:

```
HTTP 409 Conflict
{
  "error": "duplicate_edge_id",
  "gks_id": "KNOW-000042",
  "edge_id": "01927c4a-..."
}
```

This enables idempotent sync retry without creating duplicates.

**GKS file to change:** `src/generational_kb/archive.py` (create record path), `src/generational_kb/api/knowledge.py` (POST handler), `src/generational_kb/indexing.py` (index edge_id for lookup).

---

## Extension 2: Sync Status Endpoint

**New endpoint:** `GET /api/v1/sync/status`

Returns the GKS-side view of synced records for a user, to support the edge home screen "last synced" display and the verification step (NF2).

```json
{
  "user_id": "usr-001",
  "last_sync_at": "2026-09-29T10:00:00Z",
  "synced_record_count": 42,
  "recent": [
    {"gks_id": "KNOW-000042", "edge_id": "01927c4a-...", "sha256": "abc..."}
  ]
}
```

**Authentication:** MEMBER-level session cookie (same as all other API endpoints).

---

## Extension 3: Batch Ingest Endpoint (Optional, Performance)

**New endpoint:** `POST /api/v1/sync/batch`

Accepts a list of up to 50 records in one request. Returns per-record results (acknowledged/rejected). Reduces round-trips on first sync of a device with many pending records.

This is optional for the initial sync release — single-record POST works. Add when sync performance becomes a measured problem.

---

## GKS Change Tracking

These extensions should be filed as issues in the `generational-knowledge-system` repo and implemented before KM-Edge sync development begins. The `edge_id` deduplication (Extension 1) is a hard prerequisite for sync correctness.
