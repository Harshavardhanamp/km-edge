# REQ-0010: Navigation + App Shell

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P

---

## NAV1 — Navigation Stack Structure

Two top-level stacks, driven by auth state:

### Unauthenticated stack (no valid session)
```
ServerDiscoveryScreen → LoginScreen → LockoutScreen
```

### Authenticated stack
```
Bottom Tab Navigator
  ├── Home tab
  │     HomeScreen
  │       └── RecordDetailScreen (stack push)
  │             └── [modal] TypePickerSheet
  ├── Records tab
  │     RecordsScreen (list + search + type filter)
  │       └── RecordDetailScreen (stack push)
  ├── Calendar tab
  │     CalendarScreen
  │       └── RecordDetailScreen (stack push, KM-Edge events only)
  └── Settings tab
        SettingsScreen
          ├── Account section
          ├── GKS Server section
          ├── Calendar section
          └── Storage section

CaptureScreen (modal, full screen — accessible from Home + Records FAB)
  └── [sheet] TypePickerSheet
StatusDetailScreen (modal — accessible by tapping status dot, any screen)
```

---

## NAV2 — Launch Destination

- Valid session exists → **Home screen always**
- No session → Server discovery (if no URL stored) or Login screen
- App launch is always the same entry point — no "last screen" restoration in V1

---

## NAV3 — Bottom Tab Bar

Four tabs, persistent across all authenticated screens:

| Tab | Icon | Screen |
|---|---|---|
| Home | 🏠 | HomeScreen |
| Records | 📋 | RecordsScreen |
| Calendar | 📅 | CalendarScreen |
| Settings | ⚙️ | SettingsScreen |

- Tab bar always visible in authenticated stack
- Tab bar hidden on: CaptureScreen (full-screen modal), RecordDetailScreen (stack push), StatusDetailScreen (modal)

---

## NAV4 — App-wide Header

Every authenticated screen has a consistent header:

| Element | Position | Detail |
|---|---|---|
| Screen title | Centre | "Home", "Records", "Calendar", "Settings" |
| Status dot | Right | `StatusDot` component — GKS reachable/unreachable |

Exceptions:
- `RecordDetailScreen`: title is the record type (e.g. "Journal"), right has `⋮` menu
- `CaptureScreen`: title is the selected type, right has "Save" button
- `StatusDetailScreen`: title is "GKS Status", no status dot (it IS the status screen)

---

## NAV5 — Back Navigation

Standard stack navigation — back goes to the previous screen in the stack:
- Home → tap record → RecordDetail → back → Home
- Records → tap record → RecordDetail → back → Records
- Calendar → tap KM event → RecordDetail → back → Calendar

Android hardware back button follows the same stack. iOS swipe-back gesture supported.

---

## NAV6 — Records Tab

`RecordsScreen` contains:
- Search bar at top (searches `title` and `content` fields in local SQLite)
- Filter chips below search: All / Journal / Note / Event / Decision / Lesson / Goal / Person
- Paginated scrollable list of records (excluding soft-deleted), ordered by `captured_at` DESC
- Floating action button (FAB) `+` — opens `CaptureScreen` as full-screen modal
- Each row: type icon + title + relative time (same as home screen recent)
- Tap row → `RecordDetailScreen`

---

## NAV7 — Settings Tab Sections

Four sections in V1:

### Account
- Display name (read only — set in GKS)
- GKS user ID (read only)
- Log out button → confirmation dialog → clears session, navigates to Login

### GKS Server
- Current GKS URL (read only)
- "Re-discover server" button → opens ServerDiscoveryScreen as modal

### Calendar
- Calendar source selection (as designed in calendar.md)
- Calendar permission status + "Open Settings" if denied

### Storage
- Device storage used by KM-Edge (records + attachments, computed from SQLite + filesystem)
- "Clear attachment cache" — removes blobs for records that have been soft-deleted and acknowledged (safe to purge)
- No "clear all data" option in V1 (too destructive)

---

## NAV8 — Capture Screen (Modal)

- Presented as a full-screen modal from Home (via capture button) and Records (via FAB)
- Tab bar hidden while capture screen is open
- Type picker sheet appears first if no type is pre-selected
- Back / Cancel → discard dialog if content is non-empty

---

## NAV9 — Status Detail Screen (Modal)

- Presented as a modal when user taps the status dot in any screen header
- Shows: GKS server URL, reachable/unreachable state, last probe time
- V2: will add sync status, pending count, last synced time
- Dismiss by tapping outside or swiping down

---

## NAV10 — Deep Linking (V2 scope)

Not in V1. Added to V2 scope alongside notifications:
- URL scheme: `kmedge://record/<edge_id>`
- Opens `RecordDetailScreen` for the specified record
- Used by push notifications to deep-link into a specific record

Tracked in V2 backlog. No implementation in V1.

---

## NAV11 — Transitions

- Stack pushes: standard slide-from-right (iOS default, matches Android Material)
- Modals (Capture, StatusDetail): slide-from-bottom
- Bottom sheet (TypePicker, AttachmentSource): slide-from-bottom, partial height
- No custom animations in V1 — React Navigation defaults
