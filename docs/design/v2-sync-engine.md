# V2 Sync Engine and Checksum Verification

**Date:** 2026-09-29
**Author:** Harshavardhana P
**Status:** Draft
**Implements:** REQ-0012 V2-F1, V2-F8
**Related:** REQ-0012 V2-F2 (Attachment Sync), V2-F3 (Blob Purge), V2-F4 (Soft Delete), V2-F7 (Sync Status Endpoint)

---

## 1. Overview

The V2 sync engine transmits locally-captured records and their attachments from the edge device to the Generational Knowledge System (GKS) server. On each sync run, the engine performs a pre-flight connectivity and configuration check, resets any deltas left in-flight by a previous crash, processes all pending deltas in sequence-number order (each independently so one failure does not block others), uploads attachments for newly-acknowledged records, flushes buffered telemetry events, and finalises the run with a batch checksum verification pass that compares every synced record's SHA-256 hash against the values stored on GKS. The result is persisted to SecureStore so the UI can display "last synced X min ago" without querying the server. The engine is triggered automatically every 15 minutes via `expo-background-fetch`, on app foreground when GKS is reachable, and manually via "Sync now" in StatusDetailScreen.

### 1.1 Foreground Trigger

The foreground trigger (REQ-0012 F1.1) is wired in `AppShell.tsx` via React Native's `AppState` API:

```typescript
useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      // Only run if GKS is reachable — reuse the existing probe result from StatusDot context
      if (gksReachable) runSync();
    }
  });
  return () => sub.remove();
}, [gksReachable]);
```

`gksReachable` comes from whatever context or state already drives the StatusDot probe result. No new probe is issued — the foreground sync runs only if the last known probe result was online. This avoids hammering GKS on every foreground event when the device is offline.

---

## 2. Data Flow

```
runSync()
│
├── 1. Network check (expo-network)
│       No network → return immediately (silent)
│
├── 2. Resolve GKS_SERVER_URL from SecureStore
│       Missing → return immediately (silent)
│
├── 3. resetInFlightToPending()
│       Recover any delta stuck IN_FLIGHT from a previous crash
│
├── 4. getPendingDeltas()  — ORDER BY seq ASC
│
├── 5. For each delta (independent — one failure does not stop others):
│   │
│   ├── 5a. [UPDATE delta with gks_id set] → acknowledge locally, skip network call
│   │       GKS records are immutable — no PUT/PATCH endpoint exists. Local edits
│   │       do not propagate to GKS. UPDATE deltas for already-synced records are
│   │       acknowledged immediately so they do not block the queue.
│   │
│   ├── 5b. markInFlight(seq)      [DB write before network call]
│   │
│   ├── 5c. Build GKS payload:
│   │       record_type        ← gksCaptureType(capture_kind)  [lowercase]
│   │       edge_id            ← delta.edge_id
│   │       content_sha256     ← records.content_sha256
│   │       preserve_authored_body = true
│   │       title, content, tags, importance, classification, life_areas
│   │       (calendar fields omitted — edge-only)
│   │
│   ├── 5d. POST /api/v1/records  (via fetchWithReauth)
│   │
│   ├── 5e. Handle response (see Section 4)
│   │       201 → acknowledgeDelta + update records.gks_id + uploadAttachments()
│   │       409 EDGE_DUPLICATE → acknowledgeDelta(extracted record_id) + uploadAttachments()
│   │       400 / 422 → rejectDelta(error) — continue to next delta
│   │       500 → resetToPending — continue to next delta
│   │       Network error → resetToPending — STOP remaining deltas this run
│   │       Auth fail after re-auth → emit session_expired — STOP sync
│   │
│   └── 5f. uploadAttachments(edge_id, gks_record_id)  [on ack only]
│           For each attachment where sync_status = 'PENDING':
│             POST multipart to /api/v1/attachments/workflow/NEW_ENTRY
│             Compare response.sha256 vs local sha256
│             Mismatch → sync_status = 'FAILED', sync_error = 'CHECKSUM_MISMATCH'
│             Match → POST bind, update gks_attachment_id, sync_status = 'SYNCED'
│
├── 6. flushTelemetry()
│       POST up to 200 untransmitted telemetry_events to /api/v1/telemetry/events
│       Mark transmitted = 1 on success
│
├── 7. Checksum verification (V2-F8)
│       GET /api/v1/sync/status
│       For each {edge_id, content_sha256} in response:
│         Compare against local records.content_sha256
│         Match → no action
│         Mismatch → resetToPending, increment retry_count
│                    retry_count >= 3 → rejectDelta('CHECKSUM_MISMATCH')
│         Missing from response → no action (not yet on GKS; will retry next run)
│
└── 8. Persist results to SecureStore
        last_synced_at = now()
        gks_synced_count = count of ACKNOWLEDGED deltas this run
        HomeScreen reads these values; refreshes getRecentRecords()
```

