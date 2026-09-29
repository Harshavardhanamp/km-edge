# Implementation Plan: Home Screen

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0002 F4  
**Design:** home-screen.md  
**ADRs:** ADR-0002, ADR-0009, ADR-0010  
**Depends on:** Login implementation complete (navigation stack exists)

---

## Note on Sequencing

Home screen implementation comes after local storage is built (SQLite layer). The recent records section reads from SQLite. This plan assumes the storage layer exists — if built before storage, recent records uses an empty placeholder until storage is wired.

---

## Steps

### Step 1 — `src/components/StatusDot.tsx`
Small header component. Props: `reachable: boolean`. Shows `🟢 GKS reachable` or `🔴 GKS unreachable`. Tappable — opens `StatusDetailScreen`. V1 only shows reachability — no sync state yet.

### Step 2 — `src/screens/StatusDetailScreen.tsx`
Simple screen: GKS server URL, reachable/unreachable state, last probe time. No sync info in V1. Accessible by tapping the status dot from any screen.

### Step 3 — GKS health probe service (`src/lib/gksProbe.ts`)
- `probeGks(url)` → `'reachable' | 'unreachable'`
- Runs every 60 seconds when app is in foreground
- Uses `expo-network` to skip probe when device has no connectivity (fast fail)
- Result stored in lightweight in-memory state, consumed by `StatusDot`

### Step 4 — Upcoming events (`src/lib/calendar.ts`)
- `requestCalendarPermission()` → `boolean`
- `getUpcomingEvents(days: 7)` → array of `{ title, startDate, isAllDay }`
- Reads from device native calendar via `expo-calendar`
- Returns empty array (not error) if permission denied

### Step 5 — `src/screens/HomeScreen.tsx` (full implementation)
Replaces the current scaffold/mock version:
- Header: display name (from secure store) + `StatusDot`
- Capture button: full-width, opens type-picker bottom sheet (7 types)
- Upcoming strip: calls `calendar.getUpcomingEvents()`, shows max 3, hidden if empty or permission denied
- Recent records: reads last 5 from SQLite, each row shows icon + title + relative time, tap → record detail
- "See all records →" footer link
- Fully renderable offline — no loading spinners, stale data preferred

### Step 6 — Navigation wiring for home screen
- Status dot tap → `StatusDetailScreen` (modal or stack push)
- Recent record tap → `RecordDetailScreen` (built in record capture sprint)
- "See all records" → `RecordsScreen`
- Capture type pick → `RecordCaptureScreen` with type pre-selected (built in record capture sprint)
- For now: record detail and capture screens show placeholder until their sprint

---

## Definition of Done

- [ ] Header shows display name and status dot on every screen
- [ ] Status dot reflects GKS reachability, updates every 60s
- [ ] Capture button opens type-picker with all 7 types
- [ ] Upcoming strip shows next 7 days from device calendar, max 3 entries, hidden if no permission
- [ ] Recent records shows last 5 from local SQLite by `captured_at`
- [ ] Tapping a record row navigates to record detail (placeholder acceptable until record sprint)
- [ ] Home screen fully renderable offline with zero spinners
- [ ] TypeScript: zero errors
