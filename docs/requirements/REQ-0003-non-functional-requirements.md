# REQ-0003: Non-Functional Requirements

**Date:** 2026-09-29  
**Status:** Draft  
**Author:** Harshavardhana P

---

## NF1 — Offline-First

- All capture operations (create record, attach file) work with zero network connectivity
- Reads of locally stored records work offline
- Sync and GKS-dependent features gracefully degrade (not crash) when offline
- App launches and is fully functional offline after initial setup

## NF2 — Sync Reliability (Highest Priority NFR)

- **Durability:** No data loss at any failure point — network, app crash, device reboot, storage unavailable
- **Accuracy:** Every synced record in GKS must exactly match the edge record (checksum verified)
- **Idempotency:** Re-transmitting a record that was already received by GKS must not create a duplicate (GKS deduplication by `edge_id`)
- **Recoverability:** App must be able to resume an interrupted sync from the last safe checkpoint without user action beyond re-opening the app
- **Visibility:** User always knows sync state — pending count, in-progress, succeeded, rejected
- **Speed:** Secondary to accuracy. A slow correct sync is preferred over a fast incorrect one.

## NF3 — Security

- Credentials never stored in plaintext on device
- Offline verifier: Argon2id hash of password, stored in device secure enclave / keychain
- Cloud storage: AES-256-GCM encryption of all blobs; key derived via Argon2id from password
- Cloud storage provider (Google Drive, Dropbox) sees only encrypted ciphertext
- No telemetry, no analytics sent to any third party
- GKS session cookie stored in secure, HttpOnly-equivalent storage (Keychain on iOS, Keystore on Android)
- All GKS API calls over Tailscale (private VPN) — no public internet path to GKS

## NF4 — Privacy

- `PRIVATE` records stay private end-to-end — encrypted in cloud storage, sent to GKS with correct `owner_user_id` so GKS RBAC enforces visibility
- No record content sent to any server other than the user's own GKS instance

## NF5 — Schema Stability

- Every field written by KM-Edge must be a valid GKS frontmatter field (no invented fields except `edge_id` which is a declared extension)
- Any schema change in GKS that affects KM-Edge must be documented as an ADR before implementation
- The sync contract (field names, types, values) is versioned; `schema_version: 1` is the current version

## NF6 — Performance

- Record create and local save: < 500ms (excluding attachment upload to cloud storage)
- Home screen load (from cold start, offline): < 2s
- Attachment upload to cloud storage: background, non-blocking, with progress indicator

## NF7 — Accessibility

- Minimum: WCAG 2.1 AA for color contrast and tap target sizes
- Native font scaling respected

## NF8 — Multi-Device Consistency

- The same GKS user logging into KM-Edge on a new device sees all their existing records (sourced from cloud storage)
- No device-specific record state — all mutable state lives in cloud storage keyed by GKS user ID

## NF9 — File Restrictions (Enforced on Edge)

Rejected at capture time (no server round-trip needed):
- Any extension not in the GKS `ALLOWED_EXT` set
- Password-protected or encrypted files (detected by file header inspection)
- Archive/compressed files (`.zip`, `.tar`, `.gz`, `.7z`, `.rar`)
- Executables

Content scanning (malware) is delegated to GKS at sync time — not performed on edge.
