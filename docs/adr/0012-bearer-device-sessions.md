# ADR-0012: Bearer Device Sessions Replace Cookie Auth and Stored Password

**Date:** 2026-09-30
**Status:** Accepted — supersedes the ADR-0003 addendum "Silent Re-auth Password Storage (V1)"
**Author:** Harshavardhana P

## Context

GKS authentication is a browser-session design: `HttpOnly` cookie, CSRF token derived from the session, and a mandatory exact-match `Origin` header on every non-GET request. React Native `fetch` does not reliably expose `Set-Cookie` on iOS, may ignore a manually set `Cookie` header in favour of the native cookie jar, and never sends `Origin`. The V1 client therefore held the cookie in a module variable (lost on restart and absent in the background-fetch JS context) and fell back to re-logging-in with the **plaintext password stored in SecureStore** (`GKS_PASSWORD_ENC`) on every 401. GKS rate-limits logins to 20/hour/identifier. Sessions were 8 h absolute / 30 min idle — built for a browser tab, not a device that syncs overnight.

## Decision

Adopt the GKS **edge auth profile** (GKS design §2; contract §3):

- `POST /api/v1/edge/auth/login` returns an opaque **bearer token**; every edge request sends `Authorization: Bearer`, `X-Edge-Contract-Version`, `X-Edge-Device-Id`. No cookie, no CSRF, no Origin.
- Sessions are **30 days absolute, no idle timeout, bound to `device_id`**, revocable by an administrator in Family Access → Devices.
- **No password is stored on the device.** `GKS_PASSWORD_ENC` and silent re-auth are removed. On `EDGE_SESSION_EXPIRED` / `EDGE_SESSION_REVOKED` the user is returned to Login; pending deltas wait.
- Token and expiry live in SecureStore so the background sync task can use them.
- `device_id` is a UUIDv4 generated once per install and kept in SecureStore; `device_name` defaults to the OS device name and is editable in Settings.

## Consequences

- A lost phone can be signed out remotely; today it cannot.
- A member logs in roughly monthly; the offline verifier (ADR-0003) is refreshed at that time, so password changes propagate within a month at most or immediately on next online login.
- Rate-limit pressure from re-auth disappears.
- ADR-0003's "V2 upgrade path" (refresh tokens) is fulfilled by long-lived device sessions rather than a refresh-token exchange; no refresh endpoint is needed.
