# V2 Deep Linking Design

**Date:** 2026-09-29
**Author:** Harshavardhana P
**Requirement:** REQ-0012 V2-F5
**Status:** Draft

---

## 1. Overview

Deep linking lets the OS launch KM-Edge and navigate directly to a specific local record from an external URL. In V2 the scheme is registered but there is no active user-facing entry point (no share sheet integration, no push notifications). The feature is built now because V3 push notifications require a working URL handler to be in place — registering the scheme and wiring the navigation plumbing is the prerequisite. Adding push in V3 becomes a matter of sending the URL; the app-side handling is already complete.

---

## 2. URL Scheme

**Scheme:** `kmedge`

**Supported path (V2):**

```
kmedge://record/<edge_id>
```

`edge_id` is the UUID stored in the local `records` table (e.g. `01927c4a-5b3d-7e2f-9a1c-000000000001`).

**All other paths** (unrecognised host, missing segment, unknown structure): navigate to HomeScreen silently. No error is shown to the user.

**app.json change** — add the scheme under the `expo` key:

```json
{
  "expo": {
    "scheme": "kmedge"
  }
}
```

This registers the custom URL scheme with iOS and Android so the OS routes incoming `kmedge://` URLs to the app.

---

## 3. Navigation Flow — Warm Start

The warm start path handles a URL arriving while the app is already running.

1. On mount, `RootNavigator` calls `Linking.addEventListener('url', handleUrl)`. The listener is removed on unmount.
2. The OS delivers the URL string to `handleUrl`.
3. `handleUrl` calls `parseRecordUrl(url)` which returns `edge_id` if the path matches `kmedge://record/<uuid>`, or `null` for any other path.
4. If `edge_id` is null: navigate to `HomeTab` via the root nav ref. Done.
5. If `edge_id` is present: call `getRecord(edge_id)` against the local SQLite `records` table (synchronous `db.getFirstSync`).
6. If the record is found: navigate to `HomeTab` first, then push `RecordDetail` into the HomeStack. `RecordDetail` is nested inside `HomeStack` — it cannot be targeted from the root navigator directly. Use `navigationRef.current?.navigate('HomeTab', { screen: 'RecordDetail', params: { edge_id } })`.
7. If the record is not found: show an `Alert.alert('Record not found')` and navigate to `HomeTab`. There is no toast component in the app; `Alert` is the correct substitute.

The navigation ref (`navigationRef`) is already the standard pattern for navigating outside React components. `RootNavigator` holds this ref and passes it to `NavigationContainer`.

---

## 4. Navigation Flow — Cold Start

The cold start path handles a URL arriving when the app is not running. The OS launches the app with the URL as the initial link.

1. On mount, `RootNavigator` calls `Linking.getInitialURL()` (async). This returns the launch URL or `null`.
2. The result is parsed with `parseRecordUrl`. If it resolves to an `edge_id`, it is stored in a module-level variable `pendingDeepLinkUrl` inside `RootNavigator.tsx` (not in state, not in context — a plain `let` at module scope is sufficient because the module is loaded once per app session).
3. The app proceeds through its normal boot: `AuthProvider` restores credentials from SecureStore. `RootNavigator` renders `AuthStack` while `sessionValid` is false.
4. `AuthContext` calls `setLoaded(true)` once the restore attempt completes. Until `loaded` is true, `AuthProvider` returns null, so no navigation occurs.
5. When `sessionValid` becomes true, `RootNavigator` renders `AppShell`. At this point, a `useEffect` in `RootNavigator` checks `pendingDeepLinkUrl`.
6. If `pendingDeepLinkUrl` is set: clear the variable, then perform the same lookup-and-navigate logic as the warm start (step 5–7 above).

**Where the pending URL is stored:** Module-level `let pendingDeepLinkUrl: string | null = null` in `RootNavigator.tsx`. AuthContext is not modified — the URL is navigation state, not auth state.

**Timing:** The `useEffect` that consumes `pendingDeepLinkUrl` depends on `[sessionValid]`. It fires whenever `sessionValid` transitions. If the user is already authenticated when the effect first runs (session restored from SecureStore), the URL is consumed immediately on first render of `AppShell`.

---

## 5. Missing Record Handling

If `getRecord(edge_id)` returns null or undefined:

- Show `Alert.alert('Record not found')` — no toast component exists in the app
- Navigate to `HomeTab`

No sync is triggered. V2 is push-only — there is no mechanism to fetch a record from GKS that is not already present locally. This is specified in REQ-0012 F5.5 and is an intentional constraint, not a gap.

---

## 6. Implementation Changes

### app.json

Add `"scheme": "kmedge"` to the `expo` object. No other app.json changes.

### RootNavigator.tsx

Current file: 24 lines. Changes:

1. Add a module-level variable: `let pendingDeepLinkUrl: string | null = null`.
2. Add `Linking.getInitialURL()` call on mount. Parse with `parseRecordUrl`. Store in `pendingDeepLinkUrl` if non-null.
3. Add `Linking.addEventListener('url', handleUrl)` on mount. Remove listener on unmount.
4. Add a `useEffect([sessionValid])` that, when `sessionValid` becomes true, checks `pendingDeepLinkUrl`, clears it, and calls the record lookup + navigate.
5. Add a `navigationRef` passed to `NavigationContainer` for navigating outside React (needed by the `Linking` callback, which is not inside the component tree).

### New helper: `parseRecordUrl`

Inline in `RootNavigator.tsx` (or extracted to `src/lib/deepLink.ts` if reused elsewhere — not needed in V2):

```typescript
function parseRecordUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'kmedge:') return null;
    const match = parsed.pathname.match(/^\/\/record\/([^/]+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
```

### Record lookup

```typescript
import { getRecord } from '../lib/db/recordStore';
import { Alert } from 'react-native';
// ...
const record = getRecord(edge_id); // synchronous, returns EdgeRecord | null
if (!record) {
  Alert.alert('Record not found');
  navigationRef.current?.navigate('HomeTab');
  return;
}
// RecordDetail lives inside HomeStack — navigate via nested params
navigationRef.current?.navigate('HomeTab', {
  screen: 'RecordDetail',
  params: { edge_id },
});
```

`getRecord` is a thin `db.getFirstSync` query that already exists in `recordStore.ts` for `RecordDetailScreen`. No new database function required.

---

## 7. Out of Scope (V2)

- Push notification delivery (V3)
- Share sheet / "Open in KM-Edge" from other apps
- `kmedge://` paths other than `record/<edge_id>`
- Fetching a missing record from GKS on deep link miss
