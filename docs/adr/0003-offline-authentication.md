# ADR-0003: Offline Authentication Strategy

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Context

GKS authenticates users via `POST /api/v1/auth/login` (username + password, Argon2id, session cookie, 8h TTL). GKS has no offline credential cache — the session database is intentionally ephemeral. When GKS is unreachable (Tailscale down, server offline), the current GKS session cookie cannot be renewed.

KM-Edge must function offline (capture records, view local data). The user must still be able to prove identity to unlock the local encrypted store without phoning home to GKS.

## Decision

At first successful GKS login from a device:
1. Derive a device-local credential verifier: `Argon2id(password, device_salt, time=3, mem=64MB)` — same parameters as GKS
2. Store verifier + device_salt in the device secure enclave (iOS Keychain, Android Keystore) — never in plaintext
3. Also derive the cloud storage encryption key from the same password: `Argon2id(password, storage_salt)` — stored separately in secure enclave

On subsequent logins when GKS is offline:
1. Hash the entered password with the stored device_salt
2. Compare with stored verifier (constant-time comparison)
3. If match: unlock local store, set `session.mode = OFFLINE`. Sync is blocked; all other features work.
4. If no match: deny access. No password reset possible offline (GKS is the identity authority).

On subsequent logins when GKS is online:
1. Validate against GKS first (primary path)
2. On success: refresh the local verifier (handles password changes)
3. Obtain a fresh GKS session cookie for API calls

## Why Not Store the GKS Session Cookie Long-Term?

GKS session tokens are hashed before storage and expire after 8h absolute. Storing them beyond expiry would require GKS to accept expired tokens — a security regression we don't want to impose on GKS.

## Security Considerations

- The offline verifier is only as secure as the device secure enclave. If the device is compromised, the verifier is compromised. This is accepted — it matches the threat model of every mobile banking app.
- Password changes in GKS are not propagated to the offline verifier until the next successful online login. If a user changes their GKS password, they must log in online once before offline login works with the new password.
- After 3 consecutive failed offline login attempts, the offline verifier is invalidated and the user must log in online.

## Consequences

- Users can log in and use KM-Edge fully offline after one successful online login
- Password change propagation requires one online login — document this clearly in the UI
- Biometric auth (F5.4) replaces the password re-entry step but the cryptographic root is still the password-derived verifier

## Addendum — 2026-09-29: Silent Re-auth Password Storage (V1)

**Context:** GKS session cookies expire after 8h. Any API call made after expiry returns 401. To avoid interrupting the user mid-session, `gksClient.ts` silently re-authenticates by re-reading `GKS_PASSWORD_ENC` from secure store and replaying the login call.

**Decision:** Store the plaintext GKS password (as `GKS_PASSWORD_ENC`) in the device secure store alongside the offline verifier. This is the same credential store used for the verifier — it does not weaken the existing threat model.

**Tradeoff accepted:** `GKS_PASSWORD_ENC` is the raw GKS password, not encrypted beyond what the OS secure store provides. The name `_ENC` is aspirational — in V1 it is protected only by the OS credential store (iOS Keychain, Android Keystore), which is sufficient for the stated threat model.

**V2 upgrade path:** Replace with short-lived refresh tokens on the GKS side. When GKS issues a refresh token on login, silent re-auth uses the token instead of the password. `GKS_PASSWORD_ENC` can then be removed from secure store entirely.
