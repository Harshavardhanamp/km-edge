# ADR-0011: Edge Sync Contract Is Owned by the GKS Repository

**Date:** 2026-09-30
**Status:** Accepted — supersedes `docs/design/GKS-API-extensions.md` (now historical)
**Author:** Harshavardhana P

## Context

KM-Edge and GKS each held half of the sync contract: `GKS-API-extensions.md` here (Draft), and three undocumented commits in GKS. A code trace showed the two halves did not interoperate (field names, strict models, 409 overloading, missing update path, browser-only auth). Two owners guarantee drift.

## Decision

1. The contract lives in the GKS repository at `docs/design/KK-EDGE-SYNC-CONTRACT-V1.md`, versioned (`1`), with fixtures at `contracts/edge-sync/v1/`. GKS is the authority and its API is the contract surface.
2. KM-Edge pins `EDGE_CONTRACT_VERSION = 1` in `src/lib/contract.ts`, sends it on every request, and keeps a **copied, checksum-pinned snapshot** of the fixtures at `src/test/fixtures/edge-sync/v1/` that drives its mock-server tests. A fixture change on the GKS side is adopted here by an explicit pin bump commit.
3. KM-Edge requirements and design documents reference the contract; they do not restate wire shapes. Where this repository's older documents conflict with the contract, the contract wins (REQ-0013 lists the superseded sections).
4. Any change to the contract requires a GKS-side version bump and a KM-Edge ADR noting adoption.

## Consequences

- One place to read to know what the wire looks like.
- KM-Edge cannot ship against an unpublished GKS change; GKS Packet 1 (fixtures) must land before KM-Edge sync work is verified.
- `docs/design/GKS-API-extensions.md` is retained for history and marked superseded.
