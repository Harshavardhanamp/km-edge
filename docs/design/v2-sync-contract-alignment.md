# Design: V2 Sync Contract Alignment

**Date:** 2026-09-30
**Status:** Frozen
**Author:** Harshavardhana P
**Requirement:** REQ-0013
**Contract:** `generational-knowledge-system/docs/design/KK-EDGE-SYNC-CONTRACT-V1.md`
**Related ADRs:** ADR-0011, ADR-0012, ADR-0013, ADR-0014, ADR-0015
**Supersedes (as designs):** `v2-sync-engine.md` §5 field mapping and §8 gaps 1–3, 8, 10–11; `v2-sync-status.md` §5–6; `v2-attachment-sync.md` §4; `observability.md`; `login-screen.md` Server Discovery, Credential Storage and Silent Re-authentication sections.

---

## 1. Module map (changes only)

```
src/lib/contract.ts            EDGE_CONTRACT_VERSION = 1; header builder; error catalogue types
src/lib/gksClient.ts           REWRITE: bearer auth, capabilities, edge routes, typed EdgeError
src/lib/discovery.ts           NEW: address normalisation, kmedge://connect parsing, capabilities check
src/lib/errors/edgeErrorMap.ts NEW: code → {sentence, action, retryable}
src/lib/sync/syncEngine.ts     REWRITE of syncDelta/verify/telemetry per §3–§5
src/lib/sync/envelope.ts       NEW: SQLite row → contract envelope
src/lib/telemetry.ts           REDUCE to sync health
src/lib/useScreenTracking.ts   DELETE
src/lib/db/migrations/004_contract_alignment.ts  NEW
src/lib/secureStore.ts         KEYS changes (§7)
src/screens/ServerDiscoveryScreen.tsx  REWRITE (two paths)
src/screens/LoginScreen.tsx    identifier field, device fields, no password storage
src/screens/RecordDetailScreen.tsx     type lock
src/screens/CaptureScreen.tsx  event_start/event_end columns
src/screens/StatusDetailScreen.tsx     mapped sentences, honesty rules
src/screens/HomeScreen.tsx     426 banner, last_synced honesty
src/screens/SettingsScreen.tsx device name, signed-in-until, change server, How syncing works
src/navigation/RootNavigator.tsx       kmedge://connect deep link (alongside record/)
src/test/**                    NEW Jest harness, mock server, fixtures snapshot
```

## 2. Client (`gksClient.ts`)

```ts
type EdgeError = { code: string; status: number; message: string; details?: Record<string, unknown> };
type EdgeResult<T> = { ok: true; status: number; body: T } | { ok: false; error: EdgeError } | { ok: false; network: true };

capabilities(baseUrl): EdgeResult<Capabilities>            // no auth, cached 24h in SecureStore
login(baseUrl, identifier, password, device): EdgeResult<LoginResponse>
logout(baseUrl)
edgeFetch(baseUrl, path, init): EdgeResult<any>            // adds Authorization, X-Edge-Contract-Version, X-Edge-Device-Id
createRecord(baseUrl, envelope)                            // POST /edge/records
updateRecord(baseUrl, edgeId, envelope, baseSha)           // PUT  /edge/records/{edge_id}
deleteRecord(baseUrl, edgeId)                              // DELETE
syncStatus(baseUrl, since?)                                // GET  /edge/sync-status
uploadAttachment(baseUrl, edgeId, att)                     // FileSystem.uploadAsync multipart
postTelemetry(baseUrl, events)                             // POST /edge/telemetry
```

Rules: a thrown `fetch` → `{network:true}`; non-2xx → parse the error envelope into `EdgeError` (fallback code `EDGE_SERVER_ERROR` for 5xx without envelope, `contract` category for unparsable); `401 EDGE_SESSION_*` → emit `sessionInvalid(code)` on an event bus consumed by `AuthContext` (clears token, navigates to Login, keeps deltas); `426` → store `contractBlock = {direction}` in SecureStore for the Home banner and abort the run. No retry inside the client.

## 3. Envelope builder (`sync/envelope.ts`)

From a `records` row: `schema_version: 1`, `edge_id`, `record_type: row.capture_kind`, `title`, `content`, `content_sha256`, `created`, `captured_at`, `classification`, `importance`, `life_areas: JSON.parse`, `tags: JSON.parse`, `place_label: place?.name ?? undefined`, `event: row.capture_kind === 'EVENT' && row.event_start ? {start, end?} : undefined`. Never includes calendar columns, `type`, `sync_status`, `preserve_authored_body`, `capture_kind` (as a separate key), or any key not in the contract. A unit test asserts the key set equals the contract's.

## 4. Sync engine (`sync/syncEngine.ts`)

