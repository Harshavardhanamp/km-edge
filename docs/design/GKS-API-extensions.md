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

## Extension 4: Telemetry Ingest + Admin Dashboard (REQ-0008)

### 4a — Telemetry ingest endpoint
**New endpoint:** `POST /api/v1/km-edge/telemetry`

Accepts batch of telemetry events from the edge (via V2 sync).
MEMBER-level auth (user pushes their own events).

Stores in new GKS tables: `km_edge_sessions`, `km_edge_screen_visits`, `km_edge_actions`, `km_edge_errors`.

### 4b — Admin dashboard tab: "KM-Edge Usage"
ADMINISTRATOR role only. Shows:
- DAU/WAU/MAU per user
- Per-user session timeline, actions, screen visits, errors
- Feature usage breakdown
- Error log

### 4c — Central server push
Hourly background job in GKS pushes telemetry to the central observability server.
`POST <central_server>/tenants/{tenant_id}/events` with `tenant_api_key`.
GKS self-registers with central server on first push if not yet registered.

**GKS files to add/change:**
- New tables: migration in `src/generational_kb/` 
- New endpoint: `src/generational_kb/api/observability.py`
- New admin UI: `frontend/src/pages/admin/KMEdgeUsage.tsx`
- New background job: `src/generational_kb/km_edge_telemetry_push.py`

---

## GKS Change Tracking

All extensions should be filed as issues in the `generational-knowledge-system` repo.

| Extension | Priority | When needed |
|---|---|---|
| Extension 1: `edge_id` dedup | Hard prerequisite | Before V2 sync |
| Extension 2: Sync status endpoint | Required | Before V2 sync |
| Extension 3: Batch ingest | Optional performance | After V2 sync ships |
| Extension 4: Telemetry + admin dashboard | Required | V2 (telemetry batched with sync) |
