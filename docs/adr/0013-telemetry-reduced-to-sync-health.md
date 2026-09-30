# ADR-0013: Telemetry Reduced to Device Sync Health

**Date:** 2026-09-30
**Status:** Accepted — supersedes REQ-0008 and `docs/design/observability.md` (both retained as historical)
**Author:** Harshavardhana P

## Context

REQ-0008 specified per-user session timelines, screen visits with durations, error messages, a GKS admin usage dashboard, and a central multi-tenant observability server with per-user drill-down. GKS's frozen V2 product observability design allows only a fixed event vocabulary, no content, **no client-supplied identifiers**, no error text, and forbids writing telemetry into the FamilyArchive. The GKS `telemetry_ingest.py` written for V2 violated all four. Separately, per-member screen-time telemetry is not needed to operate a family knowledge app and is the kind of collection that erodes a family member's trust if discovered.

## Decision

- The phone collects and transmits **only** device sync health: `sync_run` (result, duration bucket, counts by operation), `error` (category from the contract error catalogue or `network|storage|other`), and `capture_count` (counts by record type). Vocabulary and fields are fixed by the contract (§7).
- **Screen visits, durations, session start/end, error messages and stack traces are not collected on the device at all.** `useScreenTracking` and the session tracker are removed; `ErrorBoundary` records only an error category.
- The client never sends `user_id`, `tenant_id`, or `session_id`; GKS derives identity from the bearer session.
- Transport: `POST /api/v1/edge/telemetry` inside the sync run. Sink: GKS service log and `System/edge/sync-log.jsonl` (operational, not canonical, excluded from Find).
- Administrator visibility is **device health** in GKS Family Access → Devices and Home → Needs Your Attention (stale device, rejected items). No usage dashboard.
- The central observability server (`gks-central-obs`) is not built. If ever revisited it requires a new REQ, a new ADR, and an amendment to the GKS observability design.

## Consequences

- Open question E8 (tenant_id) is moot: there is no tenant concept and no client-side identity in telemetry.
- `implementation-plan-observability.md` steps for the central server and GKS dashboard are cancelled.
- Migration 004 deletes the screen/session telemetry rows already collected in V1.
