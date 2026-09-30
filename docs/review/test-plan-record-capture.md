# Test Plan: Record Capture & Storage

**Date:** 2026-09-30  
**Status:** Draft  
**Scope:** Creating, editing, viewing, deleting records; attachment capture; home screen  
**Requirement:** REQ-0002 F1, REQ-0006, REQ-0007  

---

## Prerequisites

- Logged in (online or offline)
- Home screen visible

---

## RC1 — Create Record: All Types

For each type (Journal, Note, Event, Decision, Lesson, Goal, Person):

| Step | Action | Expected |
|---|---|---|
| RC1.1 | Tap quick-capture button | Capture screen opens with default type |
| RC1.2 | Select type | Correct capture_kind set; type-specific fields shown (e.g. date fields for Event) |
| RC1.3 | Enter title + content | No errors |
| RC1.4 | Tap Save | Record saved; navigates back |
| RC1.5 | Record appears on home screen | Correct title and type badge |
| RC1.6 | Check delta_log | PENDING CREATE entry exists with correct operation and capture_kind |

---

## RC2 — Mandatory Fields

| Step | Action | Expected |
|---|---|---|
| RC2.1 | Attempt to save with empty title | Validation error shown; save blocked |
| RC2.2 | Title auto-derived from first content line | If title field empty and content present, title = first line |

---

## RC3 — Optional Fields

| Step | Action | Expected |
|---|---|---|
| RC3.1 | Add tags (comma-separated) | Tags stored; shown on record detail |
| RC3.2 | Set importance to HIGH | Stored and shown |
| RC3.3 | Select life areas (multiselect) | Stored and shown |
| RC3.4 | Set place (free text) | Stored and shown |
| RC3.5 | Set classification to PRIVATE | Record marked PRIVATE; shown with lock indicator |

---

## RC4 — Edit Record

| Step | Action | Expected |
|---|---|---|
| RC4.1 | Open record, tap Edit | Capture screen pre-filled with existing values |
| RC4.2 | Change title, save | Title updated on record detail and home screen |
| RC4.3 | Check delta_log | PENDING UPDATE entry exists |
| RC4.4 | Edit a synced record (has gks_id) | UPDATE delta created; note that edit is edge-local only in V2 |

---

## RC5 — Delete Record

| Step | Action | Expected |
|---|---|---|
| RC5.1 | Long-press or swipe record | Delete option shown |
| RC5.2 | Confirm delete | Record disappears from list |
| RC5.3 | Check records table | `is_deleted = 1`, `deleted_at` set |
| RC5.4 | Check delta_log | PENDING DELETE entry |
| RC5.5 | Search / list | Deleted record not visible anywhere |

---

## RC6 — Attachments: Add

| Step | Action | Expected |
|---|---|---|
| RC6.1 | In capture/edit, tap attachment button | Source picker shown (Files, Camera, Gallery, Scan) |
| RC6.2 | Pick a JPG from gallery | Preview shown; size and filename visible |
| RC6.3 | Pick a PDF from Files | Added; filename shown |
| RC6.4 | Pick a video (mp4) from Files | Accepted; video icon shown |
| RC6.5 | Attempt to pick a .zip | Inline error naming the file and listing accepted types |
| RC6.6 | Attempt to pick a file >50MB | Inline error "exceeds the 50MB per-file limit" |
| RC6.7 | Add 10 attachments | All accepted |
| RC6.8 | Attempt 11th attachment | Inline error "up to 10 attachments" |

---

## RC7 — Attachments: Remove

| Step | Action | Expected |
|---|---|---|
| RC7.1 | Long-press attachment on record detail | "Remove attachment?" dialog |
| RC7.2 | Cancel | Attachment unchanged |
| RC7.3 | Confirm | Attachment removed from list |
| RC7.4 | If attachment was last reference | Blob purged from filesystem (live record — immediate purge) |
| RC7.5 | If attachment shared with another record | Blob retained |

---

## RC8 — Home Screen

| Step | Action | Expected |
|---|---|---|
| RC8.1 | Home screen after fresh login | Recent records shown (up to 5); GKS status dot visible |
| RC8.2 | Create a record | Appears at top of recent list |
| RC8.3 | Home screen offline | All recent records still visible |
| RC8.4 | Quick-capture shortcut | One tap starts new record |

---

## RC9 — Record Detail

| Step | Action | Expected |
|---|---|---|
| RC9.1 | Tap record from home or list | Detail screen opens with all fields |
| RC9.2 | Attachments section | Images render as thumbnails; tap opens full-screen |
| RC9.3 | PDF attachment | Filename + icon; tap opens in device viewer |
| RC9.4 | Video/audio attachment | Filename + icon; tap opens in device media player |
| RC9.5 | PRIVATE record | Lock badge visible; accessible only to logged-in user |

---

## Pass Criteria

All 7 record types create correctly. Mandatory field validation blocks incomplete saves. All attachment accept/reject rules work. Delete correctly soft-deletes and hides records. Home screen always shows most recent records.
