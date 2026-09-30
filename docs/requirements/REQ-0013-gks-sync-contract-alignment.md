# REQ-0013: GKS Sync Contract Alignment (V2.0.0)

**Date:** 2026-09-30
**Status:** Frozen
**Author:** Harshavardhana P
**Supersedes:** REQ-0012 sections V2-F1, V2-F2, V2-F7, V2-F8 (sync protocol details); REQ-0008 (observability) in full; REQ-0004 L1 (server discovery), L4 step 2–3, L10 (session/re-auth); REQ-0002 F5.3, F7.2–F7.7; REQ-0007 A3/A9 scanning claims.
**Keeps:** REQ-0012 V2-F3 (blob purge deferral), V2-F4 phone-side behaviour, V2-F5 (deep linking), V2-F6 (staging area); REQ-0005; REQ-0006 (with RC11 type-lock addition below); REQ-0009; REQ-0010.
**Authoritative contract:** `generational-knowledge-system/docs/design/KK-EDGE-SYNC-CONTRACT-V1.md` (GKS repository owns it — ADR-0011). This document states what KM-Edge must do to honour it; it does not restate wire shapes.
**Related ADRs:** ADR-0011 (contract ownership), ADR-0012 (bearer device sessions), ADR-0013 (telemetry reduced to sync health), ADR-0014 (capture window edit/delete semantics), ADR-0015 (server discovery without subnet scan).

---

## Why

A code-level trace of the V2 sync engine against the GKS API showed that no phone capture carrying tags, a place, or a date could be accepted, that one path (temporal 409 read as duplicate) marked records synced that GKS never stored, that edits had no server path at all, and that login could not succeed from a native client (wrong field name, missing Origin, cookie handling). The seam was walked scenario by scenario with the product owner on 2026-09-30; decisions are recorded in the GKS requirements document §11 (D1–D27). This document is the KM-Edge half.

## Persona

The phone user is a **non-technical family member**. KM-Edge never asks them to choose Topic/Place identities, confirm years, or interpret sync errors. Anything the phone cannot decide is decided later by the administrator (or the owning member) on desktop. The phone shows "Synced" once GKS holds the record, and a plain sentence with at most one action when something needs the member.

## C1 — Server discovery (replaces REQ-0004 L1)

- **C1.1** Discovery offers two paths only: **Enter address** (MagicDNS name or full URL; scheme defaults to `https://`) and **Scan QR code** (payload `kmedge://connect?url=<origin>&name=<display name>`, generated in GKS Family Access).
- **C1.2** The `/24` subnet scan is removed.
- **C1.3** On entry or scan the app calls `GET /api/v1/edge/capabilities`; on success it shows "Connect to *<display_name>*?" with the URL before the password screen. On failure: "Couldn't reach Kashyap's Knowledge at *<url>*" with Try again / Scan QR.
- **C1.4** Capabilities are cached (24 h) and refreshed at the start of every sync run; `supported_contract_versions` must include `EDGE_CONTRACT_VERSION` (1) or the app shows the 426 message (C6).

## C2 — Authentication (replaces REQ-0002 F5.3, REQ-0004 L4/L10)

- **C2.1** Login calls `POST /api/v1/edge/auth/login` with `identifier`, `password`, `device_id` (UUIDv4 generated once per install and kept in SecureStore), `device_name` (OS device name, editable later in Settings), `platform`, `app_version`.
- **C2.2** The bearer token and `expires_at` are stored in SecureStore. Every edge request sends `Authorization: Bearer`, `X-Edge-Contract-Version: 1`, `X-Edge-Device-Id`.
- **C2.3** **No password is stored on the device.** `GKS_PASSWORD_ENC` and silent re-auth are removed. `EDGE_SESSION_EXPIRED` / `EDGE_SESSION_REVOKED` → session cleared, user returned to Login with the mapped message; pending deltas are untouched and resume after login.
- **C2.4** Sessions last 30 days (server policy). Settings → Account shows "Signed in until *<date>*".
- **C2.5** Offline login, verifier, lockout: unchanged (ADR-0003 minus the password addendum, which ADR-0012 supersedes). The verifier is refreshed on every successful online login.
- **C2.6** The background sync task reads the bearer from SecureStore (no in-memory-only session state).

## C3 — Record sync (replaces REQ-0012 V2-F1, V2-F7, V2-F8)

- **C3.1** CREATE deltas → `POST /api/v1/edge/records` with the envelope built from the SQLite row: `record_type` = `capture_kind` (always sent, upper case), `title`, `content`, `content_sha256`, `created`, `captured_at`, `classification`, `importance`, `life_areas`, `tags` (free text), `place_label` (from `place.name`), `event.start/end` for EVENT (from the dedicated columns, see C7).
- **C3.2** UPDATE deltas → `PUT /api/v1/edge/records/{edge_id}` with the envelope plus `base_content_sha256` = `records.synced_content_sha256`.
- **C3.3** DELETE deltas → `DELETE /api/v1/edge/records/{edge_id}`.
- **C3.4** Acknowledgement: any `2xx` with `state ∈ {ACCEPTED, UPDATED, ALREADY_SYNCED, DELETED, DELETION_REQUESTED, CONFLICT}` acknowledges the delta, stores `gks_id`, and sets `synced_content_sha256 = content_sha256`. `409 EDGE_RECORD_DELETED` rejects the delta with a mapped reason (record removed on desktop) and hides the local record (soft delete, no further sync).
- **C3.5** End-of-run verification calls `GET /api/v1/edge/sync-status`; for each returned record the phone re-points `gks_id` to the head and compares head `content_sha256` with `synced_content_sha256` (not the live `content_sha256`, which may already differ due to a local unsynced edit). Mismatch handling unchanged (3 tries → REJECTED `EDGE_CHECKSUM_MISMATCH`). `state: DELETED` for a locally live record → local soft delete with reason "removed on desktop" (no new delta).
- **C3.6** `409` is never treated as a duplicate. Only `state: ALREADY_SYNCED` means duplicate.
- **C3.7** Type lock (REQ-0006 RC9 addition): once `gks_id` is set, the type control on RecordDetail is read-only with the caption "Change type on desktop".
- **C3.8** Attachments follow record acknowledgement, as before.