---

## 3. Delta State Machine

```
                    App start / resetInFlightToPending()
                         ┌─────────────────────┐
                         │                     │
                         ▼                     │
                     PENDING ─────────────► IN_FLIGHT
                      ▲  ▲  ▲               │       │
                      │  │  │               │       │
         500 / net    │  │  │ auth fail     │       │
         error        │  │  └───────────────┘       │
                      │  │                          │
                      │  │         201 / 409 / 404  │
                      │  │                          ▼
                      │  │                  ACKNOWLEDGED
                      │  │                       │
                      │  │  checksum mismatch     │
                      │  └────────────────────────┘
                      │    retry_count < 3
                      │
                      │    400 / 422 / retry_count >= 3 (checksum)
                      └──────────────────── REJECTED
```

**Transition details:**

| Transition | Trigger | DB write |
|---|---|---|
| PENDING → IN_FLIGHT | `markInFlight(seq)` called before any network call | `delta_log.status = 'IN_FLIGHT'` |
| IN_FLIGHT → ACKNOWLEDGED | 201 or 409 from GKS, or DELETE 204/404 | `status = 'ACKNOWLEDGED'`, `gks_record_id`, `gks_acknowledged_at` |
| IN_FLIGHT → PENDING | 500, network error, or checksum mismatch (retry_count < 3) | `status = 'PENDING'` |
| IN_FLIGHT → REJECTED | 400/422, or checksum mismatch with retry_count >= 3 | `status = 'REJECTED'`, `gks_error`, `retry_count` incremented |
| IN_FLIGHT → PENDING (auth fail) | Auth failure after re-auth — delta is reset, not rejected; sync stops | `status = 'PENDING'` |
| REJECTED → PENDING | User taps "Retry" in StatusDetailScreen | `status = 'PENDING'`, `gks_error = NULL`, `retry_count = 0` (fresh window) |

**Crash recovery:** On app start, `resetInFlightToPending()` moves any IN_FLIGHT row back to PENDING. This is called unconditionally before the first sync run. There is no data loss: `markInFlight` is written before the network call, so the delta is always in a recoverable state.

---

## 4. Error Handling Matrix

Covers all failure cases specified in REQ-0012 F1.5.

| Failure | Delta action | User visible | Retryable |
|---|---|---|---|
| Network error / timeout | Reset to PENDING. Stop processing remaining deltas this run. | StatusDot goes offline (red) if reachability probe also fails. No modal. | Yes — next sync run. |
| Auth failure after re-auth | Stop sync. Emit `session_expired` event. | StatusDetailScreen / StatusDot show "Session expired — log in again". | Yes — after user re-authenticates. |
| GKS 400 (bad request) | Mark REJECTED. Store `gks_error = body.detail`. | StatusDot shows amber. StatusDetailScreen lists record with error reason. | Yes — user taps "Retry" after fixing the underlying issue. |
| GKS 422 (validation error) | Mark REJECTED. Store `gks_error = body.detail`. | Same as 400. | Yes — user taps "Retry". |
| GKS 409 EDGE_DUPLICATE | Treat as success. Extract `record_id` from body. Mark ACKNOWLEDGED. Continue to attachment upload. | No error shown. | N/A — already acknowledged. |
| GKS 500 | Reset to PENDING. Continue to next delta. | No immediate indicator; StatusDot reflects overall state after run. | Yes — automatic next sync run. |
| Checksum mismatch (retry_count < 3) | Reset to PENDING. Increment `retry_count`. | No immediate indicator. | Yes — automatic next sync run. |
| Checksum mismatch (retry_count >= 3) | Mark REJECTED. `gks_error = 'CHECKSUM_MISMATCH'`. | StatusDot amber. StatusDetailScreen lists record with "Checksum mismatch" reason and per-record Retry button. | Yes — user taps "Retry". |

---

## 5. GKS Field Mapping

Edge `capture_kind` → GKS `record_type`. The mapping is always lowercase as required by the GKS records API.

| Edge `capture_kind` | GKS `record_type` |
|---|---|
| JOURNAL | journal |
| NOTE | note |
| EVENT | event |
| DECISION | decision |
| LESSON | lesson |
| GOAL | goal |
| PERSON | person |
| _(unknown / fallback)_ | note |

**Required fields in every payload:**

