# Implementation Plan: Observability

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0008  
**Design:** observability.md

---

## Part A — KM-Edge App (V1)

Depends on: Local storage complete (SQLite exists)

### Step 1 — Telemetry table migration (`src/lib/db/migrations/002_telemetry.ts`)
Adds `telemetry_events` table to existing `km-edge.db`. Run via migration runner.

### Step 2 — Telemetry service (`src/lib/telemetry.ts`)
Singleton. Non-blocking fire-and-forget writes to SQLite.
Methods: `sessionStart`, `sessionEnd`, `screenEnter`, `screenExit`, `action`, `error`.
Reads `user_id` and `tenant_id` from secure store (set at login).

### Step 3 — Screen tracking hook (`src/lib/useScreenTracking.ts`)
`useScreenTracking(screenName)` — one-line addition to every screen.
Uses `useFocusEffect` from React Navigation.

### Step 4 — Error boundary (`src/components/ErrorBoundary.tsx`)
Class component wrapping the app root. Catches render errors, logs via telemetry, shows friendly error screen with retry.
Global runtime error handler wired in `App.tsx`.

### Step 5 — Wire telemetry into all existing screens + actions
Add `useScreenTracking` to every screen.
Add `telemetry.action()` calls to every user action (record save, delete, attachment add/remove, type change, etc).
This step runs in parallel with or immediately after each feature sprint.

---

## Part B — Central Observability Server (V3, separate repo)

**Deferred to V3 per REQ-0012 (2026-09-30).** Steps 6–10 below are the approved design but will not be implemented until V3.


### Step 6 — Create `gks-central-obs` repo
New Python FastAPI project. SQLite database. Minimal — no framework bloat.

### Step 7 — Tenant registration endpoint
`POST /tenants/register` — GKS self-registers, receives `tenant_api_key`.
Store tenant + hashed key in SQLite.

### Step 8 — Event ingestion endpoint
`POST /tenants/{tenant_id}/events` — receives batch of telemetry events from GKS.
Validates `tenant_api_key`. Inserts events into `events` table.

### Step 9 — Super admin dashboard
Simple web UI (server-rendered with Jinja2 or a minimal SPA).
Views: tenant list, DAU/WAU/MAU, feature usage, error rates, per-user drill-down.
Auth: username + password (Argon2id), session cookie.

### Step 10 — Deploy to VPS
Dockerfile + systemd unit. Deploy to DigitalOcean / Hetzner droplet.
HTTPS via Let's Encrypt (Caddy or nginx).

---

## Part C — GKS Extensions (V3, tracked in GKS repo)

**Deferred to V3 per REQ-0012 (2026-09-30).**


### Step 11 — GKS observability tables + admin dashboard
New tables in GKS: `km_edge_sessions`, `km_edge_actions`, `km_edge_errors`.
New admin panel tab: "KM-Edge Usage" with per-user detail.
ADMINISTRATOR role only.
Tracked in `docs/design/GKS-API-extensions.md`.

### Step 12 — GKS → Central server push (V2)
Hourly job in GKS: reads new telemetry events, pushes to central server.
Runs after V2 sync is implemented.

---

## Definition of Done

**KM-Edge app:**
- [ ] `telemetry_events` table created by migration
- [ ] `useScreenTracking` added to every screen (Home, Capture, Detail, Records, Calendar, Settings, Login, Discovery, Lockout)
- [ ] `telemetry.action()` fired for every user action
- [ ] Error boundary wraps app root, logs crashes to telemetry
- [ ] Session start/end fires on app launch/background
- [ ] All events stored with `transmitted = 0` in SQLite

**Central server:**
- [ ] Tenant self-registration working
- [ ] Event ingestion endpoint accepts GKS batch push
- [ ] Super admin can log in and see tenant list
- [ ] DAU/WAU/MAU chart rendering per tenant
- [ ] Feature usage and error rate views working
- [ ] Deployed to VPS with HTTPS

**Updated checklist for all future implementation plans:**
Every screen's definition of done must include:
- [ ] `useScreenTracking('ScreenName')` added
- [ ] All actions on screen fire `telemetry.action()`
