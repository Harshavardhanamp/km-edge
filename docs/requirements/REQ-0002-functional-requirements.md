# REQ-0002: Functional Requirements

**Date:** 2026-09-29  
**Status:** Draft  
**Author:** Harshavardhana P  
**Supersedes:** Open questions in REQ-0001

---

## F1 — Record Capture (Initial Release)

### F1.1 Supported Record Types
Users can create records of the following types. Each maps 1:1 to a GKS canonical type — no translation layer needed.

| KM-Edge label | GKS `type` | GKS prefix | Notes |
|---|---|---|---|
| Journal | `KNOWLEDGE` | `KNOW` | `capture_kind: JOURNAL` |
| Note | `KNOWLEDGE` | `KNOW` | `capture_kind: NOTE` |
| Event | `EVENT` | `EVT` | `capture_kind: EVENT` |
| Decision | `DECISION` | `DEC` | `capture_kind: DECISION` |
| Lesson | `LESSON` | `LES` | `capture_kind: LESSON` |
| Goal | `GOAL` | `GOAL` | `capture_kind: GOAL` |
| Person | `PERSON` | `PER` | `capture_kind: PERSON` |

Types not exposed in initial release: `PROJECT`, `QUESTION`, `TOPIC`, `PLACE`, `SOURCE`.  
`SOURCE` is GKS-ingestion-only and is never created directly by a user.

**Mapping confidence:** HIGH. All 7 types map exactly. No unmappable types were requested.

**Sync payload note (updated 2026-09-30):** The GKS sync payload sends `record_type` (lowercase `capture_kind`, e.g. `"journal"`) — not the GKS canonical `type` string (`KNOWLEDGE`/`EVENT`/…). GKS derives `type` internally from `record_type`. The `type` field in this table is for data-model reference only, not for the sync wire format.

### F1.2 Mandatory Fields per Record (matches GKS `REQUIRED`)
Every record must carry:
- `title` — user-supplied or auto-derived from first line of content
- `type` — set by record type selection
- `capture_kind` — set by record type selection (see F1.1 table)
- `created` — ISO date, defaults to now on device
- `author` — defaults to `"human"` (overridable by user preference)
- `schema_version` — always `1`
- `classification` — `NORMAL` or `PRIVATE` (user chooses; default `NORMAL`)

### F1.3 Optional Fields (subset of GKS schema, exposed in UI)
- `tags` — comma-separated; max 20, max 64 chars each
- `importance` — `LOW`, `NORMAL`, `HIGH`; default `NORMAL`
- `life_areas` — multiselect from fixed GKS list: `family`, `professional`, `finance`, `children`, `social`, `personal`, `learning`, `health`, `home`, `travel`, `legacy`
- `place` — free text name + optional precision
- `about` — list of PERSON record IDs (select from local record list)
- `relationships` — list of record IDs

### F1.4 Fields NOT in initial KM-Edge UI (GKS generates these on sync/ingest)
- `id` (GKS-assigned typed ID, e.g. `KNOW-000042`) — GKS assigns on first sync; edge uses a local UUID until then
- `provenance` — set to `{"method": "EDGE_CAPTURE", "authority": "HUMAN"}` on sync by GKS
- `created_by_user_id` / `created_by_display_name` — stamped by GKS auth on sync
- `security_zone` — always `KNOWLEDGE`; GKS stamps this

### F1.5 Local Record Identity (Pre-Sync)
Before a record reaches GKS and gets a typed ID, it is identified by a local `edge_id` (UUID v7, time-ordered). This field is carried as a GKS extension field `edge_id` in frontmatter, preserved through sync so the edge can match response records back to local drafts.

---

## F2 — Attachments (Initial Release)

### F2.1 Accepted File Types
The accepted set (matches GKS `ALLOWED_EXT` and edge `validate.ts`):  
`pdf, txt, md, csv, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png, webp, gif, heic, mp4, mov, mp3, m4a`

Media files (heic, mp4, mov, mp3, m4a) are accepted from the device file picker. Photos taken with the camera or picked from the gallery are always accepted (JPEG/PNG output).

### F2.2 Rejected File Types
- Password-protected/encrypted files: encrypted PDFs, password-protected ZIPs, encrypted Office docs
- Compressed/archive files: `.zip`, `.tar`, `.gz`, `.7z`, `.rar` and variants
- Executables and scripts: `.exe`, `.dll`, `.so`, `.apk`, `.bat`, `.cmd`, `.sh`
- Any extension not in the accepted list

