# KM-Edge

Offline-first knowledge management for edge devices (mobile, tablet). Designed to operate standalone and sync bidirectionally with the [Generational Knowledge System](https://github.com/Harshavardhanamp/generational-knowledge-system).

## Status

`V1 BETA` complete (local-first capture, no sync). `V2 — GKS sync` in progress.

**2026-09-30 — Sync contract alignment.** A code-level walk of the seam showed the V2 sync engine and the GKS API did not interoperate. The wire contract is now owned by the GKS repository (`generational-knowledge-system/docs/design/KK-EDGE-SYNC-CONTRACT-V1.md`, ADR-0011). KM-Edge's side is frozen in [REQ-0013](docs/requirements/REQ-0013-gks-sync-contract-alignment.md), ADR-0011–0015, [design](docs/design/v2-sync-contract-alignment.md), and [plan](docs/design/implementation-plan-v2-contract-alignment.md). REQ-0008 (observability), `GKS-API-extensions.md`, and the silent re-auth password storage are superseded.

## Core Principle

KM-Edge runs on the edge (iOS, Android, tablet browsers). It captures records locally, works fully offline, and syncs to GKS when connectivity is available. The schema is a strict subset of GKS — every record written on the edge can be ingested by GKS without transformation.

## Repository Structure

```
docs/
  adr/          # Architecture Decision Records (numbered, sequential)
  design/       # Design documents (data model, sync protocol, UI)
  requirements/ # Requirement specs (functional + non-functional)
src/            # Source code (added as requirements solidify)
```

## Documentation Index

### Architecture Decision Records
- [ADR-0001: Repository and Documentation Strategy](docs/adr/0001-repo-and-documentation-strategy.md)
- [ADR-0002: Platform Choice (PWA vs Native)](docs/adr/0002-platform-choice.md) — **OPEN, decision needed**
- [ADR-0003: Offline Authentication Strategy](docs/adr/0003-offline-authentication.md)
- [ADR-0004: Storage Strategy — Cloud Drive as User-Attached Store](docs/adr/0004-storage-strategy.md)
- [ADR-0005: Sync Architecture — Delta Log + Append-Only Audit Trail](docs/adr/0005-sync-architecture.md)
- [ADR-0006: Development Process — Requirements → Design → Plan → Code](docs/adr/0006-development-process.md)
- [ADR-0007: Argon2id Library — hash-wasm](docs/adr/0007-argon2id-library.md)
- [ADR-0008: Cloud Storage OAuth — Full Implementation in Login Sprint](docs/adr/0008-oauth-cloud-storage.md) *(Superseded by ADR-0009)*
- [ADR-0009: Local Device Storage Over Cloud Drive](docs/adr/0009-local-storage-over-cloud-drive.md)
- [ADR-0010: Release Strategy — V1 Beta then V2 Sync with Minimal Gap](docs/adr/0010-release-strategy.md)
- [ADR-0011: Edge Sync Contract Is Owned by the GKS Repository](docs/adr/0011-sync-contract-owned-by-gks.md)
- [ADR-0012: Bearer Device Sessions Replace Cookie Auth and Stored Password](docs/adr/0012-bearer-device-sessions.md)
- [ADR-0013: Telemetry Reduced to Device Sync Health](docs/adr/0013-telemetry-reduced-to-sync-health.md)
- [ADR-0014: Capture-Window Semantics for Edits and Deletes After Sync](docs/adr/0014-capture-window-edit-delete-semantics.md)
- [ADR-0015: Server Discovery by Manual Address and QR Code](docs/adr/0015-server-discovery-manual-and-qr.md)

### Requirements
- [REQ-0001: Initial Requirements Overview](docs/requirements/REQ-0001-initial-requirements.md)
- [REQ-0002: Functional Requirements](docs/requirements/REQ-0002-functional-requirements.md)
- [REQ-0003: Non-Functional Requirements](docs/requirements/REQ-0003-non-functional-requirements.md)
- [REQ-0004: Login Screen](docs/requirements/REQ-0004-login-screen.md)
- REQ-0005 … REQ-0012: see `docs/requirements/`
- [REQ-0013: GKS Sync Contract Alignment (V2.0.0)](docs/requirements/REQ-0013-gks-sync-contract-alignment.md) — **current sync baseline**

### Design Documents
- [Design Index](docs/design/design-index.md)
- [Data Model](docs/design/data-model.md)
- [V2 Sync Contract Alignment](docs/design/v2-sync-contract-alignment.md) and [implementation plan](docs/design/implementation-plan-v2-contract-alignment.md)
- [GKS API Extensions Required](docs/design/GKS-API-extensions.md) *(superseded by the GKS-owned contract, ADR-0011)*

### Testing
- [Device Acceptance Checklist](docs/testing/device-acceptance-checklist.md)

## Relationship to GKS

| Concern | GKS | KM-Edge |
|---|---|---|
| Primary storage | Filesystem Markdown vault | Local SQLite + Markdown export |
| Connectivity | LAN / Tailscale | Fully offline-capable |
| Target device | Desktop / server (Linux) | Mobile / tablet (iOS, Android) |
| Data flow | Authoritative archive | Capture → sync → GKS promotes |
| Schema | Full GKS record model | Subset (capture-time fields only) |
