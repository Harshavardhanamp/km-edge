# Implementation Plan: Login Screen

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0004  
**Design:** login-screen.md  
**ADRs:** ADR-0003, ADR-0004, ADR-0007, ADR-0008

---

## Prerequisites Before Starting

- [ ] `hash-wasm` npm package available (install in Step 2)

Note: Cloud storage OAuth prerequisites removed. Storage is local device (ADR-0009).

---

## Steps

### Step 1 — `src/lib/secureStore.ts`
Typed wrapper over `expo-secure-store`. Defines all credential key constants and typed get/set/delete helpers. No business logic — pure storage interface.

Keys: `gks_server_url`, `gks_username`, `gks_password_enc`, `offline_verifier`, `offline_verifier_salt`, `offline_attempt_count`.

Note: `storage_enc_key` removed — no cloud drive encryption needed (ADR-0009).

### Step 2 — `src/lib/auth.ts`
Argon2id offline verifier using `hash-wasm`.
- `deriveVerifier(password, salt)` → hash string
- `verifyPassword(password, storedHash, salt)` → boolean
- `generateSalt()` → random bytes
- Parameters: time=3, memory=65536, parallelism=1 (matches GKS)

### Step 3 — `src/lib/gksClient.ts`
GKS HTTP client — auth surface only for this sprint.
- `healthCheck(baseUrl)` → `'online' | 'offline'`
- `login(baseUrl, username, password)` → `{ ok: true, cookie: string } | { ok: false, error: string }`
- `logout(baseUrl)` → void
- 401 interceptor for silent re-auth (Step 10 fills this in)

### Step 4 — `src/screens/ServerDiscoveryScreen.tsx`
- Scan Tailscale peers via `expo-network` + parallel health probes
- Auto-select if one result; list if multiple
- QR fallback via `expo-camera` (or `expo-barcode-scanner`)
- On confirmation: save URL via `secureStore`, navigate to Login

### Step 5 — `src/screens/LoginScreen.tsx`
- Username + password fields, show/hide password toggle
- "Log in" → online path via `gksClient.login()`
- "Continue offline" button → shown only when GKS unreachable + verifier exists
- Offline path → `auth.verifyPassword()` → home or increment counter
- "Forgot password?" → `Linking.openURL(gks_url + '/forgot-password')`
- Error states per REQ-0004 L4, L5, L6

### Step 6 — `src/screens/LockoutScreen.tsx`
- Shown when `offline_attempt_count >= 3`
- Single button: "Try online login" — re-enables login screen, requires GKS online
- No other navigation

### ~~Step 7 — StorageSetupScreen~~ — Removed (ADR-0009)
Cloud storage setup screen eliminated. Local device storage requires no setup or OAuth.

### Step 7 — `src/components/StatusDot.tsx`
- Props: `gksState: 'online' | 'syncing' | 'offline'`, `cloudState: 'ok' | 'unavailable'`
- Renders emoji dot + short label
- Used in every screen header

### Step 8 — Navigation wiring (`src/navigation/`)
- Unauthenticated stack: `ServerDiscovery → Login → StorageSetup`
- Authenticated tab stack: `Home | Records | Calendar | Settings` (each with `StatusDot` in header)
- Auth state drives which stack is active (stored session = authenticated)

### Step 9 — Silent re-auth interceptor
- In `gksClient.ts`: wrap all API calls; on 401 → call `login()` with stored credentials → retry once
- On second 401: clear session, navigate to login screen with "Session expired" message

---

## Order Rationale

Steps 1–3 are pure logic with no UI — testable in isolation. Steps 4–7 build screens in user-facing flow order. Step 8 is a shared component needed by all screens. Step 9 wires everything together. Step 10 completes the auth lifecycle.

---

## Definition of Done

- [ ] User can discover GKS server via Tailscale or QR
- [ ] User can log in with GKS credentials (online)
- [ ] User can log in offline after prior online login
- [ ] 3 failed offline attempts triggers lockout; online login clears it
- [ ] Successful login lands directly on home screen (no storage gate)
- [ ] Status dot visible in header on every screen
- [ ] Silent re-auth handles 401 without user interruption
- [ ] TypeScript: zero errors
