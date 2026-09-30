# REQ-0008: Observability

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P

---

## Overview

Three-layer observability system:

| Layer | Who sees it | Where data lives |
|---|---|---|
| Edge telemetry collection | Nobody (raw local buffer) | Device SQLite |
| GKS admin dashboard | GKS ADMINISTRATOR role | GKS instance (per-tenant) |
| Super admin dashboard | Super admin only | Central observability server (VPS) |

Telemetry flows: **Edge → GKS (via sync, V2) → Central server (via GKS push)**

---

## OB1 — What is Tracked on the Edge

All four categories tracked from V1 day one. Stored locally, pushed via V2 sync.

### OB1.1 Session
- `session_id` — UUID v7, generated on each app launch
- `user_id` — GKS user ID (from login)
- `session_start` — ISO8601 timestamp
- `session_end` — ISO8601 timestamp (recorded on app background/close)
- `session_duration_seconds` — computed on close
- `device_platform` — `ios` | `android`
- `app_version` — KM-Edge version string

**Note:** `tenant_id` was dropped (REQ-0012 E8 resolution). GKS has no tenant concept — `user_id` is the scope. The `telemetry_events` table stores an empty string for the column that remains for schema compatibility; the column will be removed in a future migration.

### OB1.2 Screen visits
Per screen visit within a session:
- `screen_name` — e.g. `Home`, `CaptureScreen`, `RecordDetail`, `Settings`
- `entered_at` — ISO8601
- `exited_at` — ISO8601
- `duration_seconds`

### OB1.3 Actions
Per discrete user action:
- `action` — enum (see list below)
- `timestamp` — ISO8601
- `metadata` — JSON object with action-specific context (no PII, no content)

Action enum:
```
record_created      { type, capture_kind }
record_edited       { type }
record_deleted      { type }
attachment_added    { mime_type, size_bytes }
attachment_removed  {}
capture_type_changed { from, to }
calendar_permission_granted {}
calendar_permission_denied  {}
gks_probe_online    {}
gks_probe_offline   {}
sync_triggered      {}           -- V2
sync_completed      { records_synced, attachments_synced, duration_seconds }  -- V2
sync_failed         { error_code }  -- V2
```

### OB1.4 Errors
Per error event:
- `error_code` — short string identifier
- `error_message` — sanitised message (no user content, no file paths)
- `screen_name` — where it occurred
- `timestamp` — ISO8601
- `is_crash` — boolean

---

## OB2 — Local Storage of Telemetry

- Stored in the same SQLite database (`km-edge.db`) in a `telemetry_events` table
- Events appended on occurrence — no batching delay on the edge
- Events remain in the table until GKS acknowledges receipt (V2 sync)
- Telemetry events are **not** part of the delta log — separate table, separate sync path

---

## OB3 — Telemetry Transport

- **V1:** Collected and stored locally. Not yet transmitted. No separate telemetry channel in V1.
- **V2:** `flushTelemetry()` in `syncEngine.ts` posts batches of up to 200 events per sync run to `POST /api/v1/telemetry/events` on GKS (Ext 8 — see `GKS-API-extensions.md`). Events are marked `transmitted = 1` on acknowledgement. The `km_edge_*` observability tables on GKS are a V3 admin dashboard design item — not built in V2.
- **GKS → Central server:** GKS pushes telemetry to the central server independently on a schedule (e.g. hourly). This is a GKS-side push, not edge-initiated. **V3.**

---

## OB4 — GKS Admin Dashboard (per-tenant)

Accessible to GKS `ADMINISTRATOR` role only. Shows full detail for their own tenant:

- Active users: DAU / WAU / MAU with trend
- Per-user breakdown: sessions by date, duration, screens visited, actions taken, errors
- Feature usage: record types created (counts by type), screens most visited
- Error log: all errors by user, screen, timestamp
- Sync health (V2): pending records per user, last sync time, sync errors

Real user IDs visible to GKS admin — they are the family admin with full visibility into their instance.

**Implementation:** New section in GKS admin panel. Reads from GKS observability tables. GKS-side work, tracked in `GKS-API-extensions.md`.

---

## OB5 — Central Observability Server

A new lightweight server operated on a VPS (DigitalOcean / Hetzner).

### OB5.1 Tenant registration
- GKS instances self-register with the central server on first contact
- Registration: `POST /tenants/register` with GKS instance URL, a generated `tenant_id`, and a `registration_secret` (pre-shared or generated)
- Central server issues a `tenant_api_key` used for all subsequent pushes

### OB5.2 Data received from GKS
GKS pushes aggregated telemetry to the central server. Central server receives:
- `tenant_id`
- `user_id` (real, not hashed — super admin can see individuals)
- All session, screen, action, and error events (as per OB1)

### OB5.3 Super admin dashboard
Accessible to super admin only (separate auth, not GKS credentials):

| View | Content |
|---|---|
| Tenant list | All registered GKS instances, last seen, active user count |
| DAU / WAU / MAU | Per tenant and aggregate across all tenants |
| Feature usage | Record types, screens, actions — per tenant and global |
| Error rates | Per tenant, per error code, trend over time |
| Sync health (V2) | Pending records, last sync, sync errors per tenant |
| Per-user drill-down | Session history, actions, errors for a specific user across sessions |

### OB5.4 Technology (central server)
- **Runtime:** Python (FastAPI) — consistent with GKS tech stack
- **Database:** SQLite for V1 (single VPS, modest scale — family app, not enterprise)
- **Auth:** Simple API key for GKS push; username + password for super admin dashboard
- **Upgrade path:** SQLite → PostgreSQL if scale demands it (YAGNI for now)

---

## OB6 — Privacy Boundaries

| Boundary | Rule |
|---|---|
| Edge → GKS | No record content in telemetry. No file names, titles, or user-written text. Metadata only. |
| GKS admin | Full detail including real user IDs. GKS admin is trusted (family admin). |
| GKS → Central server | Real user IDs transmitted. Super admin can see individual behaviour. |
| Central server | Super admin only — not visible to GKS-level administrators of other tenants. |

---

## OB7 — Scope by Release

**Updated 2026-09-30:** REQ-0012 moved GKS admin dashboard and central server to V3. Edge telemetry transmission (Edge → GKS) remains V2.

| Component | V1 | V2 | V3 |
|---|---|---|---|
| Edge telemetry collection + local storage | ✅ | — | — |
| Edge → GKS telemetry transmission | ❌ | ✅ (batched with sync) | — |
| GKS observability tables + admin dashboard | ❌ | ❌ | ✅ |
| GKS → Central server push | ❌ | ❌ | ✅ |
| Central server + super admin dashboard | ❌ | ❌ | ✅ |

---

## OB8 — Impact on Other Features

- Every screen in KM-Edge must fire `screen_visit` events on mount/unmount
- Every user action must fire the corresponding `action` event
- Error boundaries must capture and log `error` events
- This is a cross-cutting concern — affects every implementation plan
