# REQ-0004: Login Screen

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Phase:** Requirements — complete, no open questions

---

## Prerequisites

- User must have a GKS account already created by a GKS administrator.
- KM-Edge has no self-registration. The app is a client of GKS identity.

---

## L1 — GKS Server Discovery

Before login is possible, the app must know where the user's GKS instance lives.

### L1.1 Primary: Auto-discovery via Tailscale
- App scans the Tailscale network for a host responding to `GET <host>/api/v1/health`
- Displays discovered host(s) for the user to confirm
- User selects their GKS instance from the discovered list

### L1.2 Failover: QR Code
- If auto-discovery finds nothing, offer "Scan QR code" option
- GKS admin generates a QR code from the GKS admin panel
- QR encodes the GKS URL (and optionally any required config)
- User scans it with the device camera; app extracts and stores the URL

### L1.3 Stored server address
- Once a GKS URL is confirmed (via either method), it is stored persistently in device secure storage
- On subsequent launches, the stored URL is used directly — no re-discovery needed
- User can change it from Settings if needed

---

## L2 — First Launch Flow

```
Fresh install
  └── Login screen (username + password field)
       └── [GKS server not yet known] → server discovery (L1) first
       └── Successful login
            └── Cloud storage not yet connected?
                 ├── YES → Cloud storage setup screen (mandatory, cannot skip)
                 └── NO  → Home screen
```

The user **cannot proceed past cloud storage setup** until a provider (Google Drive or Dropbox) is connected. This is a hard gate.

---

## L3 — Login Screen Fields

- **Username** — text input, same identifier accepted by GKS (username or email)
- **Password** — secure text input, masked
- **Login button** — triggers GKS authentication
- **Forgot password** — link that opens the GKS password reset page in the device browser (GKS owns password reset)

No self-registration link. No "Create account" option.

---

## L4 — Successful Online Login

1. App calls `POST <gks>/api/v1/auth/login` with username + password
2. On 200: store GKS session cookie for subsequent API calls
3. Derive and store offline credential verifier in device secure enclave (Argon2id, per ADR-0003)
4. Navigate to cloud storage setup (if not yet connected) or home screen

---

## L5 — Failed Login (Online)

- Wrong credentials: show inline error "Incorrect username or password"
- GKS unreachable: show "Cannot reach GKS — check your connection" with a retry button
- No lockout on the online path — GKS rate-limits the auth endpoint on its side

---

## L6 — Offline Login (GKS unreachable)

When the GKS server is unreachable and a prior successful login exists on the device:

1. App detects GKS is unreachable (health probe fails)
2. Automatically offers offline login mode on the login screen
3. User enters password; app verifies against the device-local Argon2id verifier (ADR-0003)
4. On match: user enters the app in `OFFLINE` mode. Sync is blocked. All local read/write works.
5. On mismatch: increment offline attempt counter

### L6.1 Offline attempt lockout
- After **3 consecutive failed offline attempts**: offline access is locked
- Lockout screen shows only one option: "Login with GKS" (requires GKS to be reachable)
- Successful online login resets the lockout counter and refreshes the offline verifier

---

## L7 — Cloud Storage Not Connected (degraded mode)

If a user somehow reaches the home screen without cloud storage connected (e.g. after lockout + online login bypass):

- A prominent persistent banner is shown: "Storage not configured — captures will not be saved"
- New captures are held in device memory buffer only
- Nothing is persisted to durable storage until cloud storage is connected
- Settings tab always accessible to connect storage

---

## L8 — Cloud Storage Full

- App does **not** block capture
- A prominent warning banner is shown: "Cloud storage is full — free up space to persist new records"
- New captures are held in device memory buffer
- When space becomes available, buffer is flushed to cloud storage automatically

---

## L9 — Cloud Storage Unavailable (no signal / provider outage)

- App does **not** block capture
- New captures go to a device-local memory buffer
- User sees an indicator: "Saving locally — will sync to cloud when available"
- When cloud storage reconnects, buffer is flushed automatically — no user action needed
- Buffer survives app backgrounding; does not survive app force-quit or device reboot (acceptable: data is captured in memory, not lost permanently if cloud reconnects before quit)

> **Open question for design phase:** Should the buffer survive a force-quit/reboot? That requires writing to device-local SQLite, which is a larger decision. Flagged for design.

---

## L10 — Session Expiry

- GKS session TTL: 8h absolute, 30min idle
- When session expires while online: re-authenticate silently in background (if password cached in secure store — design decision needed)
- When session expires while offline: continue in offline mode; re-authenticate with GKS next time online

---

## Out of Scope (Initial Release)

- Biometric login (Face ID, Touch ID) — post-initial release (F5.4)
- Multi-account support (multiple GKS instances) — not planned
- SSO / OAuth / social login — not planned