- `preserve_authored_body: true` — prevents GKS from prepending `# Title\n\n` to the body, which would permanently invalidate the SHA-256 checksum.
- `content_sha256` — the SHA-256 hash of the raw content string, computed by `expo-crypto` at capture time. GKS stores this verbatim; it does not recompute it.

**Fields explicitly excluded from the GKS payload:**

- `native_calendar_event_id` — calendar integration is edge-only.
- `reminder_minutes` — edge-only.
- `has_calendar_entry` — edge-only.

---

## 6. Checksum Verification Protocol

Checksum verification runs once, at the end of each sync run, after all deltas have been processed and telemetry has been flushed (step 7 in the data flow).

### 6.1 Request

```
GET /api/v1/sync/status
Cookie: <session cookie>
```

Returns the full list of GKS records that originated from this edge user:

```json
{
  "user_id": "usr-001",
  "synced_record_count": 42,
  "last_record_created": "2026-09-29T10:00:00Z",
  "records": [
    { "edge_id": "01927c4a-...", "gks_id": "KNOW-000042", "content_sha256": "abc123..." }
  ]
}
```

### 6.2 Comparison Logic

For each `{edge_id, content_sha256}` returned by GKS:

1. Look up `records.content_sha256` for that `edge_id` in local SQLite.
2. **Match** (`local == remote`): no action. The record is verified.
3. **Mismatch** (`local != remote`): reset the delta for that `edge_id` to PENDING, increment its `retry_count`.
   - If `retry_count` after increment is less than 3: the delta will retry on the next sync run (automatic, silent).
   - If `retry_count >= 3`: call `rejectDelta(seq, 'CHECKSUM_MISMATCH')`. The record appears in StatusDetailScreen with a per-record "Retry" button that resets it to PENDING when tapped.
4. **Missing from GKS response** (edge_id present locally, absent from GKS response): no action this run. This is the expected state for records that were acknowledged this run but whose indexing is not yet reflected in the sync status endpoint. The next run's verification will catch them.

### 6.3 Retry Count Threshold

| `retry_count` after reset | State | Action |
|---|---|---|
| 1 | PENDING | Silent retry next run |
| 2 | PENDING | Silent retry next run |
| 3 or more | REJECTED | `gks_error = 'CHECKSUM_MISMATCH'`. Surface in StatusDetailScreen. |

### 6.4 Why Batch, Not Per-Record

Verification is deferred to the end of the sync run rather than performed immediately after each 201 response. This avoids an extra round-trip per delta and relies on GKS storing the edge-provided `content_sha256` verbatim (F7.4). The batch call is one request regardless of how many records were synced this run.

---

## 7. Progress and Visibility

### 7.1 StatusDot States

| StatusDot state | Condition |
|---|---|
| Green (idle, online) | GKS reachable, no rejected deltas, sync not running |
| Pulsing (syncing) | `runSync()` is actively executing |
| Amber (warning) | One or more deltas in REJECTED state, sync not running |
| Red (offline) | GKS unreachable (health probe failed) |

**Precedence (highest first):** Red (offline) → Pulsing (syncing) → Amber (rejected deltas) → Green. A sync run that starts while there are rejected deltas shows pulsing, not amber. When the run completes and rejected deltas still exist, it returns to amber.

### 7.2 `last_synced_at` Storage

- Written to SecureStore (`KEYS.LAST_SYNCED_AT`) at the end of every sync run, unconditionally after `verifyChecksums()` returns. Written even if the verification call failed — the timestamp reflects sync completion, not verification success.
- Read by HomeScreen to display "Last synced X min ago" or "Never synced".
- Also stored: `gks_synced_count` (count of ACKNOWLEDGED deltas in the current run) for the HomeScreen GKS status row.
- HomeScreen calls `getRecentRecords()` after sync completes to refresh the record list.

### 7.3 StatusDetailScreen

Displays:

- Pending delta count (PENDING + IN_FLIGHT).
- Last sync result timestamp and count.
- List of all REJECTED deltas with: record title, `gks_error` reason, `gks_acknowledged_at` or rejection timestamp.
- Per-record "Retry" button: resets the delta to PENDING (`status = 'PENDING'`, `gks_error = NULL`) and immediately triggers `runSync()`.

StatusDetailScreen does not poll; it reads from SQLite on mount and after each manual retry.

---

## 8. Gaps in Current Implementation

This section enumerates every known gap between `syncEngine.ts` as it exists today and what REQ-0012 requires. Each item is the direct input to the implementation plan.

### Gap 1 — `gksCaptureType` returns uppercase strings

