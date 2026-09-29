# Design: Navigation + App Shell

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Requirement:** REQ-0010  
**Related ADRs:** ADR-0002

---

## Navigator Tree

```
RootNavigator (stack)
  ├── [unauthenticated] AuthStack (stack, no header)
  │     ├── ServerDiscoveryScreen
  │     ├── LoginScreen
  │     └── LockoutScreen
  │
  └── [authenticated] AppShell
        ├── MainTabs (bottom tab navigator)
        │     ├── HomeTab (stack)
        │     │     ├── HomeScreen
        │     │     └── RecordDetailScreen
        │     ├── RecordsTab (stack)
        │     │     ├── RecordsScreen
        │     │     └── RecordDetailScreen
        │     ├── CalendarTab (stack)
        │     │     ├── CalendarScreen
        │     │     └── RecordDetailScreen
        │     └── SettingsTab (stack)
        │           └── SettingsScreen
        │
        ├── CaptureScreen (modal, full screen)
        └── StatusDetailScreen (modal, sheet)
```

`RecordDetailScreen` lives in each tab's stack independently — this is the standard React Navigation pattern so back navigation returns to the correct tab.

---

## Auth State Switch

`RootNavigator` reads a `sessionValid` boolean from an `AuthContext`:

```typescript
// src/context/AuthContext.tsx
// Reads stored session from expo-secure-store on mount
// Provides: { sessionValid, userId, tenantId, login(), logout() }
```

On login success: `AuthContext.login()` sets `sessionValid = true` → RootNavigator renders AppShell.  
On logout: `AuthContext.logout()` clears secure store, sets `sessionValid = false` → RootNavigator renders AuthStack.

---

## AppShell Component

Thin wrapper that:
1. Renders `MainTabs` + registers modals (`CaptureScreen`, `StatusDetailScreen`)
2. Starts session timer (telemetry `sessionStart`)
3. Starts GKS health probe loop (every 60s, `gksProbe.ts`)
4. Listens for app state changes (background/foreground) to fire `sessionEnd`/`sessionStart`

---

## Shared Header Component

```typescript
// src/components/AppHeader.tsx
// Props: title, rightElement (optional override)
// Default right: <StatusDot />
// Used by every authenticated screen via screenOptions
```

Injected via React Navigation `screenOptions` at the tab navigator level — screens don't manually render their own headers.

---

## RecordsScreen Layout

```
┌─────────────────────────────────────┐
│  Records              🟢 GKS        │  ← AppHeader
├─────────────────────────────────────┤
│  🔍 Search records...               │  ← Search bar
│  [All][Journal][Note][Event][+more] │  ← Filter chips, horizontal scroll
├─────────────────────────────────────┤
│  📓 Morning reflection  · 2h ago    │
│  ⚡ Chose new laptop    · yesterday │
│  📅 Team offsite        · Mon       │
│  ...                                │
│                                     │
│                           [+]       │  ← FAB, bottom right
└─────────────────────────────────────┘
```

Search: SQLite `LIKE` query on `title` and `content` columns, debounced 300ms.  
Filter chips: horizontal `ScrollView`, "All" selected by default, single-select.  
FAB: opens `CaptureScreen` modal.  
Pagination: `FlatList` with `onEndReached` loading next page (20 records per page).

---

## SettingsScreen Layout

```
┌─────────────────────────────────────┐
│  Settings             🟢 GKS        │
├─────────────────────────────────────┤
│  ACCOUNT                            │
│  Harsha Vardhan                     │
│  usr-001                            │
│  [Log out]                          │
├─────────────────────────────────────┤
│  GKS SERVER                         │
│  https://gks.home.ts.net            │
│  [Re-discover server]               │
├─────────────────────────────────────┤
│  CALENDAR                           │
│  Calendars shown  3 of 4 selected → │
│  Permission       Allowed           │
├─────────────────────────────────────┤
│  STORAGE                            │
│  Records       142 records          │
│  Used space    48 MB                │
│  [Clear deleted attachments]        │
└─────────────────────────────────────┘
```

---

## File Structure

```
src/
  navigation/
    RootNavigator.tsx      ← auth state switch
    AuthStack.tsx          ← unauthenticated screens
    AppShell.tsx           ← session lifecycle + modal registration
    MainTabs.tsx           ← bottom tab navigator
    HomeStack.tsx          ← Home + RecordDetail
    RecordsStack.tsx       ← Records + RecordDetail
    CalendarStack.tsx      ← Calendar + RecordDetail
    SettingsStack.tsx      ← Settings
  context/
    AuthContext.tsx         ← session state
  components/
    AppHeader.tsx           ← shared header with StatusDot
    StatusDot.tsx           ← GKS reachability indicator
    TypePickerSheet.tsx     ← shared bottom sheet
```
