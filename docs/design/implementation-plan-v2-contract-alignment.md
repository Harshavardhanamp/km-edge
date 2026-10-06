# Implementation Plan: V2 Contract Alignment (KM-Edge 2.0.0)

**Date:** 2026-09-30
**Status:** Approved
**Author:** Harshavardhana P
**Requirement:** REQ-0013
**Design:** `v2-sync-contract-alignment.md`
**GKS counterpart:** `generational-knowledge-system/docs/roadmap/KK-EDGE-SYNC-IMPLEMENTATION-PLAN.md` (Packets 0–8)

Per ADR-0006: follow the steps in order; any deviation is surfaced before proceeding. Each packet ends with `npm test`, `npx tsc --noEmit`, `npx expo lint`, a commit, and a push. Report completion percentages (overall stream = 21 packets per GKS `docs/roadmap/KK-2.1-CONSOLIDATED-PLAN.md`).

---

## Prerequisites

- [ ] Tag current `main` as `v1.0.0` (closes A5) **before** any K-packet commit; push tags.
- [ ] Push the 11 pending V2 commits as-is (decision D3).
- [ ] GKS Packet 1 (fixtures) merged and pushed — needed from K1.
- [ ] GKS Packet 2–3 running on a scratch server — needed to verify K3+ against a live server (optional for unit tests).

## K0 — Documentation and superseding marks

1. Commit REQ-0013, ADR-0011–0015, `v2-sync-contract-alignment.md`, this plan, `docs/testing/device-acceptance-checklist.md`.
2. Add "Superseded by …" headers to: `GKS-API-extensions.md`, `observability.md`, `implementation-plan-observability.md`, REQ-0008; add "Amended by REQ-0013 / ADR-0014" to `v2-sync-engine.md`, `v2-sync-status.md`, `v2-attachment-sync.md`, ADR-0003 (addendum superseded by ADR-0012), ADR-0005.
3. Update `README.md` documentation index and `design-index.md`.
4. Add `CHANGELOG.md` with `1.0.0` (V1 beta) and `2.0.0 — Unreleased`.

## K1 — Test harness and fixtures pin

> **Installation note:** `jest-expo`, `jest`, `@types/jest`, `better-sqlite3` and any other test dependencies are installed on the target machine, not committed here. Only configuration and code files are in this repo.

1. ~~`npx expo install jest-expo jest @types/jest`~~ — **target machine only.**
   Repo delivers: `jest.config.js`; `package.json` scripts (`test`, `typecheck`, `lint`) added without running installs.
2. Mocks (code only — no install): `src/test/__mocks__/expo-sqlite.ts`, `expo-secure-store.ts`, `expo-file-system.ts`, `expo-network.ts`, `expo-crypto.ts`.
3. Copy `generational-knowledge-system/contracts/edge-sync/v1/` → `src/test/fixtures/edge-sync/v1/` with `MANIFEST.sha256`; `fixtures.pin.test.ts` fails on drift.
4. `src/test/mockGks.ts` serving fixtures with stateful scenarios.
5. First real tests: `migration001-003` smoke (schema present), `deltaStore` state machine.

**Gate:** `npm test` green with ≥ 5 suites (run on target machine after installing deps).

## K2 — Contract, client, discovery, auth

1. `src/lib/contract.ts`, `src/lib/errors/edgeErrorMap.ts` (+ test against fixtures).
2. `gksClient.ts` rewrite (§2): capabilities, login, edgeFetch, typed results, sessionInvalid bus, 426 handling.
3. `secureStore.ts` KEYS changes; `DEVICE_ID` generation on first launch; `clearSession` scope.
4. `discovery.ts` + `ServerDiscoveryScreen.tsx` rewrite (two paths, capabilities confirm, QR `kmedge://connect`).
5. `LoginScreen.tsx`: `identifier`, device fields, token storage, verifier refresh; remove password storage; `AuthContext` consumes `sessionInvalid`.
6. `RootNavigator.tsx`: `kmedge://connect` deep link (and, if not yet done, `kmedge://record/<edge_id>` from V2 Phase 6; register `"scheme": "kmedge"` in `app.json`).
7. `SettingsScreen.tsx`: device name, signed-in-until, Change server.

**Tests:** `gksClient.auth.test.ts` (login ok/invalid/429/426, headers present, no Origin/Cookie), `discovery.test.ts` (normalisation, QR parsing, capabilities failure), error map completeness.

## K3 — Migration 004 and envelope

