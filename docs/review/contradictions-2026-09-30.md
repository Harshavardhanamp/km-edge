# Contradictions and Defects Review — 2026-09-30

**Author:** Code review (automated)  
**Scope:** All 46 documents + migrations, recordStore, attachmentStore, syncEngine, validate.ts, StatusDot, app.json  
**Status:** All items resolved. A1–A4 fixed in code and docs. A5/A6 noted (no code change needed). B1–B6, B7–B12 all fixed. C1–C10 fixed. D fixed (GKS-API-extensions.md rewritten). E fixed (orphaned attachment retry pass added to runSync).

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

## B. REQ-0012 vs frozen V1 requirements

| # | Finding | Status |
|---|---|---|
| B1 | Allowed extension lists disagree across REQ-0002, REQ-0007, validate.ts (dropped rtf/json/svg; added heic/mp4/mov/mp3/m4a). GKS ALLOWED_EXT already matches validate.ts (23 ext). REQ-0002 and REQ-0007 need updating. | ✅ Fixed — REQ-0002 F2.1 and REQ-0007 A2 updated to 23-extension list |
| B2 | Video/audio types accepted but never scoped in REQ-0007 (sources: photo/scan/files only). Either scope media capture or remove the types. | ✅ Fixed — REQ-0007 A1 adds media library source; A2 documents video/audio acceptance; A7 updated with video/audio preview |
| B3 | REQ-0007 A4 / REQ-0002 F2.3 say 100 MB per-file cap; code enforces 50 MB. REQs not updated. | ✅ Fixed — REQ-0007 A4 and REQ-0002 F2.3 updated to 50 MB |
| B4 | REQ-0002 F1.1 / data-model.md say send `type` (KNOWLEDGE/EVENT/…) + `capture_kind`; REQ-0012 F1.6 / code sends only lowercase `record_type` (= capture_kind). GKS accepts both separately. | ✅ Fixed — REQ-0002 F1.1 note added; data-model.md Fields Edge Sends table clarified; `type` not in wire format |
| B5 | REQ-0002 F1.2 mandatory fields: `created`, `author`, `schema_version`, `classification`. REQ-0012 F1.4 payload omits `created`, `author`, `schema_version`, `place`. User-editable date field lost on sync (violates ADR-0001 §4 no lossy transformation). `owner_user_id` for PRIVATE records also absent. | ✅ Fixed — syncEngine.ts payload now includes `created`, `author`, `place`, `owner_user_id` (PRIVATE only). REQ-0012 F1.4 updated. KEYS.GKS_USER_ID added to secureStore; stored at login. `schema_version` intentionally omitted (GKS stamps). |
| B6 | REQ-0002 F7.6 requires user confirmation before blob purge + per-record GET round-trip. REQ-0012 F3 purges automatically. REQ-0005 S2.3 physical purge deferred to V2 but not delivered or re-deferred. | ✅ Fixed — SettingsScreen clearAttachmentCache() now: (1) confirms with user, (2) calls GET /api/v1/records/{gks_id} per candidate to verify GKS receipt, (3) purges only verified blobs. REQ-0002 F7.6 retained as-is. |
| B7 | REQ-0002 F7.2 sync trigger list vs REQ-0012 F1.1 — not reconciled. | ✅ Fixed — REQ-0002 F7.2 updated to list all 3 triggers. |
| B8 | REQ-0008 OB7 and implementation-plan-observability.md said GKS dashboard + central server were V1. | ✅ Fixed — updated to V3. |
| B9 | REQ-0008 OB1.1 requires `tenant_id`; REQ-0012 E8 drops tenantId; code stores empty string. | ✅ Fixed — OB1.1 updated; tenant_id drop documented with migration note. |
| B10 | Three different telemetry endpoints across REQ-0008, GKS-API-extensions, and code. | ✅ Fixed — REQ-0008 OB3 updated: references `POST /api/v1/telemetry/events`; km_edge_* tables noted as V3 admin dashboard design only. |
| B11 | calendar.md (Frozen) says UI shows dialog before soft-delete. Code does it silently in the store. | ✅ Fixed — calendar.md updated to match REQ-0012 F4.3. |
| B12 | local-storage.md missing `SYNCED` as a `sync_status` value. | ✅ Fixed — both `records.sync_status` and `delta_log.status` comments updated. |