## C4 — Attachments (replaces REQ-0012 V2-F2; corrects REQ-0007 A3/A9)

- **C4.1** Upload → `POST /api/v1/edge/records/{edge_id}/attachments` multipart with `file`, `edge_attachment_id`, `sha256`, `original_filename`, `mime_type`. One call; the server binds. The two-call workflow is removed.
- **C4.2** Allowed extensions and limits come from capabilities; the local `ALLOWED_EXT` constant becomes a fallback used only before first capabilities fetch.
- **C4.3** `scan_status` from the response is stored on the attachment row. REQ-0007 A3/A9 are corrected: GKS reports `scan_policy: NOT_SCANNED` until real scanning exists; KM-Edge makes no claim that GKS scans.
- **C4.4** Failure states unchanged (`PENDING` on network error; `FAILED` with `sync_error` code on permanent rejection).

## C5 — Telemetry (replaces REQ-0008; ADR-0013)

- **C5.1** The phone records only: sync runs (result, duration bucket, counts), error categories, and capture counts by type. **Screen visits, durations, session timelines, error messages and stacks are not collected at all.** `telemetry_events` rows of those kinds are dropped by migration 004; `useScreenTracking` is removed.
- **C5.2** Flush → `POST /api/v1/edge/telemetry` within each sync run, max 200 events. The client never sends `user_id`, `tenant_id`, or `session_id`.
- **C5.3** The central observability server and GKS admin usage dashboard are out of scope (V3 at earliest, and only if REQ-0008 is re-opened).

## C6 — Failure visibility (replaces REQ-0012 F1.7/F1.8 wording)

- **C6.1** Every contract error code maps to exactly one sentence and at most one action (contract §8). Retry is offered only for retryable codes. Unmapped codes fall back to "This record couldn't be sent. Contact your administrator." and are logged as a contract violation in the error category `contract`.
- **C6.2** `last_synced_at` is written only when a run completes verification. Otherwise HomeScreen shows the previous value or "Never synced".
- **C6.3** StatusDetail wording: "Waiting to sync (N)", "Synced", "Needs attention (N)"; the failed list shows the mapped sentence, not the code.
- **C6.4** `EDGE_CONTRACT_UNSUPPORTED` with `direction: client_too_old` → "Update KM-Edge to keep syncing"; `server_too_old` → "Ask your administrator to update Kashyap's Knowledge". Shown as a persistent banner on Home, not a dialog.

## C7 — Data model changes (migration 004)

- `records`: add `synced_content_sha256 TEXT`, `event_start TEXT`, `event_end TEXT`, `scan_status` on `attachments`, `device_id` in SecureStore. Event dates move out of the content body: `CaptureScreen` writes `event_start/event_end` columns; the `**Event:** …` line is no longer injected (existing rows with the injected line are left as-is; the envelope sends columns when present).
- `telemetry_events`: delete rows with `event_type ∈ {screen_enter, screen_exit, session_start, session_end}`; keep table for the reduced vocabulary.
- SecureStore: remove `GKS_PASSWORD_ENC`; add `EDGE_TOKEN`, `EDGE_TOKEN_EXPIRES_AT`, `DEVICE_ID`, `DEVICE_NAME`, `CAPABILITIES_JSON`, `CAPABILITIES_FETCHED_AT`.

## C8 — Help copy on the phone

Settings → About gains "How syncing works": records stay on this phone until synced; after that Kashyap's Knowledge is the copy that matters; if this phone is lost or reinstalled, unsynced records are lost; the administrator resolves tags, places and dates on desktop; type can be changed on desktop after sync.

## C9 — Tests (new; KM-Edge has none today)

- Jest with `jest-expo`; `npm test` and `npx tsc --noEmit` are release gates.
- A mock GKS built from the pinned fixture snapshot `src/test/fixtures/edge-sync/v1/` (copied from the GKS repo with a checksum manifest).
- Coverage targets: `syncEngine.ts`, `gksClient.ts`, `deltaStore.ts`, `recordStore.ts` envelope builder, error mapping table, discovery URL/QR parsing, migration 004.
- Device acceptance checklist: `docs/testing/device-acceptance-checklist.md`, executed before `v2.0.0`.

## Non-functional

Unchanged from REQ-0003 and REQ-0012 NF1–NF5, plus: **honesty** (never "Synced" unless GKS holds it; never "Last synced" for an unverified run) and **no credential at rest** (bearer only, 30-day expiry).

## Out of scope

Pull/bidirectional sync, showing resolution state on the phone, push notifications, biometric login, conflict UI on the phone, batch ingest.

## Release gates

- KM-Edge tagged `v1.0.0` on the current V1 commit before this work starts (closes A5).
- `v2.0.0` when: all C-sections implemented, `npm test` + `tsc` green, device checklist executed on one iOS and one Android device against GKS 2.1.0, docs and ADRs current.
