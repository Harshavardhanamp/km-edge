# Design: Calendar Integration

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Requirement:** REQ-0009  
**Related ADRs:** ADR-0002

---

## Calendar Library

`expo-calendar` — already declared in `app.json` plugins. Handles read/write for both iOS EventKit and Android CalendarProvider with one API.

---

## Calendar Service (`src/lib/calendar.ts`)

Single module, all calendar operations:

```typescript
requestPermission() → Promise<boolean>
getSelectedCalendarIds() → string[]           // from secure store, default = all
saveSelectedCalendarIds(ids: string[]) → void
getAllCalendars() → Promise<Calendar[]>
getUpcomingEvents(days: number) → Promise<CalendarEvent[]>
getEventsForMonth(year: number, month: number) → Promise<CalendarEvent[]>
getEventsForDay(date: Date) → Promise<CalendarEvent[]>
createEvent(record: EventRecord, reminderMinutes: number | null) → Promise<string>  // returns native event ID
updateEvent(nativeEventId: string, record: EventRecord) → Promise<void>
deleteEvent(nativeEventId: string) → Promise<void>
```

`CalendarEvent` shape:
```typescript
{
  nativeId: string
  title: string
  startDate: Date
  endDate: Date | null
  isAllDay: boolean
  calendarId: string
  calendarColor: string    // hex, from device calendar
  kmEdgeRecordId: string | null  // set when event was created by KM-Edge
}
```

---

## Full Calendar Screen Layout

```
┌─────────────────────────────────────┐
│  ← Oct 2026 →                       │  ← month nav
│                                     │
│  Mo Tu We Th Fr Sa Su               │
│            1  2  3  4               │
│   5  6  7  8  9 10 11               │
│  12 13 14 15 •17 18 19              │  ← dot = has events
│  20 21 22 23 24 25 26               │
│  27 28 29 30 31                     │
│                                     │
├─────────────────────────────────────┤
│  Friday, 17 October                 │  ← selected day header
│                                     │
│  🟦 9:00am  Team standup            │  ← calendar colour dot + title
│  🟩 1:00pm  Team lunch    [KM]      │  ← [KM] badge = KM-Edge record
│  🟦 6:00pm  Gym                     │
│                                     │
└─────────────────────────────────────┘
```

- Dot on grid: single dot, one colour (primary accent), regardless of event count
- Selected day highlighted with accent background on the date number
- Event list scrollable independently of grid
- `[KM]` badge on events created from KM-Edge EVENT records
- Tap non-KM event → opens native calendar app
- Tap KM-Edge event → navigates to `RecordDetailScreen` for that EVENT record
- Permission denied state: full screen prompt with "Allow Calendar Access" button

---

## EVENT Capture Form (additions to `CaptureScreen`)

Additional fields shown only when `type === EVENT` inside "More details" section (already specified in record-capture.md RC6 — this formalises the calendar-specific part):

```
  Event start   [17 Oct 2026  1:00pm  ]   ← date+time picker
  Event end     [17 Oct 2026  2:00pm  ]   ← optional
  ─────────────────────────────────────
  Add to calendar        [ toggle OFF ]
  Reminder               [30 min before]  ← shown only when toggle is ON
```

- Reminder options: None / 5 min / 15 min / 30 min / 1 hour / 1 day
- Toggle default: OFF
- Reminder default: 30 min before (pre-selected, user can change)

---

## Calendar Entry Lifecycle

### On EVENT record save (toggle ON)
1. `calendar.createEvent(record, reminderMinutes)`
2. Store returned `native_calendar_event_id` in SQLite `records` table (edge-only column)
3. Set `has_calendar_entry = true`

### On EVENT record edit
1. Check `has_calendar_entry` flag
2. If true: `calendar.updateEvent(native_calendar_event_id, updatedRecord)`
3. Fields updated: title, start date/time, end date/time
4. Reminder NOT updated (user manages in native calendar)

### On EVENT record delete
1. Check `has_calendar_entry` flag
2. `softDeleteRecord()` in `recordStore.ts` attempts `calendar.deleteEvent(native_calendar_event_id)` silently — all calendar errors are caught and ignored (permission revoked or event already gone does not block the delete).
3. No separate confirmation dialog for the calendar entry. The standard record-delete confirmation in the UI covers the action. (Updated 2026-09-30 — REQ-0012 F4.3 supersedes the earlier dialog approach.)

---

## SQLite Schema Additions

Two edge-only columns added to the `records` table via migration `003_calendar_fields.ts`:

```sql
ALTER TABLE records ADD COLUMN native_calendar_event_id TEXT;
ALTER TABLE records ADD COLUMN has_calendar_entry INTEGER NOT NULL DEFAULT 0;
ALTER TABLE records ADD COLUMN reminder_minutes INTEGER;
```

These columns are populated only for EVENT records with calendar entries. Never synced to GKS.

---

## Calendar Settings Screen (Settings → Calendar)

```
┌─────────────────────────────────────┐
│  Calendar                           │
│                                     │
│  Show calendars                     │
│  ─────────────────────────────────  │
│  ✅ Personal (blue)                 │
│  ✅ Work (green)                    │
│  ✅ Family (orange)                 │
│  ✅ Indian Holidays (grey)          │
│                                     │
│  Calendar permission    [Change]    │
└─────────────────────────────────────┘
```

- All calendars listed with their device colour
- All checked by default (CAL2)
- User unchecks to hide a calendar from home strip and full calendar screen
- Selection saved to `expo-secure-store`
- "Change" → opens device Settings app at KM-Edge calendar permission page

---

## Permission Denied States

| Surface | Behaviour |
|---|---|
| Home screen strip | Section hidden entirely, no error shown |
| Calendar tab | Full-screen prompt: "KM-Edge needs calendar access" + "Open Settings" button |
| EVENT capture toggle | Toggle hidden, not shown at all |
| Calendar Settings | Permission status shown with "Open Settings" button to re-enable |
