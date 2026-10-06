# V2 Sync Status Endpoint Design

**Date:** 2026-09-29
**Author:** Harshavardhana P
**Requirement:** REQ-0012 V2-F7, V2-F8
**Status:** Draft

---

## 1. Overview

The sync status endpoint is a GKS-side `GET` route that returns a list of every record the authenticated user has synced from edge, along with the `content_sha256` that GKS stored at creation time. After each sync run, `syncEngine.ts` calls this endpoint and compares the returned checksums against local values. Any mismatch causes the record's delta to be reset to PENDING for retry, with escalation to REJECTED after three consecutive failures.

The endpoint also provides aggregate counts (`synced_record_count`, `last_record_created`) for display in HomeScreen. It is consumed only by the edge app — no GKS UI reads it.

---

## 2. GKS Endpoint Spec

```
GET /api/v1/sync/status
```

**Authentication:** MEMBER-level session cookie. Same requirement as all other GKS data endpoints. Unauthenticated requests receive 401.

**Request:** No query parameters. No request body.

**Response shape:**

```json
{
  "user_id": "usr-001",
  "synced_record_count": 42,
  "last_record_created": "2026-09-29T10:00:00Z",
  "records": [
    {
      "edge_id": "01927c4a-5b3d-7e2f-9a1c-000000000001",
      "gks_id": "KNOW-000042",
      "content_sha256": "abc123def456..."
    }
  ]
}
```

Field notes:

- `user_id`: the authenticated user's ID, echoed back for client-side sanity check.
- `synced_record_count`: length of the `records` array. Included as a top-level field for HomeScreen display without parsing the full list.
- `last_record_created`: ISO 8601 UTC timestamp of the most recently created edge-originated record, or `null` if none exist yet.
- `records`: all non-deleted records for this user that carry an `edge_id` in frontmatter. Ordered by creation timestamp ascending. No pagination in V2.
- `content_sha256`: the value stored in the record's YAML frontmatter at creation time, exactly as the edge provided it. GKS does not recompute it.

---

## 3. GKS Implementation

### New file: `src/generational_kb/api/sync_status.py`

The route is implemented as a FastAPI `APIRouter` in a new file, following the same pattern as every other router in the codebase.

```python
from __future__ import annotations

from fastapi import APIRouter, Request
from generational_kb.archive import scan_records_authorized

router = APIRouter()
API_PREFIX = "/api/v1"

@router.get(f"{API_PREFIX}/sync/status")
def sync_status(request: Request) -> dict:
    archive_root = request.state.archive_root
    user = getattr(request.state, "user", None)
    user_id = str(user.get("user_id", "")) if user else ""

    all_records = scan_records_authorized(archive_root)

    edge_records = [
        (path, meta) for path, meta in all_records
        if meta.get("edge_id") and meta.get("created_by_user_id") == user_id
    ]

    edge_records.sort(key=lambda pm: pm[1].get("created_at", ""))

    records_out = [
        {
            "edge_id": meta["edge_id"],
            "gks_id": meta["id"],
            "content_sha256": meta.get("content_sha256", ""),
        }
        for _, meta in edge_records
    ]

    last_created = edge_records[-1][1].get("created_at") if edge_records else None

    return {
        "user_id": user_id,
        "synced_record_count": len(records_out),
        "last_record_created": last_created,
        "records": records_out,
    }
```

`scan_records_authorized` is imported from `archive.py`. It applies the existing PRIVATE-record visibility filter so the route inherits correct RBAC without any additional logic. The secondary filter on `created_by_user_id` narrows to records owned by the calling user; this is consistent with how other user-scoped queries are handled in the GKS API.

### Registration in `app.py`

Add alongside the other router imports (around line 97–116):

```python
from .sync_status import router as sync_status_router
```

Add alongside the other `include_router` calls (around line 328–346):

```python
app.include_router(sync_status_router)
```

No prefix argument — the router already carries the full path.

---

## 4. GKS Record Creation Changes

