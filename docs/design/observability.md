# Design: Observability

**Date:** 2026-09-29  
**Status:** Superseded 2026-10-06 by ADR-0013 and GKS contract v1 §7 (implemented in K5). Kept for history.  
**Author:** Harshavardhana P  
**Requirement:** REQ-0008

## Current behaviour (K5, 2026-10-06)

`src/lib/telemetry.ts` records device sync health only:

- `telemetry.syncRun({ result, durationMs, counts })` — once per `runSync`: `completed | aborted_network | aborted_auth`, a duration bucket (`lt1s | lt5s | lt30s | gte30s`) and counts (`created, updated, deleted, attachments, rejected`).
- `telemetry.error(category)` — a contract §8 code or `network | storage | contract | other`. Anything else becomes `other`; messages, stacks and screens are never stored. `ErrorBoundary` and the global error handler record `other`.
- `capture_count` (`by_type` over live records of contract types) is computed when a batch is built, not stored per capture.

Rows carry no user, session, device or record id; GKS derives identity from the bearer session. `flushTelemetry` sends ≤ 200 events to `POST /api/v1/edge/telemetry` and marks rows transmitted only after `200`. A `422 EDGE_VALIDATION` batch is dropped so it can't block later ones. Other failures keep the rows queued. Legacy rows outside the vocabulary are deleted, never sent. Screen tracking (`useScreenTracking`), session start/end and action events are removed.

The rest of this document describes the superseded REQ-0008 design.

---

## Architecture

```
KM-Edge (device)
  └── telemetry_events table (SQLite)
        └── V2 sync ──→ GKS instance (per-tenant)
                            ├── GKS admin dashboard (ADMINISTRATOR role)
                            └── hourly push ──→ Central Observability Server (VPS)
                                                  └── Super admin dashboard
```

---

## Edge: SQLite Schema

### Table: `telemetry_events`

```sql
CREATE TABLE telemetry_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  event_type    TEXT NOT NULL,   -- session_start | session_end | screen_enter |
                                 -- screen_exit | action | error
  event_name    TEXT NOT NULL,   -- screen name or action enum value
  timestamp     TEXT NOT NULL,   -- ISO8601
  metadata      TEXT NOT NULL DEFAULT '{}',  -- JSON, no PII
  transmitted   INTEGER NOT NULL DEFAULT 0   -- 0=pending, 1=sent to GKS
);

CREATE INDEX idx_telemetry_pending ON telemetry_events(id)
  WHERE transmitted = 0;
```

`transmitted` flag set to 1 by V2 sync after GKS acknowledges receipt.

---

## Edge: Telemetry Service (`src/lib/telemetry.ts`)

Thin singleton, fire-and-forget. All methods are non-blocking — they write to SQLite asynchronously and never throw to the caller.

```typescript
telemetry.sessionStart()
telemetry.sessionEnd()
telemetry.screenEnter(screenName: string)
telemetry.screenExit(screenName: string)
telemetry.action(action: ActionEvent)
telemetry.error(error: ErrorEvent)
```

Session state tracked in memory: `session_id`, `session_start`, current screen enter time.

---

## Edge: Screen Tracking Pattern

Every screen uses a single hook:

```typescript
// src/lib/useScreenTracking.ts
export function useScreenTracking(screenName: string) {
  useFocusEffect(useCallback(() => {
    telemetry.screenEnter(screenName);
    return () => telemetry.screenExit(screenName);
  }, []));
}
```

One line added to every screen — no per-screen boilerplate.

---

## Edge: Error Boundary

```typescript
// src/components/ErrorBoundary.tsx
// Wraps the entire app. On unhandled render error:
// telemetry.error({ error_code: 'RENDER_ERROR', is_crash: true, ... })
// Shows a friendly error screen with retry button
```

Runtime (non-render) errors caught via global handler in `App.tsx`.

---

## GKS Admin Dashboard

New tab in GKS admin panel: **"KM-Edge Usage"**

Reads from new GKS tables: `km_edge_sessions`, `km_edge_screen_visits`, `km_edge_actions`, `km_edge_errors`.

Views:
- **Overview:** DAU/WAU/MAU chart, top screens, top actions, error rate
- **Users:** table of users, session count, last active, total duration
- **User detail:** click through to per-user session timeline, actions, errors
- **Errors:** filterable error log by user, screen, date

GKS-side implementation tracked in `GKS-API-extensions.md`.

---

## Central Observability Server

**Stack:** FastAPI + SQLite → upgradeable to PostgreSQL  
**Hosting:** VPS (DigitalOcean / Hetzner)  
**Repo:** Separate repo `gks-central-obs` (to be created)

### API surface

```
POST /tenants/register          ← GKS self-registration
POST /tenants/{tenant_id}/events ← GKS pushes telemetry batch (hourly)
GET  /dashboard                 ← Super admin web UI (server-side rendered or SPA)
```

### Data model (central server SQLite)

```sql
-- Tenants
CREATE TABLE tenants (
  tenant_id     TEXT PRIMARY KEY,
  gks_url       TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL    -- hashed API key for push auth
);

-- All events (denormalised for query simplicity at small scale)
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  event_name  TEXT NOT NULL,
  timestamp   TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_events_tenant_ts ON events(tenant_id, timestamp DESC);
CREATE INDEX idx_events_user ON events(user_id, timestamp DESC);
```

### Super admin dashboard views

| View | Query |
|---|---|
| Tenant list | `SELECT tenant_id, COUNT(DISTINCT user_id), MAX(timestamp) FROM events GROUP BY tenant_id` |
| DAU/WAU/MAU | Session events grouped by date, per tenant and global |
| Feature usage | Action events grouped by event_name |
| Error rates | Error events grouped by event_name, per tenant |
| Per-user drill-down | All events for a given user_id |

### Auth
- GKS → Central server: `tenant_api_key` in `Authorization: Bearer` header
- Super admin dashboard: username + password (stored as Argon2id hash in central server config)
- No GKS credentials involved — separate auth system

---

## Cross-Cutting Implementation Note

OB8 from REQ-0008 applies to every feature sprint:

- Every screen: add `useScreenTracking('ScreenName')` — one line
- Every save/delete/action: add `telemetry.action(...)` — one line
- App root: wrap with `ErrorBoundary`

This is low effort per screen but must not be forgotten. Checklist added to each implementation plan's definition of done.
