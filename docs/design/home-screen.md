# Design: Home Screen

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P  
**Related:** REQ-0002 F4, ADR-0002

---

## Layout Philosophy

**Capture-first.** The app is reached primarily to record something that just happened. The capture button is the dominant element. Everything below it is ambient context — useful at a glance, not requiring interaction.

---

## Full Layout

```
┌─────────────────────────────────────┐
│  👤 Harsha       🟢 GKS · 10m ago  │  ← Header
├─────────────────────────────────────┤
│                                     │
│      ┌───────────────────────┐      │
│      │      + New Record     │      │  ← Primary CTA
│      └───────────────────────┘      │
│                                     │
├─────────────────────────────────────┤
│  Upcoming                           │  ← Calendar strip
│  • Today 2pm  Doctor appt           │
│  • Tomorrow 9am  Team standup       │
│  • Fri  Dad's birthday              │
├─────────────────────────────────────┤
│  Recent                             │  ← Last 5 records
│  📓 Morning reflection   · 2h ago   │
│  ⚡ Chose new laptop     · yesterday│
│  📅 Team offsite         · Mon      │
│  📓 Weekend journal      · Sat      │
│  👤 Met Priya            · Fri      │
└─────────────────────────────────────┘
```

---

## Section Specifications

### Header

| Element | Detail |
|---|---|
| Left | User display name (from GKS login, cached locally) |
| Right | `🟢 GKS · <time ago>` when online and recently synced |
| Right | `🔴 Offline · <N> pending` when GKS unreachable |
| Right | `🟡 Syncing…` during active sync |

GKS availability checked by probing `GET <gks>/api/v1/health` via Tailscale. Probe interval: every 60 seconds when app is in foreground. Status dot tappable — opens sync detail screen.

---

### Capture Button

- Full-width, prominent, centered
- Label: `+ New Record`
- Tap: opens type-picker bottom sheet with all 7 record types:

```
┌─────────────────────────────────────┐
│  What are you capturing?            │
│                                     │
│  📓 Journal      📝 Note            │
│  📅 Event        ⚡ Decision        │
│  💡 Lesson       🎯 Goal            │
│  👤 Person                          │
│                                     │
│  [Cancel]                           │
└─────────────────────────────────────┘
```

User picks type → navigates to the record creation screen for that type.

---

### Upcoming Events Strip

- **Source:** Device native calendar only (iOS EventKit / Android CalendarProvider)
- **Permission:** Requested at app setup; strip is hidden (not errored) if permission denied
- **Range:** Today + next 7 days
- **Limit:** Max 3 entries shown; "See calendar" link opens full calendar view
- **Works offline:** Yes — reads from device calendar, no network needed
- **Tap:** Opens the native calendar entry (not KM-Edge — user already manages their calendar there)

---

### Recent Records

- **Source:** Local cloud-drive store (last 5 records by `captured_at` descending)
- **Works offline:** Yes — reads from locally cached records
- **Each row shows:** Type icon · Title (truncated to ~35 chars) · relative time
- **Tap:** Opens the record detail/edit screen
- **Footer:** "See all records →" navigates to full record list

#### Type Icons

| Type | Icon |
|---|---|
| Journal | 📓 |
| Note | 📝 |
| Event | 📅 |
| Decision | ⚡ |
| Lesson | 💡 |
| Goal | 🎯 |
| Person | 👤 |

---

## What Is NOT on the Home Screen

Deliberately excluded to keep it minimal:

- Search — bottom nav tab
- Record counts / statistics — not in initial release
- GKS-sourced content (e.g. records from other family members) — requires sync pull, deferred to bidirectional sync release
- Notifications / alerts — surfaced by OS, not duplicated in home UI
- Finance, goals summaries — separate nav tabs in later releases

---

## Navigation

Bottom tab bar (persistent across all screens):

| Tab | Screen |
|---|---|
| 🏠 Home | This screen |
| 📋 Records | Full record list + search |
| 📅 Calendar | Full calendar view |
| ⚙️ Settings | Account, storage, sync settings |

Capture button also accessible from Records tab (floating action button).

---

## Data Requirements (what the home screen needs at load)

| Data | Source | Offline? |
|---|---|---|
| Display name | Cached from login | ✅ |
| GKS status + last sync time | Probe + local state.json | 🟡 probe fails gracefully |
| Upcoming events (next 7 days) | Device calendar | ✅ |
| Last 5 records | Local cloud drive cache | ✅ |

Home screen must be fully renderable offline. No spinner blocking the UI — stale data with a "last updated" label is always preferred over a loading state.
