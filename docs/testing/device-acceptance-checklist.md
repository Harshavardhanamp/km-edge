# Device Acceptance Checklist — KM-Edge 2.0.0 against GKS 2.1.0

**Status:** Frozen template. Copy to `device-acceptance-<date>.md`, fill one column per device.
**Preconditions:** GKS 2.1.0 running behind Tailscale Serve (or a scratch server reachable from the phone); an Administrator and a Member account; Family Access → Connect a phone available; Ollama running on the server (for title suggestions); phone on the tailnet.

Mark each row PASS / FAIL / N/A with a note. Every FAIL blocks `v2.0.0`.

## S0 — Setup and login

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| 0.1 | Fresh install, open app | Discovery screen offers Enter address and Scan QR only; no spinner/scan | | |
| 0.2 | Enter MagicDNS name without scheme | "Connect to *<display name>*?" with https URL shown | | |
| 0.3 | Enter wrong address | Clear "Couldn't reach…" with Try again / Scan QR | | |
| 0.4 | Scan QR from Family Access (in-app scanner) | Same confirmation card | | |
| 0.5 | Scan QR with OS camera | Opens KM-Edge at confirmation (`kmedge://connect`) | | |
| 0.6 | Login as Member with wrong password | Inline "Incorrect username or password" | | |
| 0.7 | Login correct | Home; Settings → Account shows "Signed in until <+30d>", device name | | |
| 0.8 | Family Access → Devices | This device listed with platform, app version, last seen | | |
| 0.9 | Kill app, relaunch | Still logged in; no login prompt | | |
| 0.10 | Airplane mode, relaunch, Continue offline with correct password | Home in offline mode; red dot | | |
| 0.11 | Offline, 3 wrong passwords | Lockout screen; only "Try online login" | | |
| 0.12 | Admin revokes device while app open, then trigger sync | App returns to Login with "This phone was signed out by your administrator"; pending records preserved after re-login | | |

## S1 — Capture → sync → desktop

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| 1.1 | Journal with tags `school, avyu`, place `Bangalore`, text containing "on 15 March" | Saves instantly; within one sync: dot green, record "Synced" | | |
| 1.2 | Desktop Find | Record visible immediately with "From phone · awaiting resolution" chip; body verbatim | | |
| 1.3 | Pre-create Topic "School" ACTIVE on desktop, capture with tag `school` | Auto-linked; only `avyu` pending | | |
| 1.4 | Decision, Lesson, Goal, Person, Note, Event captures | Each lands with correct type and capture_kind on desktop | | |
| 1.5 | Event with start/end and "Add to calendar" | Desktop shows event dates; native calendar entry created | | |
| 1.6 | Private journal | Desktop: visible to owner and admin only; other member cannot see | | |
| 1.7 | Force-quit during sync, relaunch | No duplicates on desktop; all records Synced | | |

## S2 — Desktop resolution (drives S3/S4)

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Home → Needs Your Attention | "N phone captures need resolution" link | |
| 2.2 | Needs review → From phone → Labels to resolve | `avyu` grouped with count; Link/Create/Drop | |
| 2.3 | Create identity from `avyu` for all | All records linked; label gone from pending | |
| 2.4 | Confirm year for "15 March" | Temporal event created; date visible in Timeline/Find | |
| 2.5 | Suggested person "Avyu" → Confirm | ABOUT relationship added | |
| 2.6 | Suggest title → Accept | Title updated; body unchanged | |
| 2.7 | Dismiss a record with an odd label | Leaves queue; label shown as informational chip on record | |
| 2.8 | Member logs in on desktop | Sees only own items in From phone | |

## S3 — Edit after sync

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| 3.1 | Edit an **unresolved** synced record on phone; sync | Desktop body updated in place; no new version | | |
| 3.2 | Edit a **resolved** record on phone; sync | Desktop shows new Update version; history shows prior | | |
| 3.3 | Desktop Correct a record, then phone edits same record, sync | Both versions exist; From phone → Conflicts shows side-by-side; phone shows Synced | | |
| 3.4 | Try to change type of a synced record on phone | Control disabled, "Change type on desktop" | | |
| 3.5 | Change classification Normal→Private on phone; sync | Desktop record becomes Private (owner) | | |
| 3.6 | Add tags to a synced record; sync | New labels appear in From phone | | |

## S4 — Delete after sync

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| 4.1 | Delete an unresolved synced record; sync | Gone from desktop views; From phone → Deleted lists it | | |
| 4.2 | Delete a resolved record; sync | Desktop: From phone → Deletion requests; record hidden from member; admin Confirm → deleted; Keep → visible again to admin | | |
| 4.3 | Restore from Deleted view | Record visible again on desktop | | |
| 4.4 | Desktop deletes (via confirm) a record the phone still has; phone edits it; sync | Phone record hidden with reason "removed on desktop"; no error dialog | | |
| 4.5 | Other member attempts nothing (N/A) — verify via API test only | 404 for non-owner | | |

## S5 — Attachments

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| 5.1 | Photo from camera + PDF from Files on a record; sync | Both on desktop record; one request each; attachment strip thumbnails | | |
| 5.2 | Same photo on two records | Deduped on device; both bound on desktop | | |
| 5.3 | Try adding `.zip` | Inline rejection naming allowed types (from capabilities) | | |
| 5.4 | Remove attachment before sync | Never uploaded | | |
| 5.5 | Remove attachment after sync, delete record, sync, Clear deleted attachments | Blob purged only after DELETE acknowledged | | |

## S6 — Failure visibility

| # | Step | Expected | iOS | Android |
|---|---|---|---|---|
| 6.1 | Airplane mode mid-sync | Run stops; dot red; no rejected items; resumes next run | | |
| 6.2 | Stop GKS; capture; wait | Dot red; StatusDetail "Waiting to sync (1)"; "Last synced" unchanged | | |
| 6.3 | Set server to advertise contract version 2 only (test flag) | Home banner "Update KM-Edge…"; no rejected items | | |
| 6.4 | Record > 100,000 chars | "Needs attention" with "too long" sentence and Edit action | | |
| 6.5 | Family Access → Devices after 6.2 for 7+ days (or lowered threshold) | Home line "<device> hasn't synced in N days" | | |

## S7–S9

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | Second device, same member | Starts empty; syncs new captures; first device unaffected; both listed in Devices | |
| 8.1 | Uninstall/reinstall with unsynced record | Record lost (documented); new device entry | |
| 9.1 | After several syncs, inspect `System/edge/sync-log.jsonl` on server | Lines contain no titles/content/filenames; counts and codes only | |
| 9.2 | Settings → About → How syncing works | Copy present and accurate | |

## Sign-off

| Device | OS version | App version | GKS version | Tester | Date | Result |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