Two fields need to reach the YAML frontmatter for edge-originated records: `content_sha256` (new) and correct `preserve_authored_body` handling (already in place but documented here for completeness).

### 4.1 `preserve_authored_body` (already implemented)

`knowledge.py` line 86 already passes `preserve_authored_body=True` unconditionally to `create_human_record()`. No change needed. This prevents GKS from prepending `# Title\n\n` to the body, which would cause a permanent SHA-256 mismatch on every edge-originated record.

### 4.2 `content_sha256` in frontmatter (new)

**`knowledge.py` — `create_direct_record` function:**

Add `content_sha256: str | None = None` to the function signature (after `edge_id`):

```python
def create_direct_record(
    archive: Path,
    *,
    ...
    edge_id: str | None = None,
    content_sha256: str | None = None,   # <-- add
) -> dict[str, Any]:
```

Pass it through to `create_human_record`:

```python
rid, _path = create_human_record(
    archive,
    ...
    edge_id=edge_id,
    content_sha256=content_sha256,   # <-- add
)
```

**`archive.py` — `create_human_record` function:**

Add `content_sha256: str | None = None` to the signature (after `edge_id`, around line 232):

```python
    edge_id: str | None = None,
    content_sha256: str | None = None,   # <-- add
```

Store it in the metadata dict alongside `edge_id` (around line 498–499):

```python
    if edge_id:
        metadata["edge_id"] = edge_id.strip()
    if content_sha256:
        metadata["content_sha256"] = content_sha256.strip()   # <-- add
```

**`app.py` — POST `/api/v1/records` request model:**

The Pydantic request model for record creation (wherever it is defined — `CreateRecordRequest` or equivalent) needs `content_sha256: str | None = None` added as an optional field. The route handler then passes it into `create_direct_record`.

No migration is needed: `content_sha256` is stored in YAML frontmatter, not in a database table. Existing records simply lack the field; the sync status handler returns `""` for those via `meta.get("content_sha256", "")`.

---

## 5. Edge Consumption

`syncEngine.ts` calls `GET /api/v1/sync/status` once at the end of each sync run, after all deltas have been processed.

```typescript
const statusRes = await gksClient.get('/api/v1/sync/status');
const { records: gksRecords } = statusRes.data;

for (const gksRec of gksRecords) {
  const local = db.getFirstSync<{ content_sha256: string; retry_count: number; seq: number }>(
    `SELECT r.content_sha256, d.retry_count, d.seq
     FROM records r
     LEFT JOIN delta_log d ON d.edge_id = r.edge_id AND d.status = 'ACKNOWLEDGED'
     WHERE r.edge_id = ?`,
    [gksRec.edge_id]
  );

  if (!local) continue; // not in local DB — should not happen, skip

  if (local.content_sha256 === gksRec.content_sha256) continue; // match, no action

  // Mismatch: reset and escalate
  const newRetryCount = (local.retry_count ?? 0) + 1;
  if (newRetryCount >= 3) {
    db.runSync(
      `UPDATE delta_log SET status = 'REJECTED', gks_error = 'CHECKSUM_MISMATCH'
       WHERE seq = ?`,
      [local.seq]
    );
  } else {
    db.runSync(
      `UPDATE delta_log SET status = 'PENDING', retry_count = ?
       WHERE seq = ?`,
      [newRetryCount, local.seq]
    );
  }
}
```

**Records missing from the GKS response** (i.e. the edge has an ACKNOWLEDGED delta but GKS does not include the record): no action. The record may still be propagating through GKS indexing, or the delta was acknowledged too recently for the sync status scan to include it. It will appear on the next sync run. This is a "missing from response = still pending on GKS" interpretation, not a mismatch.

---

## 6. last_synced_at Storage

> **Superseded 2026-10-06 (K6, REQ-0013 C6.2).** `LAST_SYNCED_AT` is now written only when the run finished (`stopReason === 'completed'`) **and** `verifyChecksums()` returned `true` (sync-status answered with a `records` list). An aborted run or a failed status call keeps the previous value, so Home shows that or "Never synced". `GKS_SYNCED_COUNT` is the server's `synced_record_count`. The original text follows for history.

