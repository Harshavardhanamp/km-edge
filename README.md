# KM-Edge

Offline-first knowledge management for edge devices (mobile, tablet). Designed to operate standalone and sync bidirectionally with the [Generational Knowledge System](https://github.com/Harshavardhanamp/generational-knowledge-system).

## Status

`PRE-ALPHA` — requirements gathering phase.

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

### Requirements
- [REQ-0001: Initial Requirements Overview](docs/requirements/REQ-0001-initial-requirements.md)
- [REQ-0002: Functional Requirements](docs/requirements/REQ-0002-functional-requirements.md)
- [REQ-0003: Non-Functional Requirements](docs/requirements/REQ-0003-non-functional-requirements.md)
- [REQ-0004: Login Screen](docs/requirements/REQ-0004-login-screen.md)

### Design Documents
- [Data Model](docs/design/data-model.md)
- [GKS API Extensions Required](docs/design/GKS-API-extensions.md)

## Relationship to GKS

| Concern | GKS | KM-Edge |
|---|---|---|
| Primary storage | Filesystem Markdown vault | Local SQLite + Markdown export |
| Connectivity | LAN / Tailscale | Fully offline-capable |
| Target device | Desktop / server (Linux) | Mobile / tablet (iOS, Android) |
| Data flow | Authoritative archive | Capture → sync → GKS promotes |
| Schema | Full GKS record model | Subset (capture-time fields only) |
