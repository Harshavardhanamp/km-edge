# ADR-0001: Repository and Documentation Strategy

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Context

KM-Edge is a new standalone application that must eventually sync with the Generational Knowledge System (GKS). Before any code is written, a documentation strategy is needed so every design decision, schema choice, and requirement is traceable.

## Decision

1. **Separate repository** (`km-edge`) — not a subdirectory of GKS. Keeps the edge app independently deployable and versioned.
2. **Three doc layers:**
   - `docs/adr/` — Architecture Decision Records. One file per decision, numbered sequentially. Never deleted; superseded ADRs are marked Superseded with a pointer.
   - `docs/design/` — Design documents. Data model, sync protocol, API contract, UI/UX flows.
   - `docs/requirements/` — Requirement specs. Numbered REQ-XXXX. Each requirement links back to the user need that drove it.
3. **Document-first development** — no source code is added until the relevant requirement and design doc exist.
4. **Schema compatibility constraint** — every data structure defined in KM-Edge must be expressible as a GKS record type with no lossy transformation. This is a hard constraint, not a goal.

## Consequences

- Slower start (docs before code) but avoids schema drift that would make sync impossible.
- ADR log gives future contributors (and AI agents) full decision context.
- Any AI agent working on this repo must read the ADR log before proposing schema changes.