After the sync status call completes (regardless of whether any mismatches were found), `syncEngine.ts` writes two values to SecureStore:

```typescript
await set(KEYS.LAST_SYNCED_AT, new Date().toISOString());
await set(KEYS.GKS_SYNCED_COUNT, String(result.synced)); // count acknowledged this run, not total on GKS
```

`KEYS.LAST_SYNCED_AT` and `KEYS.GKS_SYNCED_COUNT` are new entries in the `KEYS` constant in `src/lib/secureStore.ts`.

These writes happen unconditionally at the end of every `runSync()` call, after `verifyChecksums()` returns (whether or not the status call itself succeeded). The timestamp reflects when the sync run completed, not whether verification passed — a failed status call is not treated as a sync failure.

---

> **K6 (2026-10-06):** StatusDetailScreen wording and its Needs-attention list now come from `src/lib/sync/statusSummary.ts`; see `v2-sync-contract-alignment.md` §8. The "Pending deltas", "Probe" and "Failed Records" labels in §7–§8 below are superseded.

## 7. HomeScreen Changes

### New state

```typescript
const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
const [gksSyncedCount, setGksSyncedCount] = useState<number | null>(null);
```

### Data loading

Add to the existing `useFocusEffect` (or convert the current `useEffect` to `useFocusEffect` so the values refresh when the user navigates back to HomeScreen):

```typescript
useFocusEffect(useCallback(() => {
  get(KEYS.LAST_SYNCED_AT).then(setLastSyncedAt);
  get(KEYS.GKS_SYNCED_COUNT).then((v) => setGksSyncedCount(v ? parseInt(v, 10) : null));
  // existing: get recent records, username, calendar events
}, []));
```

### Render

Below the `<StatusDot />` row in the header, add a new label. `relTime` already exists in `HomeScreen.tsx`:

```tsx
<Text style={styles.syncLabel}>
  {lastSyncedAt ? `Last synced ${relTime(lastSyncedAt)}` : 'Never synced'}
</Text>
```

A secondary label in the GKS status row (or below it) can optionally show `{gksSyncedCount ?? 0} records on GKS` — position to be determined during implementation.

### Style addition

```typescript
syncLabel: { fontSize: 12, color: '#7A6A5A', marginTop: 2 },
```

---

## 8. StatusDetailScreen Changes

### GKS synced count row

Add a new row below "Pending deltas":

```tsx
<View style={styles.row}>
  <Text style={styles.label}>Synced to GKS</Text>
  <Text style={styles.value}>{gksSyncedCount ?? '—'}</Text>
</View>
```

`gksSyncedCount` is read from SecureStore on mount, same as `lastSyncedAt`.

### Rejected delta list

Add state:

```typescript
const [rejectedDeltas, setRejectedDeltas] = useState<RejectedDelta[]>([]);
```

Where:

```typescript
interface RejectedDelta {
  seq: number;
  title: string;
  gks_error: string | null;
  edge_id: string;
}
```

Load on mount and after each sync:

```typescript
function refreshRejected() {
  const rows = db.getAllSync<RejectedDelta>(
    `SELECT d.seq, r.title, d.gks_error, d.edge_id
     FROM delta_log d
     JOIN records r ON r.edge_id = d.edge_id
     WHERE d.status = 'REJECTED'
     ORDER BY d.seq ASC`
  );
  setRejectedDeltas(rows);
}
```

Render below the sync button:

```tsx
{rejectedDeltas.length > 0 && (
  <View style={styles.rejectedSection}>
    <Text style={styles.rejectedHeader}>Failed Records</Text>
    {rejectedDeltas.map((d) => (
      <View key={d.seq} style={styles.rejectedRow}>
        <View style={styles.rejectedInfo}>
          <Text style={styles.rejectedTitle} numberOfLines={1}>{d.title}</Text>
          <Text style={styles.rejectedError}>{d.gks_error ?? 'Unknown error'}</Text>
        </View>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => handleRetry(d.seq)}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    ))}
  </View>
)}
```

