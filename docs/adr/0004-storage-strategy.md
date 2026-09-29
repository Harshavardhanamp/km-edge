# ADR-0004: Storage Strategy — Cloud Drive as User-Attached Store

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Context

Requirement: the same GKS user logging into KM-Edge from any device must see the same records. Device-local-only storage cannot satisfy this — it breaks on reinstall, device change, or second device login.

Options considered:

| Option | Pros | Cons |
|---|---|---|
| **Device local only** | Simple, no dependency | Breaks multi-device requirement entirely |
| **GKS as the edge store** | Single source of truth | Requires GKS to be online for all reads — kills offline-first |
| **User-attached cloud drive** (Google Drive / Dropbox) | Multi-device; user owns data; no new infra to operate | OAuth dependency; user must set up once; cloud provider sees encrypted blobs |
| **Our own sync server** | Full control | New infra to build and operate — violates local-first principle |

## Decision

Use **user-attached cloud drive** as the durable edge store. Records and attachments are encrypted before upload; the cloud provider is an untrusted blob store. The user connects their Google Drive or Dropbox once during app setup (OAuth2). The app uses only an app-specific folder.

All reads from any device go to the cloud drive first; local device cache is a performance layer only.

## Storage Layout

```
KM-Edge/                                   ← app folder in cloud drive
  accounts/<gks_user_id>/
    records/
      <edge_id>.json                        ← encrypted record envelope
    attachments/
      <sha256[:2]>/<sha256>                 ← encrypted blob, content-addressed
    sync/
      state.json                            ← last sync timestamp, GKS mapping table
      delta.json                            ← append-only change log (durable)
```

## Encryption

- All files encrypted with AES-256-GCM before upload
- Key derived from user password via Argon2id (separate salt from offline auth verifier)
- Key stored in device secure enclave
- Each file gets a random 96-bit nonce; nonce prepended to ciphertext
- Cloud provider sees only encrypted ciphertext + random nonces — no plaintext metadata

## Multi-Device Key Access

The encryption key is derived from the user's password — any device where the user logs in and enters their password can derive the same key. No key synchronization protocol needed.

## Consequences

- User must connect a Google Drive or Dropbox account during initial setup (one-time)
- Cloud provider receives encrypted blobs (GDPR-compliant: provider cannot read content)
- If user forgets password: cloud data is unrecoverable (by design — same as GKS LUKS encrypted zones)
- Switching cloud provider: manual export required (not in initial release)
- Initial cloud drive setup must happen while online; all subsequent operations work offline with local cache
