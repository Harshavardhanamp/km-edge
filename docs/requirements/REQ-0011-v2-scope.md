# REQ-0011: V2 Scope Items

**Date:** 2026-09-29  
**Status:** Frozen — V2 backlog  
**Author:** Harshavardhana P

Items confirmed as V2 scope during V1 design sessions. Not to be implemented in V1.

---

## V2-001 — Deep Linking + Push Notifications

- URL scheme: `kmedge://record/<edge_id>` — opens `RecordDetailScreen` for a specific record
- Used by push notifications to deep-link into a specific record
- Requires: `expo-notifications`, deep link registration in `app.json`
- Dependency: notifications require a server-side trigger — natural fit with GKS sync (V2)

## V2-002 — GKS Sync (Edge → GKS)

Already specified in ADR-0005, REQ-0002 F7. Delta log written in V1 — V2 transmits it.

## V2-003 — Telemetry Transmission (Edge → GKS → Central Server)

Batched with V2 sync. Central server built in V1 and ready to receive.

## V2-004 — Buffer Durability (Memory → SQLite)

Device memory buffer for cloud-unavailable captures upgraded to SQLite persistence. Deferred from V1 (REQ-0004 L9 decision).

## V2-005 — Biometric Login

Face ID / Touch ID / Android fingerprint. Replaces password re-entry after first login. (REQ-0004 F5.4)

## V2-006 — Bidirectional Sync (GKS → Edge Pull)

GKS records pulled back to edge. Enables: viewing records created on GKS desktop app from the edge device, receiving AI-improved titles, family member records (if shared).

## V2-007 — Conflict Resolution

When same record edited on edge and in GKS before sync. Decision deferred to V2 design phase.
