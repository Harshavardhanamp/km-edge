# Test Plan: Authentication & Offline Login

**Date:** 2026-09-30  
**Status:** Draft  
**Scope:** Login flow, server discovery, offline verifier, lockout, session expiry  
**Requirement:** REQ-0004  

---

## Prerequisites

- Fresh install or cleared app data (no stored credentials)
- GKS instance running and reachable via Tailscale
- A valid GKS account exists

---

## A1 — Server Discovery: Auto-discovery

| Step | Action | Expected |
|---|---|---|
| A1.1 | Launch app fresh install | Server discovery screen shown |
| A1.2 | Wait for Tailscale subnet scan | Spinner shown while scanning |
| A1.3 | GKS server found | Server hostname shown; single server auto-confirms and proceeds to login |
| A1.4 | Multiple servers found | List shown; user selects one |
| A1.5 | After selection | Login screen shown; `GKS_SERVER_URL` stored in SecureStore |

---

## A2 — Server Discovery: QR Code

| Step | Action | Expected |
|---|---|---|
| A2.1 | Launch with Tailscale disconnected | No servers found — error screen |
| A2.2 | Tap "Scan QR code instead" | Camera permission requested |
| A2.3 | Scan valid GKS QR code | Health probe succeeds; login screen shown |
| A2.4 | Scan invalid / non-GKS QR code | Nothing happens — camera stays open, waiting |

---

## A3 — Server Discovery: Manual URL (L1.3)

| Step | Action | Expected |
|---|---|---|
| A3.1 | On error screen tap "Enter URL manually" | URL input field shown |
| A3.2 | Enter reachable GKS URL (e.g. `http://100.x.x.x:8000`) | Tap Connect → health probe succeeds → login screen |
| A3.3 | Enter unreachable URL | Alert: "Cannot reach server — check URL and Tailscale" |
| A3.4 | Leave field empty, tap Connect | No action (button effectively disabled for empty input) |

---

## A4 — Successful Online Login

| Step | Action | Expected |
|---|---|---|
| A4.1 | Enter valid username + password | Login succeeds |
| A4.2 | Home screen shown | Account display name visible |
| A4.3 | Check SecureStore | `GKS_USERNAME`, `GKS_USER_ID`, `OFFLINE_VERIFIER`, `OFFLINE_VERIFIER_SALT` all set |

---

## A5 — Failed Online Login

| Step | Action | Expected |
|---|---|---|
| A5.1 | Enter wrong password | Inline error "Incorrect username or password" |
| A5.2 | Enter wrong username | Same inline error |
| A5.3 | GKS unreachable (Tailscale down) | "Cannot reach GKS — check your connection" with retry button |

---

## A6 — Offline Login: Happy Path

| Step | Action | Expected |
|---|---|---|
| A6.1 | Login online (A4) first | Offline verifier stored |
| A6.2 | Disconnect Tailscale | StatusDot turns red |
| A6.3 | Force-quit app, reopen | Offline login option automatically offered |
| A6.4 | Enter correct password | Access granted; `offline_mode: true` banner shown |
| A6.5 | Create a record | Record saved locally; sync blocked |

---

## A7 — Offline Login: Wrong Password + Lockout

| Step | Action | Expected |
|---|---|---|
| A7.1 | Offline login, enter wrong password | Inline error; attempt counter incremented |
| A7.2 | Enter wrong password twice more (3 total) | Lockout screen shown |
| A7.3 | Lockout screen | Only "Login with GKS" option visible; local access blocked |
| A7.4 | Reconnect Tailscale, tap "Login with GKS" | Online login; on success lockout reset, verifier refreshed |

---

## A8 — Session Expiry (Online)

| Step | Action | Expected |
|---|---|---|
| A8.1 | Login successfully | Session cookie stored |
| A8.2 | Simulate session expiry (wait or manually expire via GKS admin) | — |
| A8.3 | Trigger any sync action | `fetchWithReauth` silently re-auths with stored credentials |
| A8.4 | Re-auth succeeds | Sync proceeds; user sees no interruption |
| A8.5 | Re-auth fails (password changed on GKS) | "Session expired — log in again" UI shown |

---

## A9 — Logout

| Step | Action | Expected |
|---|---|---|
| A9.1 | Settings → Log out | Confirmation dialog shown |
| A9.2 | Confirm | Session cleared; login screen shown |
| A9.3 | Check SecureStore | `GKS_USERNAME`, `GKS_USER_ID`, `GKS_PASSWORD_ENC`, `OFFLINE_VERIFIER` all cleared |
| A9.4 | `CALENDAR_SELECTED_IDS` | Retained (preference, not session data) |

---

## A10 — Re-discovery from Settings

| Step | Action | Expected |
|---|---|---|
| A10.1 | Settings → "Re-discover server" | Server discovery screen opens |
| A10.2 | Select new server | `GKS_SERVER_URL` updated; login screen shown |

---

## Pass Criteria

All online login, offline login, and lockout paths behave as specified. No credentials stored in plaintext. Lockout correctly blocks local access after 3 wrong attempts. Session expiry triggers silent re-auth when credentials are available.