**Note:** Content-level scanning (malware via ClamAV) does NOT happen on edge. Files are transmitted to GKS on sync; GKS performs all content-level security scanning before accepting into the vault. The edge enforces extension-level rejection only.

### F2.3 File Size
- Per-file limit: 50 MiB (edge enforced; code cap is 50 MB — updated 2026-09-30)
- Files stored as local blobs on device until sync; SHA-256 computed on edge at capture time

### F2.4 Attachment Metadata
Each attachment carries: `edge_attachment_id` (UUID v7), `original_filename`, `size_bytes`, `sha256`, `mime_type`, `captured_at`, linked `edge_id` of parent record.

---

## F3 — Calendar Integration (Initial Release)

### F3.1 Access
- Request read/write access to device native calendar (iOS EventKit, Android CalendarProvider, or browser Calendar API if PWA)
- User explicitly grants permission; app functions without it if denied

### F3.2 Capabilities
- View calendar events on a date-picker / timeline view on home screen
- Create calendar events linked to a KM-Edge EVENT record
- Set alerts / alarms on calendar events (uses native device alarm system)
- Events stored both as KM-Edge records and as native calendar entries (two-way at capture time; not continuously synced)

### F3.3 Calendar → GKS mapping
A calendar event created in KM-Edge becomes an `EVENT` record in GKS with `capture_kind: EVENT`. The native calendar entry is an ephemeral device copy; the GKS record is the durable source of truth.

---

## F4 — Home Screen (Initial Release)

Minimal, essential — specific content deferred to a future design session. Confirmed elements:

- Recent records (last N captures)
- Quick-capture shortcut (one tap to start a new record)
- Calendar view / upcoming events strip
- Account display name

Deferred to next design discussion: full home screen content specification.

---

## F5 — Authentication (Initial Release)

### F5.1 Login
- Username + password screen (same credential store as GKS — same username/password the user has in GKS)
- GKS is the identity authority; credentials are validated against GKS `POST /api/v1/auth/login`

### F5.2 Offline Login
**Open question resolved:** GKS has no offline credential cache. KM-Edge must implement one.  
Decision (see ADR-0003): after successful online login, store a device-local credential verifier (Argon2id hash of password, salted per-device) so the user can authenticate locally when GKS is unreachable. Session is flagged `offline_mode: true`; write access to local store is allowed, sync is blocked.

### F5.3 Session
- On successful GKS login, store the GKS session cookie for API calls
- Also store the offline verifier (see F5.2)
- GKS session TTL is 8 hours absolute, 30 min idle — KM-Edge re-authenticates transparently when the session expires (if online)

### F5.4 Future (Post-Initial)
- Biometric login (Face ID, Touch ID, Android fingerprint) — replaces password re-entry after first login; offline verifier still used as the cryptographic root

---

## F6 — Storage (Initial Release)

### F6.1 Decision
Records and attachments are stored in user-attached cloud storage (Google Drive or Dropbox). This is required because:
- Device local storage is unreliable across reinstalls and device changes
- "Same data from any device" requirement cannot be met with device-local-only storage
- Same GKS user sees same edge data regardless of which device they log in from

See ADR-0004 for the full decision.

### F6.2 Storage Provider Support (Initial Release)
- Google Drive (OAuth2, app-specific folder)
- Dropbox (OAuth2, app folder)

### F6.3 Data at Rest
- All records and attachments encrypted before writing to cloud storage using a key derived from the user's password (Argon2id KDF + AES-256-GCM)
- The cloud provider sees only encrypted blobs — no plaintext

### F6.4 Storage Layout (in cloud app folder)
```
KM-Edge/
  accounts/<gks_user_id>/
    records/
      <edge_id>.json      # record frontmatter + content
    attachments/
      <sha256[:2]>/<sha256>   # content-addressed blob
    sync/
      state.json          # sync state: last sync timestamp, pending queue
      delta.json          # unsynced changes log (append-only, durable)
```

---

## F7 — Sync (Post-Initial Release — Cornerstone Feature)

### F7.1 Priority
Sync is a cornerstone feature. Reliability, durability, and accuracy are the primary design constraints. Speed of recovery is secondary.

### F7.2 Sync Model
- **Direction:** Edge → GKS push (initial sync release). Bidirectional in a later release.
- **Transport:** GKS local API over Tailscale private VPN. No cloud intermediary.
- **Trigger:** Three triggers (per REQ-0012 F1.1):
  1. Background — every 15 minutes via `expo-background-fetch`
  2. Foreground — on app foreground when GKS probe result is online
  3. Manual — "Sync now" button in StatusDetailScreen

