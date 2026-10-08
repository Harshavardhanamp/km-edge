# Changelog

## 2.1.0 — Unreleased (KK-2.2 Packet E2: structure at capture, Edge Sync Contract v2; tag `v2.1.0` after `v2.0.0` and the 2.1 device run; requires Kashyap's Knowledge 2.7.0)

- **Review card before saving:** Save opens a card with title, summary, type, importance, Topics, People, Place, dates and visibility. Confirm needs at least one Topic, Person or Place, and a year on every date. Discard asks first.
- **Names offline:** a cached list of names (Household names plus your own Private ones) from `GET /api/v1/edge/identities`, refreshed after each sync and when the app returns to the foreground, cleared on sign-out. Names you type that are not in the list are sent as labels and matched by the desktop.
- **Suggestions:** `POST /api/v1/edge/suggest` fills empty fields within 3 seconds. Otherwise the card says "taking a while", "unavailable" or "Offline" and you fill it in yourself. Fields you have touched are never overwritten.
- **Unfinished capture kept:** the card is saved as you go and reopens after the app is closed. It is cleared by Confirm, Discard or sign-out.
- **Record page** lists Topics, People and Place, and "Waiting for the desktop to match: …" until the desktop links them.
- **Contract v2** (`X-Edge-Contract-Version: 2`); new error code `EDGE_IDENTITY_NOT_FOUND` (silent, informational). A server that supports only v1 shows "Ask your administrator to update Kashyap’s Knowledge." (426 `server_too_old`).
- Local database migration 006 (additive): `records.structure_json`, `records.resolution_json`, `identity_cache`, `capture_draft`.
- Pinned v2 fixtures in `src/test/fixtures/edge-sync/v2/`.

## 2.0.0 — Release candidate (GKS sync, contract v1; tag `v2.0.0` after device acceptance)

Requires Kashyap's Knowledge 2.1.0. Requirements: REQ-0013. Decisions: ADR-0011–0015. Plan: `docs/design/implementation-plan-v2-contract-alignment.md` (K0–K7).

- **Sign-in and discovery (K2):** bearer device sessions (30 days, revocable by the administrator); a stable device id; connecting by address or QR (`kmedge://connect`). The password is never stored on the phone, and a V1 stored password is removed on first launch.
- **Capture envelope (K3):** records are sent in the contract v1 envelope. Event dates are stored as columns, and the type is locked once a record has synced.
- **Sync engine (K4):** create, update and delete through `/api/v1/edge/records`. Replays are safe. Head hashes are verified against `sync-status`, with up to 3 tries before a checksum rejection.
- **Attachments (K5):** one upload call stores and binds each file. Server limits come from capabilities, and the scan result is stored.
- **Device-health telemetry (K5):** sync runs, error categories and capture counts only. No ids, screens or messages leave the phone.
- **Status and Home (K6):**
  - Plain-word sync status: Waiting to sync, Synced, Needs attention with one action per item (Retry, Edit or Open record), and Sync now.
  - "Last synced" only counts runs that finished and verified.
  - Home shows a persistent banner when the app or the server needs an update.
  - Settings → About → How syncing works.
- **Release fixes (K7):**
  - File-system calls use `expo-file-system/legacy`; with this SDK, the main entry's legacy methods throw at runtime.
  - `package.json` now declares every native module the app imports (SDK-57 versions from `expo install`).
  - Attachment hashes are SHA-256 of the raw file bytes, as GKS verifies them. V1 hashed the base64 text, which would have failed every upload with `EDGE_CHECKSUM_MISMATCH`. Uploads recompute the hash, so files saved by V1 still sync.
  - App version is 2.0.0.

## 1.0.0 — V1 beta (tag: `v1.0.0`)

Local-first capture, login, Home, calendar and attachments, with no sync.
