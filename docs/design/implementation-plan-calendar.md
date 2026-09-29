# Implementation Plan: Calendar Integration

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0009  
**Design:** calendar.md  
**Depends on:** Local storage complete, Record capture complete

---

## Prerequisites

- [ ] `expo-calendar` — already declared in `app.json` plugins, install via `npx expo install expo-calendar`

---

## Steps

### Step 1 — Migration `003_calendar_fields.ts`
Adds `native_calendar_event_id`, `has_calendar_entry`, `reminder_minutes` columns to `records` table. Edge-only, never synced to GKS.

### Step 2 — Calendar service (`src/lib/calendar.ts`)
All calendar operations in one module:
- `requestPermission()`, `getAllCalendars()`, `getSelectedCalendarIds()`, `saveSelectedCalendarIds()`
- `getUpcomingEvents(days)`, `getEventsForMonth(year, month)`, `getEventsForDay(date)`
- `createEvent(record, reminderMinutes)` → native event ID
- `updateEvent(nativeEventId, record)`
- `deleteEvent(nativeEventId)`

### Step 3 — EVENT capture form additions (`CaptureScreen`)
Add to "More details" section when `type === EVENT`:
- Event start date+time picker
- Event end date+time picker (optional)
- "Add to calendar" toggle
- Reminder dropdown (shown when toggle ON, default 30 min)
On save: call `calendar.createEvent()` if toggle on, store `native_calendar_event_id`

### Step 4 — EVENT record edit/delete calendar sync (`RecordDetailScreen`)
- On save of edited EVENT: if `has_calendar_entry`, call `calendar.updateEvent()`
- On delete of EVENT with `has_calendar_entry`: show calendar-aware confirmation dialog, call `calendar.deleteEvent()` before soft delete

### Step 5 — Full calendar screen (`src/screens/CalendarScreen.tsx`)
Replaces placeholder:
- Monthly grid: computed from `getEventsForMonth()`, dots on days with events
- Month navigation: prev/next arrows, swipe gesture
- Selected day event list: `getEventsForDay()`, colour dot, KM badge
- Tap non-KM event → `Linking.openURL` to native calendar
- Tap KM-Edge event → navigate to `RecordDetailScreen`
- Permission denied: full-screen prompt

### Step 6 — Calendar settings (`src/screens/SettingsScreen` → Calendar section)
- List all device calendars with colour and checkbox
- Default: all checked
- Persist selection via `calendar.saveSelectedCalendarIds()`
- "Change permission" → `Linking.openSettings()`

### Step 7 — Home screen strip wiring
Update `HomeScreen` to call `calendar.getUpcomingEvents(7)` respecting selected calendar IDs. Already designed — this step completes the wiring.

---

## Definition of Done

- [ ] `useScreenTracking('CalendarScreen')` added
- [ ] Calendar permission requested on first calendar use, not on app launch
- [ ] Home screen strip reads from user-selected calendars, hidden if no permission
- [ ] EVENT capture form shows date/time pickers, calendar toggle, reminder dropdown
- [ ] Creating EVENT with toggle ON creates a native calendar entry with correct time and reminder
- [ ] Editing EVENT updates the linked native calendar entry (title, times)
- [ ] Deleting EVENT with calendar entry shows calendar-aware confirmation, deletes native entry
- [ ] Full calendar screen shows monthly grid with dot indicators
- [ ] Tapping a day shows event list for that day
- [ ] KM-Edge events show `[KM]` badge; tap navigates to record detail
- [ ] Non-KM events tap opens native calendar app
- [ ] Calendar settings lists all device calendars, persists selection
- [ ] All states gracefully handle permission denied
- [ ] TypeScript: zero errors