```
runSync():
  net check → baseUrl → capabilities (cached; if 426 → banner, return)
  resetInFlightToPending()
  for delta in getPendingDeltas():                # seq ASC
    outcome = syncDelta(delta)
    if outcome == 'stop' break
  flushTelemetry()
  verified = verifyChecksums()                     # sync-status
  if verified: set LAST_SYNCED_AT, GKS_SYNCED_COUNT (from response.synced_record_count)

syncDelta(delta):
  markInFlight
  CREATE → createRecord(envelope)
  UPDATE → updateRecord(envelope, base = records.synced_content_sha256)
  DELETE → deleteRecord (if gks_id null and never synced → acknowledge locally, purge blobs)
  on {network} → resetToPending; return 'stop'
  on ok 2xx:
     state ∈ {ACCEPTED, UPDATED, ALREADY_SYNCED, CONFLICT}: acknowledge; records.gks_id = body.gks_id;
        records.synced_content_sha256 = envelope.content_sha256 (CREATE/UPDATE); uploadAttachments; return 'ok'
     state ∈ {DELETED, DELETION_REQUESTED}: acknowledge; return 'ok'
  on error:
     retryable per catalogue (RATE_LIMITED, EDGE_TEST_MODE_ACTIVE, EDGE_SERVER_ERROR) → resetToPending; return 'skip'
     EDGE_SESSION_EXPIRED|REVOKED → resetToPending; emit sessionInvalid; return 'stop'
     EDGE_CONTRACT_UNSUPPORTED → resetToPending; banner; return 'stop'
     EDGE_RECORD_DELETED → rejectDelta(code); localSoftDelete(edge_id, reason='removed on desktop'); return 'fail'
     EDGE_CHECKSUM_MISMATCH → resetToPending + retry_count++ (≥3 → reject); return 'skip'
     otherwise → rejectDelta(code); return 'fail'

verifyChecksums():
  res = syncStatus(); if not ok → return false
  for r in res.records:
     local = records by edge_id (join ACKNOWLEDGED delta)
     if !local → continue
     if r.gks_id != local.gks_id → UPDATE records SET gks_id = r.gks_id      # head re-pointing
     if r.state == 'DELETED' and !local.is_deleted → localSoftDelete(reason='removed on desktop')  # no delta
     if r.content_sha256 != local.synced_content_sha256 → mismatch handling (3 tries)
  return true
```

`GKS_SYNCED_COUNT` comes from the server response, not the run's count.

## 5. Attachments

`uploadAttachments(edgeId, gksId)` iterates `sync_status='PENDING'` rows, calls `uploadAttachment` (multipart fields per contract §6), then: `201/200` → `SYNCED`, store `gks_attachment_id`, `scan_status`; `EDGE_CHECKSUM_MISMATCH` / `EDGE_FILE_TYPE_NOT_SUPPORTED` / `EDGE_FILE_TOO_LARGE` / `EDGE_RECORD_ATTACHMENT_LIMIT` → `FAILED` with code; network → stay `PENDING`. Extension validation at capture time uses `capabilities.attachments.allowed_extensions` when present. Blob purge (V2-F3) unchanged.

## 6. Telemetry (`telemetry.ts`)

API: `telemetry.syncRun({result, durationMs, counts})`, `telemetry.error(category)`, `telemetry.captureCount()` (computed at flush from `records` grouped by `capture_kind`). Rows stored in `telemetry_events` with `event_type ∈ {sync_run, error, capture_count}` and JSON `metadata` limited to contract fields. `flushTelemetry` builds the contract batch (no ids) and marks `transmitted = 1` on `200`.

## 7. Storage changes (migration 004)

```sql
ALTER TABLE records ADD COLUMN synced_content_sha256 TEXT;
ALTER TABLE records ADD COLUMN event_start TEXT;
ALTER TABLE records ADD COLUMN event_end TEXT;
ALTER TABLE attachments ADD COLUMN scan_status TEXT;
DELETE FROM telemetry_events WHERE event_type IN ('screen_enter','screen_exit','session_start','session_end');
UPDATE records SET synced_content_sha256 = content_sha256 WHERE gks_id IS NOT NULL;   -- best effort for any pre-existing synced rows
```

SecureStore `KEYS`: remove `GKS_PASSWORD_ENC`; add `EDGE_TOKEN`, `EDGE_TOKEN_EXPIRES_AT`, `DEVICE_ID`, `DEVICE_NAME`, `CAPABILITIES_JSON`, `CAPABILITIES_FETCHED_AT`, `CONTRACT_BLOCK`. `clearSession` clears token/expiry/contract block but **not** `DEVICE_ID`, `DEVICE_NAME`, `GKS_SERVER_URL`, calendar preferences, or the offline verifier.

## 8. Screens

