# ADR-0010: Release Strategy — V1 Beta then V2 Sync with Minimal Gap

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Decision

### V1 — Beta
Ship a working, useful app with local-first capture. No sync.

Scope:
- Login (server discovery, online + offline auth, lockout)
- Home screen (capture-first, calendar strip, recent records, status dot)
- Record capture (all 7 types, attachments)
- Local SQLite storage (ADR-0009)
- Calendar integration (device native)

### V2 — Sync
GKS sync ships with the **smallest possible delay** after V1 beta. V2 is not a distant future release — it follows V1 almost immediately.

Scope:
- Edge → GKS sync (delta log, idempotent retry, ADR-0005)
- GKS online/offline indicator + last synced timestamp
- GKS-side `edge_id` deduplication (prerequisite, tracked in GKS-API-extensions.md)

## Consequence: Design Must Stay Sync-Ready

Because V2 follows V1 immediately, every V1 design decision must be made with sync in mind. Specifically:

- The local SQLite schema must match the edge record envelope in `data-model.md` exactly — no field added in V1 that cannot be synced to GKS
- The delta log structure (ADR-0005) must be implemented in V1 even though sync itself isn't — every write appends to the delta log so V2 sync has a complete history from day one
- No V1 shortcut that creates a schema migration problem for V2

## What This Means in Practice

When designing any V1 feature, ask: *does this create any obstacle for V2 sync?* If yes, resolve it in the V1 design, not later.