**File:** `src/lib/sync/syncEngine.ts`, function `gksCaptureType`
**Current:** The map returns `'JOURNAL'`, `'NOTE'`, etc. (uppercase).
**Required (F1.6):** GKS `record_type` must be lowercase (`'journal'`, `'note'`, etc.).
**Fix:** Change every value in the map to lowercase.

### Gap 2 — `content_sha256` and `preserve_authored_body` missing from payload

**File:** `src/lib/sync/syncEngine.ts`, function `syncDelta`, payload construction block (lines 139–149).
**Current:** Neither `content_sha256` nor `preserve_authored_body` is included in the POST body sent to GKS.
**Required (F1.4, F8.2, F8.3):** Both fields are mandatory in every create payload. Absence of `preserve_authored_body=true` causes GKS to prepend a heading to the content body, permanently invalidating the SHA-256.
**Fix:** Add `content_sha256: record.content_sha256` and `preserve_authored_body: true` to the payload object.

### Gap 3 — `record_type` is sent as a separate field alongside `capture_kind`

**File:** `src/lib/sync/syncEngine.ts`, payload (line 141–142).
**Current:** Both `record_type: record.type` and `capture_kind: gksCaptureType(...)` are sent. The GKS API expects `record_type` to carry the lowercase capture kind value — there is no separate `capture_kind` field in the GKS schema.
**Required (F1.4, F1.6):** Only `record_type` (lowercase capture kind) should be sent. `record.type` is the local SQLite type column and is not the same field.
**Fix:** Remove `capture_kind` from payload; set `record_type: gksCaptureType(record.capture_kind)`.

### Gap 4 — DELETE delta error handling does not match F1.5

**File:** `src/lib/sync/syncEngine.ts`, function `syncDelta`, DELETE branch (lines 107–129).
**Current:** Auth failure (`res === null`) calls `rejectDelta` immediately (permanent rejection). 500 and network errors also call `rejectDelta` permanently.
**Required (F4.2):** 500 and network errors on DELETE must reset to PENDING and retry. Auth failure must stop sync and emit `session_expired`, not reject the delta.
**Fix:** Separate the null-response case (auth fail → stop, emit `session_expired`) from HTTP 500 (reset to PENDING, continue) and network exception (reset to PENDING, stop remaining deltas).

### Gap 5 — `markInFlight` is not called before the DELETE network call

**File:** `src/lib/sync/syncEngine.ts`, function `syncDelta`, DELETE branch.
**Current:** `markInFlight(delta.seq)` is called after the null-gks_record_id guard but before the network call only on the happy path. However the early-return on missing `gks_record_id` calls `acknowledgeDelta` directly without ever marking IN_FLIGHT — this is fine. The issue is that on the non-null path, `markInFlight` is called correctly (line 116), but the immediately-preceding `acknowledgeDelta` call on a missing gks_record_id (line 111) bypasses it entirely without a prior IN_FLIGHT mark. This is a minor inconsistency but is benign for the never-synced case. No change needed for never-synced. Confirm no crash recovery regression.
**Status:** Low risk. Verify during implementation.

### Gap 6 — Attachment `sync_status` column not referenced; checksum comparison missing

**File:** `src/lib/sync/syncEngine.ts`, function `uploadAttachments` (lines 38–97).
**Current:**
- The function filters already-uploaded attachments by checking `att.gks_attachment_id` (line 45), which is correct for idempotency.
- It does not read or write `attachments.sync_status`.
- After upload, it does not compare `response.sha256` against the local `attachments.sha256` — the checksum step is entirely absent.
**Required (F2.1, F2.2, F2.3):**
- Filter on `sync_status = 'PENDING'` (not just absence of `gks_attachment_id`).
- After a successful upload response, compare `body.sha256` against `attachments.sha256`. Mismatch → `sync_status = 'FAILED'`, `sync_error = 'CHECKSUM_MISMATCH'`. Match → proceed to bind step.
- On bind success: `sync_status = 'SYNCED'`.
- On network error: leave `sync_status = 'PENDING'` (do not mark FAILED).
- On GKS 400: `sync_status = 'FAILED'`, `sync_error = <reason>`.
**Fix:** Add `sync_status` reads and writes throughout `uploadAttachments`; add the SHA-256 comparison after upload.

### Gap 7 — Blob purge in `uploadAttachments` fires too early

**File:** `src/lib/sync/syncEngine.ts`, function `uploadAttachments` (lines 91–97).
**Current:** After attachment uploads, the function queries all `pending_delete = 1` blobs and purges them immediately, regardless of whether their parent DELETE delta has been acknowledged.
**Required (F3.1):** A blob may be purged only when `pending_delete = 1` AND `delete_delta_seq` references a delta with `status = 'ACKNOWLEDGED'`.
**Fix:** Change the purge query to join against `delta_log`:
```sql
SELECT a.edge_attachment_id
FROM attachments a
JOIN delta_log d ON d.seq = a.delete_delta_seq
WHERE a.pending_delete = 1 AND d.status = 'ACKNOWLEDGED'
```