- **ServerDiscoveryScreen:** two large buttons (Enter address / Scan QR), address form with normalisation (`gks.tail1234.ts.net` → `https://gks.tail1234.ts.net`), capabilities check, confirmation card "Connect to *Kashyap's Knowledge*?" showing URL, then Login. QR scanner accepts `kmedge://connect?url=…&name=…` and plain URLs.
- **LoginScreen:** fields Username or email / Password; calls edge login with device fields; stores token; derives verifier; no storage of password. Offline path unchanged.
- **RecordDetailScreen:** type control disabled when `gks_id` set; caption "Change type on desktop".
- **CaptureScreen / RecordDetailScreen (EVENT):** start/end pickers write `event_start/event_end`; no body injection.
- **HomeScreen:** persistent banner when `CONTRACT_BLOCK` set; "Last synced" from `LAST_SYNCED_AT` only.
- **StatusDetailScreen:** "Waiting to sync (N)", "Synced N records", "Needs attention (N)" list with mapped sentences and Retry only when retryable; "Sync now".
- **SettingsScreen:** Account shows display name, "Signed in until *<date>*", device name (editable), Log out; GKS Server shows URL + "Change server"; About → "How syncing works".

**As built (K6, 2026-10-06):**
- `src/lib/sync/statusSummary.ts` holds all status wording, so it can be tested without rendering.
  - `loadStatusSummary()` returns *waiting*: distinct records with `PENDING`/`IN_FLIGHT` deltas.
  - It also returns *synced*: live records with a `gks_id`. The screen prefers the server's `GKS_SYNCED_COUNT`.
  - And *attention*: `REJECTED` deltas with no later delta for that record, plus `FAILED` attachments listed by file name. Each item shows its mapped sentence, never a code. Retry appears only for retryable codes, and `retryDelta` resets `retry_count` to 0.
- `contractBanner()` turns the stored `CONTRACT_BLOCK` into the Home banner. It reads `details.direction` (`client_too_old` / `server_too_old`, contract §8; GKS P8 aligned its implementation to these names). With no direction, or an unreadable block, it shows "Update KM-Edge to keep syncing."
- `CONTRACT_BLOCK` is cleared after a fresh (uncached) capabilities success. Every 426 stores the same `{code, message, details}` shape.
- `LAST_SYNCED_AT` is written only after a completed, verified run (C6.2).
- An unmapped code gets the C6.1 fallback sentence and a `contract` telemetry category.
- Settings → About → "How syncing works" is `HowSyncingScreen` (copy in `src/lib/help/howSyncing.ts`), registered in `SettingsStack`.
- Status screen labels: "Sync status", "Connection", "Last synced", "Waiting to sync (N)", "Synced N records", "Needs attention (N)", "Sync now".
- Render tests are replaced by logic tests (`statusSummary.test.ts`), because Jest here runs in a Node environment without a React Native renderer. Adding one is a dependency change (L3).
- **AppShell / RootNavigator:** on mount `resetInFlightToPending`, `cleanStagingDirectory`; deep links `kmedge://record/<edge_id>` (V2-F5) and `kmedge://connect?…` (opens discovery confirmation if not logged in to that server).

## 9. Error map (`errors/edgeErrorMap.ts`)

A single table keyed by contract code with `{sentence, action: 'login'|'update_app'|'none'|'edit'|'remove'|'revert_type'|'dismiss'|'retry', retryable}` mirroring contract §8. A test asserts every code in the pinned fixtures' `errors/` and response bodies exists in the map.

## 10. Tests (`src/test/`)

- `jest.config.js` with `jest-expo` preset; mocks for `expo-sqlite` (better-sqlite3 in-memory adapter or the official mock), `expo-secure-store` (in-memory), `expo-file-system` (tmp dir), `expo-network`.
- `mockGks.ts`: an in-process server (e.g. `msw` or a `fetch` stub) that serves the pinned fixtures by matching method+path+body-hash, with stateful scenarios (create → replay → update → delete).
- Suites: `envelope.test.ts`, `syncEngine.create.test.ts`, `syncEngine.update.test.ts`, `syncEngine.delete.test.ts`, `syncEngine.verify.test.ts`, `syncEngine.errors.test.ts`, `attachments.test.ts`, `telemetry.test.ts`, `gksClient.auth.test.ts`, `discovery.test.ts`, `migration004.test.ts`, `edgeErrorMap.test.ts`, `fixtures.pin.test.ts` (manifest checksum).
- Scripts: `npm test`, `npm run typecheck` (`tsc --noEmit`), `npm run lint`.

## 11. Removed

Subnet scan; `GKS_PASSWORD_ENC`; silent re-auth; `useScreenTracking`; session telemetry; the two-call attachment flow; `/api/v1/records`, `/api/v1/sync/status`, `/api/v1/telemetry/events` usage; `capture_kind`/`preserve_authored_body` payload keys; treating 409 as duplicate.
