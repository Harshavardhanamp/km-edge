# Contradictions and Defects Review — 2026-09-30

**Author:** Code review (automated)  
**Scope:** All 46 documents + migrations, recordStore, attachmentStore, syncEngine, validate.ts, StatusDot, app.json  
**Status:** A1–A4 fixed in code and docs. A5/A6 noted (no code change needed). B8 fixed in docs. B1–B7, B9–B12, C1–C10, D, E: open, deferred.

---

## Fixed in this session

| ID | Finding | Fix |
|---|---|---|
| A1 | DELETE of a synced record always treated as never-synced | `softDeleteRecord()` now reads `records.gks_id` and stamps it on the DELETE delta at insert time |
| A2 | No UPDATE path in GKS (records immutable) — UPDATE deltas hit 409, get stuck | `syncEngine.ts`: UPDATE deltas for records with `gks_id` set are acknowledged locally, no network call. Documented in REQ-0012 F1.3a. |
| A3 | Blob purge deferral unreachable from record-delete path — `softDeleteRecord()` never set `pending_delete` | `softDeleteRecord()` now sets `pending_delete = 1` + `delete_delta_seq` on all attachments inside the delete transaction |
| A4 | Removing attachment from live record leaks blob permanently — `unlinkAttachment()` looked for a DELETE delta that doesn't exist for live records | `unlinkAttachment()` now purges immediately when no DELETE delta exists; only defers when parent record is also being deleted |
| B8 | REQ-0008 OB7 and implementation-plan-observability.md said GKS dashboard + central server were V1 | Updated to V3 in both docs, matching REQ-0012 |

---

## A. V2 design defects — data loss (open items)

| # | Finding | Status |
|---|---|---|
| A5 | Checksum verification tautological — GKS echoes edge-provided hash, comparison tests edge vs edge | Open. GKS recomputing hash is a GKS-side change. The check still catches transmission corruption and is harmless; no code change made. |
| A6 | Dual `gks_id` / `gks_record_id` columns on `delta_log` — schema ambiguity, `002_v2.ts` re-adds columns that exist in 001 | Open. Fallback `delta.gks_record_id ?? delta.gks_id` is harmless now that A1 stamps the correct field. Column consolidation requires a migration. |

---

## B. REQ-0012 vs frozen V1 requirements (all open except B8)

| # | Finding |
|---|---|
| B1 | Allowed extension lists disagree across REQ-0002, REQ-0007, validate.ts (dropped rtf/json/svg; added heic/mp4/mov/mp3/m4a). GKS ALLOWED_EXT already matches validate.ts (23 ext). REQ-0002 and REQ-0007 need updating. |
| B2 | Video/audio types accepted but never scoped in REQ-0007 (sources: photo/scan/files only). Either scope media capture or remove the types. |
| B3 | REQ-0007 A4 / REQ-0002 F2.3 say 100 MB per-file cap; code enforces 50 MB. REQs not updated. |
| B4 | REQ-0002 F1.1 / data-model.md say send `type` (KNOWLEDGE/EVENT/…) + `capture_kind`; REQ-0012 F1.6 / code sends only lowercase `record_type` (= capture_kind). GKS DirectCaptureRequest accepts `record_type` + `capture_kind` separately. |
| B5 | REQ-0002 F1.2 mandatory fields: `created`, `author`, `schema_version`, `classification`. REQ-0012 F1.4 payload omits `created`, `author`, `schema_version`, `place`. User-editable date field lost on sync (violates ADR-0001 §4 no lossy transformation). `owner_user_id` for PRIVATE records also absent. |
| B6 | REQ-0002 F7.6 requires user confirmation before blob purge + per-record GET round-trip. REQ-0012 F3 purges automatically. REQ-0005 S2.3 physical purge deferred to V2 but not delivered or re-deferred. |
| B7 | REQ-0002 F7.2 sync trigger list vs REQ-0012 F1.1 — not reconciled; F7 still Draft. |
| B8 | Fixed — OB7 updated to V3. |
| B9 | REQ-0008 OB1.1 requires `tenant_id NOT NULL`; REQ-0012 E8 drops tenantId; code stores empty string. Column constraint vs resolution disagree. |
| B10 | Three different telemetry endpoints: REQ-0008 OB3 → GKS `km_edge_*` tables; GKS-API-extensions Ext 4a → `POST /api/v1/km-edge/telemetry`; code → `POST /api/v1/telemetry/events`. |
| B11 | calendar.md (Frozen) says UI shows dialog + calls `deleteEvent()` before soft-delete. Code (following REQ-0012 F4.3) does it silently inside the store. calendar.md is now wrong. |
| B12 | local-storage.md documents `sync_status` values: PENDING / ACKNOWLEDGED / REJECTED. syncEngine.ts:241 writes `'SYNCED'`. |

---

## C. Contradictions inside V2 documents (all open)

| # | Finding |
|---|---|
| C1 | Auth failure outcome: v2-sync-engine.md §3 table says REJECTED; §4 and Gap 4 say stop + session_expired (do not reject). |
| C2 | Checksum mismatch source state: verification acts on ACKNOWLEDGED deltas but state machine shows mismatch arrow leaving IN_FLIGHT. |
| C3 | `retry_count` on manual Retry: plan Step 2 increments it; sync-status §8 resets to 0; sync-engine §3 silent. |
| C4 | `gks_synced_count` meaning: sync-engine §7.2 = count this run; sync-status §6 = total on GKS. |
| C5 | When `last_synced_at` written: three different conditions across REQ-0012 F1.8, sync-engine §7.2, sync-status §6. |
| C6 | `verifyChecksums()` uses `getFirstSync` on LEFT JOIN to ACKNOWLEDGED deltas — arbitrary result when a record has CREATE + n UPDATEs. |
| C7 | DELETE of a never-synced record with pending CREATE/UPDATE deltas still in the queue: those will POST to GKS and create a record the user deleted. No "skip earlier deltas for this edge_id" logic. |
| C8 | StatusDot precedence: "pulsing/syncing" vs "amber" undefined. Code renders syncing as green. |
| C9 | Deep-link navigation targets `RecordDetail` at root navigator level; RecordDetailScreen exists only inside tab stacks. Toast component referenced but does not exist. |
| C10 | v2-attachment-sync.md header "Depends on: migration 001, migration 002" while 001 already contains the full V1 schema. |

---

## D. GKS-API-extensions.md is stale (open)

Every extension disagrees with REQ-0012: endpoint paths, response shapes, 409 body, telemetry endpoint. Missing: DELETE /api/v1/records/{id}, content_sha256 frontmatter, preserve_authored_body, attachment endpoints, ALLOWED_EXT change (already done in GKS). Needs a full rewrite as the single GKS contract.

---

## E. Undecided gaps (all open)

- Background sync over Tailscale: iOS background fetch may fire without VPN up. Behaviour undefined.
- iOS Keychain accessibility in background: silent re-auth reads SecureStore during background fetch; may block before first unlock.
- Pending attachment retry: PENDING attachments whose parent record was acknowledged in a previous run have no trigger. Need an explicit "upload all PENDING attachments of synced records" phase in runSync().
- Manual server URL entry: still absent from REQ-0004 / login-screen.md.
- Never-synced DELETE with earlier CREATE/UPDATE deltas still PENDING: those will be transmitted and create a ghost record. (C7 above.)
- `preserve_authored_body`: GKS already passes it unconditionally (archive.py); edge sends it redundantly. Harmless but should be verified and documented.
- No V2 test plan despite NF2 declaring sync highest-priority NFR.