### Gap 8 — Batch checksum verification step is entirely absent

**File:** `src/lib/sync/syncEngine.ts`, function `runSync` (lines 231–253).
**Current:** `runSync` returns after `flushTelemetry`. There is no call to `GET /api/v1/sync/status` and no checksum comparison loop.
**Required (F8.1, F7.5):** After telemetry flush, call `GET /api/v1/sync/status` and run the comparison described in Section 6 of this document.
**Fix:** Add a `verifyChecksums(baseUrl)` function and call it at the end of `runSync` before returning.

### Gap 9 — `last_synced_at` and `gks_synced_count` are never written

**File:** `src/lib/sync/syncEngine.ts`, function `runSync`.
**Current:** `runSync` returns a `SyncResult` object but does not persist `last_synced_at` or `gks_synced_count` to SecureStore.
**Required (F1.8):** Both values must be written to SecureStore at the end of each successful sync run so HomeScreen can display "Last synced X min ago" without a server call.
**Fix:** Import `set` from `secureStore` and write both keys before returning from `runSync`.

### Gap 10 — `buildAuthHeaders` uses a dynamic import

**File:** `src/lib/sync/syncEngine.ts`, function `buildAuthHeaders` (lines 99–104).
**Current:** `authHeaders` is imported with `await import('../gksClient')` to avoid a stated circular dependency.
**Required (F2.6):** `buildAuthHeaders()` must use a direct import from `gksClient.authHeaders()` — no dynamic import.
**Fix:** Verify whether the circular dependency actually exists (both files import from each other). If it does, refactor `authHeaders` into a shared module (`src/lib/auth/headers.ts`) and import directly in both `syncEngine.ts` and `gksClient.ts`.

### Gap 11 — Network error during delta loop does not stop remaining deltas

**File:** `src/lib/sync/syncEngine.ts`, function `syncDelta` / `runSync`.
**Current:** `syncDelta` catches non-ok HTTP responses but does not distinguish a thrown network exception (fetch throws) from a received HTTP error response. If `fetchWithReauth` throws (unreachable host), the exception propagates uncaught through `runSync`'s `for` loop, potentially crashing the entire run rather than stopping cleanly.
**Required (F1.5):** On network error / timeout: reset the delta to PENDING and stop processing remaining deltas for this run (do not crash the loop).
**Fix:** Wrap the `fetchWithReauth` call in `syncDelta` in a try/catch. On catch: reset delta to PENDING, return a sentinel value (e.g. `'network_error'`) so `runSync` can break the loop.

### Gap 12 — `deltaStore.ts` has no `resetDeltaToPending` function for per-delta reset

**File:** `src/lib/db/deltaStore.ts`.
**Current:** `resetInFlightToPending` resets all IN_FLIGHT rows. There is no function to reset a single delta by seq (needed for checksum mismatch handling and user-triggered retry).
**Required:** A `resetDeltaToPending(seq: number): void` function that sets `status = 'PENDING'` and `gks_error = NULL` for a single row, and a separate increment of `retry_count`.
**Fix:** Add `resetDeltaToPending(seq)` to `deltaStore.ts`.

---

*End of document.*

---

## Amendment 2026-10-08 — Structure at capture, contract v2 (KK-2.2 Packet E2)

Source of truth: GKS `docs/design/KK-EDGE-STRUCTURE-AT-CAPTURE-DESIGN.md` (FROZEN 2026-10-08) and `docs/design/KK-EDGE-SYNC-CONTRACT-V2.md`.

- **Contract version.** Every request sends `X-Edge-Contract-Version: 2` (`EDGE_CONTRACT_VERSION`). A 426 `server_too_old` from a server that supports only v1 is shown as "Ask your administrator to update Kashyap’s Knowledge."
- **Envelope.** CREATE and UPDATE carry `summary`, `topics`, `people`, `place`, `dates` and `*_origin` from `structure_json` (`src/lib/sync/envelope.ts`).
- **Responses.** The response's `pending` items are stored with `setResolution` (`resolution_json`). They are cleared when GKS reports everything linked.
- **Identity refresh.** After a verified sync run, `refreshIdentityCache` pages `GET /edge/identities` until `next` is null. The cache is replaced only when every page arrived. A failure never fails the sync (`.catch`).
- **Errors.** `EDGE_IDENTITY_NOT_FOUND` is informational and silent: GKS has already fallen back to the label.
