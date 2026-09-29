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

- [ADR-0001: Repository and Documentation Strategy](docs/adr/0001-repo-and-documentation-strategy.md)
- [REQ-0001: Initial Requirements Overview](docs/requirements/REQ-0001-initial-requirements.md)

## Relationship to GKS

| Concern | GKS | KM-Edge |
|---|---|---|
| Primary storage | Filesystem Markdown vault | Local SQLite + Markdown export |
| Connectivity | LAN / Tailscale | Fully offline-capable |
| Target device | Desktop / server (Linux) | Mobile / tablet (iOS, Android) |
| Data flow | Authoritative archive | Capture → sync → GKS promotes |
| Schema | Full GKS record model | Subset (capture-time fields only) |
