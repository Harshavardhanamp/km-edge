# ADR-0009: Local Device Storage Over Cloud Drive

**Date:** 2026-09-29  
**Status:** Accepted — supersedes ADR-0004  
**Author:** Harshavardhana P

## Context

ADR-0004 chose user-attached cloud drive (Google Drive / Dropbox) as the edge store, primarily to solve multi-device access and durability. After further analysis, this decision was revisited.

## Arguments Against Cloud Drive

1. **GKS is already the durable multi-device store.** Once sync is built, GKS holds everything. Cloud drive becomes a redundant middle layer — a third place data lives, with its own failure modes.
2. **The gap between V1 (no sync) and V2 (sync) is expected to be short.** The data-loss risk in that window is accepted by the product owner.
3. **OAuth adds friction and external dependencies.** Google Cloud Console + Dropbox App Console registration, OAuth2 browser flows, token refresh, provider outages — all removed.
4. **Cloud drive violates local-first.** The first principle is local-first storage. Writing to cloud drive at capture time is not local-first — it requires network and an external provider to be available.

## Decision

**Local device storage only.** Records and attachments stored in the app's sandboxed local filesystem using `expo-sqlite` (structured records) and `expo-file-system` (attachment blobs). No cloud drive. No OAuth.

**Durability model:**
- OS backup (iOS iCloud, Android Auto Backup) provides passive durability at no extra effort
- GKS sync is the primary durability and multi-device mechanism once V2 ships

**Encryption:**
- Data at rest: OS sandbox + OS backup encryption (device passcode-encrypted on iOS, similar on Android) — sufficient for V1
- Data in transit (sync): TLS over Tailscale — encrypted end-to-end between edge and GKS

## What This Removes

- Google Drive OAuth setup and credentials (ADR-0008 partially superseded — OAuth no longer needed for storage)
- Cloud storage setup screen (mandatory gate removed from login flow)
- AES-256-GCM encryption layer at the app level (OS handles at-rest encryption)
- `storage_enc_key` from secure store
- Cloud drive provider dependency entirely

## What Replaces It

| Was | Now |
|---|---|
| Cloud drive encrypted blob store | `expo-sqlite` + `expo-file-system` app sandbox |
| OAuth2 flow at first login | Nothing — local storage is always available |
| Cloud storage setup screen | Removed from login flow |
| Per-file AES-GCM encryption | OS-level device encryption |
| Multi-device via cloud drive | Multi-device via GKS sync (V2) |

## Consequences

- Login flow is simpler — no storage setup gate after login
- No external account required from the user
- Local-first principle is preserved end-to-end
- V1 data loss risk: if device is lost before sync ships, records are lost (accepted)
- Multi-device access requires sync (V2) — not available in V1 (accepted)
- Implementation effort for storage drops significantly

## Impact on Previous ADRs

- ADR-0004 (cloud drive storage): **Superseded** by this ADR
- ADR-0008 (OAuth in login sprint): **Superseded** — OAuth no longer needed for storage; cloud storage setup screen removed from login plan
