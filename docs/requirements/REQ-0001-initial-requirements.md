# REQ-0001: Initial Requirements Overview

**Date:** 2026-09-29  
**Status:** Draft — pending user input  
**Author:** Harshavardhana P

## Purpose

Captures the initial product intent for KM-Edge as stated by the product owner before detailed requirements are gathered.

## Stated Goals (verbatim intent)

1. KM-Edge is an **independent application** — fully functional standalone without GKS running.
2. It targets **edge devices**: mobile phones and tablets (iOS and Android).
3. Its **schema must be compatible** with GKS so that data written on the edge can sync into the GKS vault without lossy transformation.
4. It must support **offline-first operation** — capture works without network.
5. Later, it must support **sync with GKS** — bidirectional or at minimum edge → GKS push.

## Open Questions (to be resolved in next session)

- [ ] What GKS record types must KM-Edge support at launch? (PERSON, EVENT, DECISION, LESSON, GOAL, KNOWLEDGE, NOTE — all or subset?)
- [ ] Is capture-only (write) sufficient at v1, or does read/browse of existing GKS records need to work on device?
- [ ] Sync model: push-only (edge → GKS), pull-only, or bidirectional?
- [ ] Conflict resolution strategy when the same record is edited on edge and in GKS before sync?
- [ ] Target platform: native app (React Native / Flutter) or mobile web (PWA)?
- [ ] Auth model: same GKS session cookie, separate credentials, or device-local only?
- [ ] Is there a specific family member (non-technical user) who is the primary persona?

## Non-Negotiable Constraints (derived from GKS architecture)

- Records must carry the same frontmatter fields GKS uses: `type`, `title`, `date`, `tags`, `status`, `visibility`.
- No cloud service dependency in the data path — sync goes edge → GKS (local network / Tailscale), not edge → cloud → GKS.
- All data at rest on device must be encryptable.