1. `004_contract_alignment.ts` (§7) registered in `migrations.ts`.
2. `sync/envelope.ts` + key-set test.
3. `CaptureScreen.tsx` / `RecordDetailScreen.tsx`: EVENT start/end to columns; remove body injection; type lock when `gks_id` set.
4. `recordStore.ts`: `synced_content_sha256` handling; `localSoftDelete(edge_id, reason)` without delta.

**Tests:** `migration004.test.ts` (columns, telemetry purge, backfill), `envelope.test.ts`, type-lock render test.

## K4 — Sync engine rewrite

1. `syncEngine.ts` per design §4: create/update/delete routing, state handling, error routing, head re-pointing, verify against base hash, honesty of `LAST_SYNCED_AT`, `GKS_SYNCED_COUNT` from server.
2. `deltaStore.ts`: ensure `resetDeltaToPending` increments `retry_count` only for checksum path (separate `bumpRetry`), `rejectDelta(code)` stores code not free text.

**Tests:** `syncEngine.create/update/delete/verify/errors.test.ts` driving `mockGks` scenarios: tags-pending accepted; replay → ALREADY_SYNCED; temporal never blocks; update capture-window vs after-resolution head change; conflict → acknowledged; type-locked → rejected with revert action; deleted-on-desktop → local soft delete; session expired → stop + bus event; 426 → banner + stop; network mid-run → stop, resume next run; `last_synced_at` unset when verify fails.

## K5 — Attachments and telemetry

1. `uploadAttachment` single call; `scan_status` stored; capabilities-driven validation in `attachments/validate.ts`.
2. `telemetry.ts` reduced API; delete `useScreenTracking.ts` and all call sites; `ErrorBoundary` records category only; `flushTelemetry` contract batch.

**Tests:** `attachments.test.ts` (ok/replay/bad-type/checksum/limit/network), `telemetry.test.ts` (vocabulary only, no ids, 200 marks transmitted).

**Status (2026-10-06):** implemented, not yet accepted (tests run on the test machine). As built: migration 005 adds `attachments.scan_status`. The multipart upload drops the JSON `Content-Type` header. Attachment rejections are stored as the contract code. A `422` telemetry batch is dropped rather than retried forever. `CHECKSUM_MISMATCH` became `EDGE_CHECKSUM_MISMATCH`. `contract.ts` gained `EDGE_ERROR_CATALOGUE`, mirroring GKS. Design updates: `observability.md` (current behaviour), `v2-attachment-sync.md` §4.

## K6 — Status and Home UX

1. `StatusDetailScreen.tsx`: plain-word sections, mapped sentences, conditional Retry, "Sync now".
2. `HomeScreen.tsx`: 426 banner, last-synced honesty; `StatusDot` states unchanged.
3. Settings → About "How syncing works".

**Tests:** render tests for status wording given fixture-driven delta states; banner presence.

**Status (2026-10-06):** implemented, not yet accepted (tests run on the test machine). The wording is tested through `statusSummary.test.ts`, driven by the fixture error codes, rather than render tests: the Jest setup has no React Native renderer, and adding one needs approval. `syncEngine.test.ts` gains last-synced honesty, contract-block clearing and `contract`-category cases. Found and fixed along the way: `LAST_SYNCED_AT` was written after failed or aborted runs; Settings linked to a `HowSyncing` route that didn't exist; the unmapped-code sentence didn't match C6.1. Contract drift: GKS sends `client_/server_upgrade_required`, contract §8 says `client_/server_too_old`. The phone accepts both; the contract text needs reconciling in GKS (P8).

## K7 — Device acceptance and release

1. Build (EAS dev build or APK) against GKS 2.1.0 on a scratch or real server.
2. Execute `docs/testing/device-acceptance-checklist.md` on one iOS and one Android device; record results in `docs/testing/device-acceptance-2026-XX-XX.md`.
3. `CHANGELOG.md` 2.0.0; `app.json` version `2.0.0`; tag `v2.0.0`; push.

## Definition of done

- [ ] No request to `/api/v1/records`, `/sync/status`, `/telemetry/events`, `/attachments/workflow` remains in `src/lib`.
- [ ] No `Cookie`, `X-CSRF-Token`, `Origin`, `preserve_authored_body`, `capture_kind` (as payload key) in `src/lib`.
- [ ] `GKS_PASSWORD_ENC` absent from code and cleared on first launch after upgrade.
- [ ] Every contract error code has a mapped sentence; unmapped codes log a `contract` error category.
- [ ] `npm test`, `tsc`, `lint` green; fixtures pin matches GKS `contracts/edge-sync/v1/`.
- [ ] Device checklist executed and recorded.