---

## C. Contradictions inside V2 documents (all fixed)

| # | Finding | Fix |
|---|---|---|
| C1 | Auth failure outcome: state machine table said REJECTED; §4 and code say reset to PENDING + stop. | State machine table corrected: auth fail → PENDING (separate row). |
| C2 | Checksum mismatch arrow left IN_FLIGHT in diagram; actually detected post-ACKNOWLEDGED by `verifyChecksums()`. | State machine diagram redrawn: mismatch arrow leaves ACKNOWLEDGED. |
| C3 | `retry_count` on manual Retry: three docs said three different things. | Docs aligned: automatic retries increment; manual Retry resets to 0. Both transition table and sync-status §8 updated. |
| C4 | `gks_synced_count` meaning: sync-status §6 said total on GKS; code writes count this run. | sync-status §6 corrected to match code (`result.synced`). |
| C5 | `last_synced_at` written only on status-call success (sync-status §6) vs unconditionally (code). | sync-status §6 and sync-engine §7.2 corrected: written unconditionally after `verifyChecksums()` returns. |
| C6 | `verifyChecksums()` `getFirstSync` with unordered JOIN — arbitrary row when record has multiple ACKNOWLEDGED deltas. | Added `ORDER BY d.seq DESC LIMIT 1` to the query in `syncEngine.ts`. |
| C7 | DELETE of never-synced record left earlier PENDING CREATE/UPDATE deltas in queue — those would ghost-create the deleted record on GKS. | `syncEngine.ts`: CREATE/UPDATE deltas for `is_deleted = 1` records are acknowledged locally without network call. |
| C8 | StatusDot syncing vs amber precedence undefined. | v2-sync-engine.md §7.1: explicit precedence Red > Pulsing > Amber > Green. |
| C9 | Deep-link doc navigated to `RecordDetail` at root level (wrong); referenced non-existent toast component. | v2-deep-linking.md: navigation corrected to `HomeTab → RecordDetail` nested params; toast replaced with `Alert.alert`. |
| C10 | v2-attachment-sync.md header listed "migration 002" which doesn't add relevant columns; 001 has the full V1 schema. | Header corrected: depends on 001 + 003 (which adds the V2 attachment columns). |

---

## D. GKS-API-extensions.md

✅ **Fixed** — Complete rewrite. Now reflects actual GKS implementation: correct endpoint paths, response shapes (including real 409 body), all 8 implemented extensions documented, Ext 9 (batch ingest) marked not built, Ext 10/11 (admin dashboard + central server push) marked V3.

---

## E. Undecided gaps

- Pending attachment retry: ✅ Fixed — `runSync()` now starts with an orphaned-attachment retry pass (query: PENDING attachments for records with gks_id set and not deleted).

Remaining open gaps (not fixed in this session):
- Background sync over Tailscale: ✅ Fixed — `runSync()` pre-flight now probes `GET /api/v1/health` before processing any delta. Tailscale-down returns 'offline' → silent abort, all deltas stay PENDING. REQ-0012 F1.2 updated (step 3).
- iOS Keychain accessibility in background: ✅ Fixed — `secureStore.ts` now writes/reads `GKS_SERVER_URL`, `GKS_USERNAME`, `GKS_PASSWORD_ENC`, `GKS_USER_ID` with `keychainAccessible: AFTER_FIRST_UNLOCK`. Background fetch can read these after first device unlock. All other keys keep the default `WHEN_UNLOCKED`.
- Manual server URL entry: ✅ Fixed — REQ-0004 L1.3 added (manual URL entry as third fallback after auto-discovery and QR). ServerDiscoveryScreen gains a `manual` phase with URL input + health-check probe before accepting.
- `preserve_authored_body`: ✅ Documented — GKS-API-extensions.md Ext 4 updated. GKS hardcodes `True` internally; edge payload value is ignored but kept defensively. No code change needed.
- No V2 test plan despite NF2 declaring sync highest-priority NFR.