### F7.3 Delta Sync
- Every write on edge is appended to `delta.json` (append-only durable log): `{edge_id, operation: CREATE|UPDATE, timestamp, checksum}`
- On sync, only entries not yet acknowledged by GKS are transmitted
- GKS returns its assigned typed ID (`KNOW-000042`) for each synced record; edge updates its local record with the GKS ID and marks the delta entry as acknowledged
- Acknowledged entries are never deleted from `delta.json` — they become the audit trail

### F7.4 GKS Availability Indicator
- Periodically probe GKS health endpoint (`GET /api/v1/health`) via Tailscale
- Display `Online` / `Offline` status on home screen
- Show "Last synced: <timestamp>" after each successful sync

### F7.5 Failure Handling
Sync must be durable at every failure point:

| Failure point | Recovery |
|---|---|
| Network drop mid-sync | Resume from last acknowledged delta entry; no duplicate creates (GKS deduplicates by `edge_id`) |
| App crash during sync | On next launch, re-read delta.json; retry unacknowledged entries |
| GKS rejects a record | Mark entry `REJECTED` in delta.json with GKS error; surface to user; do not block other records |
| Attachment transfer failure | Attachment retried independently; record sync succeeds without attachment |
| Storage (cloud drive) unavailable | Queue writes in device memory; flush to cloud storage as soon as available |

User is shown sync progress: total pending, currently transmitting, succeeded, rejected.

### F7.6 Before Deleting Edge Data
A record may only be removed from edge storage when **both** conditions are met:
1. GKS has acknowledged receipt (delta entry status is `ACKNOWLEDGED` with a valid GKS typed ID)
2. The GKS record is retrievable via `GET /api/v1/knowledge/<gks_id>` and its `sha256` matches the edge record checksum

User is notified before deletion and must confirm. Automatic deletion is not in initial sync release.

### F7.7 GKS Boundary Compliance on Sync
Sync must enforce GKS rules:
- `classification: PRIVATE` records are pushed with `owner_user_id` set to the GKS user's ID
- Tags: max 20, max 64 chars each — validated on edge before sync attempt
- `security_zone` is always set to `KNOWLEDGE` by GKS (edge does not set it)
- Attachments: extension validation on edge; content scanning (ClamAV) happens on GKS at ingest time

---

## F8 — Tenant User Discovery via Bluetooth (Future — Post-Sync)

> Exploratory idea. Not in initial or sync release.

Discover other KM-Edge users on the same GKS tenant who are physically nearby via Bluetooth LE. Use cases: share a record, link a person-record to a co-present user. Requires GKS to expose a "users in tenant" API and Bluetooth permissions on device. Design deferred entirely.

---

## F9 — Mailbox and Messaging Integration (Future)

> Post-sync release.

- Access device mailbox (email) and potentially WhatsApp/messaging
- Captured emails/messages become GKS SOURCE or KNOWLEDGE records
- Mirrors the GKS Gmail integration pattern (`gmail.py`)
- Platform permissions and privacy implications require a dedicated design session

---

## F10 — MCP Extensibility (Future)

> Exploratory. No commitment.

Allow users to connect external apps via MCP (Model Context Protocol) to bring additional data sources into KM-Edge. The edge app acts as an MCP client; user-configured MCP servers provide data. Specific apps TBD — to be discovered based on what MCP servers are available at the time.

---

## Open Questions (Resolved)

| Question | Resolution |
|---|---|
| Same login as GKS? | Yes — same username/password against GKS identity store (F5.1) |
| Login when GKS is offline? | Device-local offline credential verifier derived from password at login time (F5.2, ADR-0003) |
| Where to store data for multi-device access? | User-attached cloud storage (Google Drive / Dropbox), encrypted at rest (F6, ADR-0004) |
| When to delete edge data? | Only after GKS acknowledge + round-trip verification (F7.6) |
| Bluetooth discovery when? | Post-sync, not in initial release (F8) |

## Open Questions (Still Open)

- [ ] Home screen content — what exactly beyond recent records and calendar strip? (Design session needed)
- [ ] Bidirectional sync (GKS → edge pull) — which record types and fields flow back to the edge? Full record or summary only?
- [ ] Conflict resolution when same record edited on edge and in GKS before sync?
- [ ] PWA vs native app platform decision (see ADR-0002)