### Retry button handler

```typescript
async function handleRetry(seq: number) {
  db.runSync(
    `UPDATE delta_log SET status = 'PENDING', retry_count = 0, gks_error = NULL WHERE seq = ?`,
    [seq]
  );
  refreshRejected();
  refreshPending();
  await handleSync();
}
```

Resetting `retry_count = 0` on manual retry gives the record a fresh three-attempt window. This is the intended UX: the user has acknowledged the failure and is explicitly asking for a clean retry. `resetDeltaToPending()` (used by automatic checksum-mismatch retries) increments `retry_count`; the manual Retry handler resets it to 0 — these are two distinct code paths with intentionally different semantics.

---

## 9. Gaps in Current Implementation

The following gaps exist between the current `StatusDetailScreen.tsx` / `syncEngine.ts` implementation and what V2-F7 requires. Each item is a concrete change needed.

| # | Location | Gap | Required change |
|---|---|---|---|
| 1 | `StatusDetailScreen.tsx` | No REJECTED delta list. The screen shows pending count only; rejected records are invisible. | Add `rejectedDeltas` state, `refreshRejected()` query, and the rejected delta render block with per-record Retry buttons (Section 8). |
| 2 | `StatusDetailScreen.tsx` | No GKS synced count row. The screen has no visibility into how many records GKS has confirmed. | Add `gksSyncedCount` state read from `KEYS.GKS_SYNCED_COUNT` and a new "Synced to GKS" row (Section 8). |
| 3 | `StatusDetailScreen.tsx` | `relTime` in this file only handles seconds and minutes. HomeScreen's `relTime` handles hours and days. If last sync was >1 hour ago, the probe label reads "60m ago" rather than "1h ago". | Expand `StatusDetailScreen.relTime` to match `HomeScreen.relTime`, or extract a shared `relTime` to `src/lib/formatTime.ts`. |
| 4 | `StatusDetailScreen.tsx` | No "Last synced" display. The screen shows probe time but not sync completion time. | Add a row reading `KEYS.LAST_SYNCED_AT` from SecureStore and formatting with `relTime`. |
| 5 | `syncEngine.ts` | No call to `GET /api/v1/sync/status` after sync run. Checksum verification (V2-F8) is unimplemented. | Add the sync status call and the mismatch loop at the end of each sync run (Section 5). |
| 6 | `syncEngine.ts` | `retry_count` column does not exist on `delta_log` in current schema. `gks_error` column may also be absent. | Add migration 003 (or whichever is next) to add `retry_count INTEGER NOT NULL DEFAULT 0` and `gks_error TEXT` to `delta_log`. |
| 7 | `syncEngine.ts` | `KEYS.LAST_SYNCED_AT` and `KEYS.GKS_SYNCED_COUNT` do not exist in `secureStore.ts`. | Add both keys to the `KEYS` constant in `src/lib/secureStore.ts`. |
| 8 | `HomeScreen.tsx` | No "Last synced" label. `useEffect` fires once on mount; navigating back from sync does not refresh the value. | Add `useFocusEffect` and the sync label render (Section 7). |
| 9 | `GKS archive.py` | `content_sha256` is not stored in frontmatter for edge-originated records. Sync status endpoint would return `""` for all records, making checksum verification always report a mismatch. | Add `content_sha256` parameter to `create_human_record` and `create_direct_record`, store in metadata dict (Section 4.2). |
| 10 | `GKS app.py` / request model | The `POST /api/v1/records` request model does not include `content_sha256`. The field from the edge payload is silently dropped. | Add `content_sha256: str \| None = None` to the Pydantic request model and thread it through to `create_direct_record`. |
| 11 | `GKS api/` | `GET /api/v1/sync/status` route does not exist. | Create `src/generational_kb/api/sync_status.py` and register its router in `app.py` (Section 3). |
