# REQ-0009: Calendar Integration

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Related:** REQ-0002 F3, REQ-0006 RC6

---

## CAL1 — Calendar Permission

- App requests read/write access to device native calendar on first use
- iOS: EventKit (`expo-calendar`)
- Android: CalendarProvider (`expo-calendar`)
- If permission denied: home screen strip hidden (not errored), calendar tab shows permission prompt, EVENT capture toggle hidden
- User can grant permission later from Settings → Calendar

---

## CAL2 — Calendar Source (Home Screen Strip + Full Calendar)

- **Default:** Read from ALL calendars on the device (work, personal, family, subscribed, etc.)
- **User configurable:** In Settings → Calendar, user can deselect specific calendars to exclude
- Selected calendar set persisted in device secure store
- Applied consistently to both home screen strip and full calendar screen

---

## CAL3 — Home Screen Strip

Already specified in home-screen.md. Confirmed in scope:
- Source: device native calendar (user-selected calendars)
- Range: today + next 7 days
- Limit: max 3 entries shown
- Works offline
- Tap: opens native calendar app at that event (not KM-Edge)

---

## CAL4 — Create Calendar Entry from EVENT Record

When saving an EVENT record, a toggle appears in the capture form:

- **Toggle label:** "Add to device calendar"
- **Default:** off (user opts in)
- If toggled on: a native calendar entry is created on save
- The native calendar entry ID (`native_calendar_event_id`) is stored in the EVENT record's local SQLite row (not in GKS frontmatter — edge-only field)
- This ID is used to find and update the entry if the record is later edited

---

## CAL5 — Alerts / Alarms

When "Add to device calendar" is toggled on, an additional field appears:

- **Reminder:** dropdown with options: None / 5 min / 15 min / 30 min / 1 hour / 1 day before
- Default: 30 min before
- Reminder created as a native alarm on the calendar entry
- Uses device native notification system — no custom notification handling needed

---

## CAL6 — Keep Calendar Entry in Sync with EVENT Record

When an EVENT record that has a linked calendar entry (`native_calendar_event_id` is set) is edited:

- App updates the native calendar entry automatically — no user prompt
- Fields synced to calendar entry: title (event name), start date/time, end date/time
- Reminder is NOT re-set on edit (user manages reminder independently after creation)

When an EVENT record with a linked calendar entry is deleted (soft delete):
- The native calendar entry is **deleted** from the device calendar
- User sees a confirmation dialog that mentions this: *"This will also remove the calendar entry. Delete record?"*

---

## CAL7 — Full Calendar Screen

Dedicated Calendar tab. Two-part layout: monthly grid at top, event list below.

### Monthly grid
- Shows current month by default
- Navigation: swipe left/right or prev/next arrows to change month
- Days with events show a dot indicator
- Tapping a day selects it and scrolls the event list to that date

### Event list
- Shows all events for the selected day (or today by default)
- Each entry: time + title + calendar colour dot (from device calendar)
- Tap: opens the native calendar app at that event
- KM-Edge EVENT records with a linked calendar entry appear in the list with a KM-Edge badge

### Source
- Same user-selected calendars as home screen strip (CAL2)
- Works offline (reads device calendar)

---

## CAL8 — edge-only Fields (not synced to GKS)

The following fields are stored in SQLite on the edge but are NOT part of the GKS frontmatter and are NOT synced:

| Field | Purpose |
|---|---|
| `native_calendar_event_id` | Links EVENT record to device calendar entry |
| `has_calendar_entry` | Boolean, quick check without querying calendar |
| `reminder_minutes` | Stored for reference; managed by OS after creation |

These are implementation details of the edge device — GKS has no concept of native calendar entries.

---

## CAL9 — Out of Scope (V1)

- Creating KM-Edge EVENT records from native calendar events (reverse direction)
- Syncing calendar selection preferences to GKS
- Recurring events — native calendar handles recurrence; KM-Edge creates one-time entries only
- Sharing calendar entries with other family members via KM-Edge
