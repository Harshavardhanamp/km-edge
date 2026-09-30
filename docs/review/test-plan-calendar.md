# Test Plan: Calendar Integration

**Date:** 2026-09-30  
**Status:** Draft  
**Scope:** Calendar permission, event capture, calendar screen, EVENT record lifecycle  
**Requirement:** REQ-0009, REQ-0002 F3  

---

## Prerequisites

- Logged in
- Device has at least one calendar configured

---

## CAL1 — Permission: Grant

| Step | Action | Expected |
|---|---|---|
| CAL1.1 | First launch with calendar not yet granted | Calendar tab shows full-screen prompt "KM-Edge needs calendar access" |
| CAL1.2 | Tap "Allow calendar access" | System permission dialog shown |
| CAL1.3 | Grant permission | Calendar tab shows month grid + event list |
| CAL1.4 | Home screen strip | Upcoming events visible |

---

## CAL2 — Permission: Deny

| Step | Action | Expected |
|---|---|---|
| CAL2.1 | Deny calendar permission | Calendar tab shows "Open Settings" prompt |
| CAL2.2 | Home screen | Calendar strip section hidden entirely (no error) |
| CAL2.3 | EVENT capture screen | "Add to calendar" toggle hidden |
| CAL2.4 | Settings → Calendar | Permission status shown with "Open Settings" link |

---

## CAL3 — Calendar Screen

| Step | Action | Expected |
|---|---|---|
| CAL3.1 | Open Calendar tab | Month grid shown; dot on dates with events |
| CAL3.2 | Tap a date with events | Event list below grid updates; selected date highlighted |
| CAL3.3 | Tap month nav arrows | Grid advances/retreats one month |
| CAL3.4 | Events from device calendar shown | Correct colour dot from device calendar |
| CAL3.5 | KM-Edge event shows [KM] badge | Badge visible on event row |
| CAL3.6 | Tap non-KM event | Native calendar app opens |
| CAL3.7 | Tap KM-Edge event | RecordDetailScreen for that EVENT record opens |

---

## CAL4 — Create EVENT Record with Calendar Entry

| Step | Action | Expected |
|---|---|---|
| CAL4.1 | Capture screen, select type EVENT | Date/time fields appear in "More details" |
| CAL4.2 | Set start date/time | Stored on record |
| CAL4.3 | Set end date/time (optional) | Stored on record |
| CAL4.4 | Toggle "Add to calendar" ON | Reminder field appears (default 30 min) |
| CAL4.5 | Change reminder to 1 hour | Stored |
| CAL4.6 | Save record | Native calendar entry created; `[KM]` badge appears on calendar |
| CAL4.7 | Check SQLite | `has_calendar_entry = 1`, `native_calendar_event_id` set, `reminder_minutes = 60` |

---

## CAL5 — Edit EVENT Record

| Step | Action | Expected |
|---|---|---|
| CAL5.1 | Edit EVENT, change title | Native calendar event title updated |
| CAL5.2 | Edit EVENT, change start time | Native calendar event updated |
| CAL5.3 | Edit EVENT, change reminder | Reminder NOT updated in native calendar (user manages in native calendar) |

---

## CAL6 — Delete EVENT Record with Calendar Entry

| Step | Action | Expected |
|---|---|---|
| CAL6.1 | Delete EVENT record | Standard record-delete confirmation dialog shown (one dialog, not two) |
| CAL6.2 | Confirm delete | Record soft-deleted; native calendar entry deleted silently |
| CAL6.3 | Calendar revoked mid-delete | Delete succeeds; calendar error ignored |
| CAL6.4 | Event already deleted from native calendar | Delete succeeds; calendar error ignored |

---

## CAL7 — Calendar Settings

| Step | Action | Expected |
|---|---|---|
| CAL7.1 | Settings → Calendar | All device calendars listed with their colour |
| CAL7.2 | Uncheck a calendar | That calendar's events hidden from home strip and calendar tab |
| CAL7.3 | Recheck | Events reappear |
| CAL7.4 | Selection persisted | After app restart, selection preserved |

---

## Pass Criteria

Permission granted/denied states handled correctly on all surfaces. EVENT records create native calendar entries with correct reminder. Delete cleans up native entry silently. Calendar settings persist correctly.
