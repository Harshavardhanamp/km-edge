# ADR-0002: Platform Choice (PWA vs Native)

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Context

KM-Edge must run on iOS and Android phones and tablets. Two viable paths:

| Option | Pros | Cons |
|---|---|---|
| **PWA** (Progressive Web App — React/TypeScript, runs in browser) | Shares tech stack with GKS frontend (React 19, TypeScript, TailwindCSS). Single codebase for all platforms. No app store required. Easy to update. | Limited Bluetooth access (F8 is future but ruled out here). Calendar/alarm access is limited on iOS PWA. Storage API (OPFS) is sandboxed, harder to use with cloud drive SDKs. No biometric auth API on all platforms. |
| **React Native** | Full native API access: calendar, Bluetooth, biometrics, Keychain/Keystore, background sync. One codebase for iOS + Android. Shares component logic with React web. | Different from GKS frontend stack (though same language). Requires app store distribution. Build tooling overhead. |
| **Flutter** | Excellent native API access. Strong offline/SQLite story. | Different language (Dart). No shared code with GKS frontend. |

## Decision

**React Native via Expo managed workflow.** Reasons:

1. Calendar integration (F3), offline credential verifier in secure enclave (NF3), biometric auth (F5.4), Bluetooth discovery (F8), and background sync (F7) all require native APIs that iOS Safari PWA cannot provide reliably or at all.
2. Bluetooth on iOS is a hard PWA blocker — choosing PWA now would force a full rewrite when F8 is built.
3. Background sync ("it just works without opening the app") is the UX difference that matters for a family tool.
4. Same language as GKS frontend (TypeScript + React) — same developer can work both codebases.

**Build infrastructure:** Expo EAS Build (free tier). Runs on Windows and Ubuntu — no Mac required. iOS builds run on Expo's cloud infrastructure. Android builds can run locally or on EAS.

**Distribution:** TestFlight (iOS) + direct APK sideload (Android) for private family use. No public app store submission required.

## Key Expo libraries

| Need | Library |
|---|---|
| Calendar + alarms | `expo-calendar` |
| Secure credential storage | `expo-secure-store` (backed by iOS Keychain / Android Keystore) |
| Background sync | `expo-background-fetch` + `expo-task-manager` |
| Biometric auth | `expo-local-authentication` |
| Bluetooth LE (future F8) | `react-native-ble-plx` (bare workflow upgrade needed when F8 starts) |
| File picker + attachments | `expo-document-picker` + `expo-file-system` |
| Network state (online/offline) | `expo-network` |

## Consequences

- Expo managed workflow covers all initial release needs without ejecting
- Bluetooth (F8) will require upgrading to bare workflow or Expo with a config plugin — plan for this before F8 starts, not during
- EAS Build free tier has build queue limits; acceptable for a private family app with infrequent releases
- No Xcode or Android Studio required on developer machines for CI builds
