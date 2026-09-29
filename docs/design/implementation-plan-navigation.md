# Implementation Plan: Navigation + App Shell

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0010  
**Design:** navigation.md  
**Note:** This is the integration sprint — wires all previously built screens together. Should run last, after all other screens exist.

---

## Steps

### Step 1 — `AuthContext` (`src/context/AuthContext.tsx`)
Session state provider. Reads from `expo-secure-store` on mount to determine `sessionValid`. Provides `login()`, `logout()`, `userId`, `tenantId`. Wraps the entire app in `App.tsx`.

### Step 2 — `RootNavigator` (`src/navigation/RootNavigator.tsx`)
Reads `sessionValid` from `AuthContext`. Renders `AuthStack` or `AppShell` accordingly. Handles the transition between unauthenticated and authenticated states.

### Step 3 — `AuthStack` (`src/navigation/AuthStack.tsx`)
Stack navigator: `ServerDiscoveryScreen → LoginScreen → LockoutScreen`. No headers. Replaces current placeholder navigation in `App.tsx`.

### Step 4 — `AppShell` (`src/navigation/AppShell.tsx`)
- Registers `CaptureScreen` and `StatusDetailScreen` as modals
- Fires `telemetry.sessionStart()` on mount, `telemetry.sessionEnd()` on unmount/background
- Starts GKS health probe loop (calls `gksProbe.start()`)
- Renders `MainTabs`

### Step 5 — `MainTabs` (`src/navigation/MainTabs.tsx`)
Bottom tab navigator with four tabs. Each tab has its own stack navigator. Shared `screenOptions` inject `AppHeader` with `StatusDot` into every screen header. Tab bar icons and labels as per design.

### Step 6 — Per-tab stack navigators
Four stack files, each with their screens:
- `HomeStack`: `HomeScreen` + `RecordDetailScreen`
- `RecordsStack`: `RecordsScreen` + `RecordDetailScreen`
- `CalendarStack`: `CalendarScreen` + `RecordDetailScreen`
- `SettingsStack`: `SettingsScreen`

### Step 7 — `AppHeader` component (`src/components/AppHeader.tsx`)
Shared header: title centred, `StatusDot` right by default, override prop for screens that need a custom right element (Save button, ⋮ menu).

### Step 8 — `RecordsScreen` (full implementation)
Replaces placeholder:
- Search bar (debounced SQLite LIKE query on title + content)
- Filter chips (All / each record type, single-select, horizontal scroll)
- `FlatList` with pagination (20 per page, `onEndReached`)
- FAB `+` opens `CaptureScreen` modal
- Tap row → `RecordDetailScreen`
- `useScreenTracking('RecordsScreen')` + telemetry on search/filter actions

### Step 9 — `SettingsScreen` (full implementation)
Replaces placeholder. Four sections: Account, GKS Server, Calendar, Storage. Log out clears secure store, calls `AuthContext.logout()`. Storage section computes SQLite record count + filesystem size via `expo-file-system`.

### Step 10 — End-to-end navigation smoke test
Manually verify every navigation path:
- Unauthenticated: Discovery → Login → Home
- Home → capture → detail → back → Home
- Records → search → filter → detail → back → Records
- Calendar → day → KM event → detail → back → Calendar
- Settings → log out → Login
- Status dot → StatusDetail → dismiss → back to same screen
- Android back button on each screen

---

## Definition of Done

- [ ] `useScreenTracking` on RecordsScreen and SettingsScreen
- [ ] App launches to Home when session valid, Login when not
- [ ] Auth state switch is instant — no flicker between stacks
- [ ] All 4 tabs navigate correctly with independent back stacks
- [ ] CaptureScreen opens as full-screen modal from Home and Records FAB
- [ ] StatusDetailScreen opens as sheet modal from any screen's status dot
- [ ] RecordsScreen: search works, filter chips work, pagination works
- [ ] SettingsScreen: all 4 sections render, logout works end-to-end
- [ ] Back navigation returns to correct tab/screen on all paths
- [ ] Android hardware back button works correctly throughout
- [ ] TypeScript: zero errors
