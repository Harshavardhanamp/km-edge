# ADR-0002: Platform Choice (PWA vs Native)

**Date:** 2026-09-29  
**Status:** Open — decision needed  
**Author:** Harshavardhana P

## Context

KM-Edge must run on iOS and Android phones and tablets. Two viable paths:

| Option | Pros | Cons |
|---|---|---|
| **PWA** (Progressive Web App — React/TypeScript, runs in browser) | Shares tech stack with GKS frontend (React 19, TypeScript, TailwindCSS). Single codebase for all platforms. No app store required. Easy to update. | Limited Bluetooth access (F8 is future but ruled out here). Calendar/alarm access is limited on iOS PWA. Storage API (OPFS) is sandboxed, harder to use with cloud drive SDKs. No biometric auth API on all platforms. |
| **React Native** | Full native API access: calendar, Bluetooth, biometrics, Keychain/Keystore, background sync. One codebase for iOS + Android. Shares component logic with React web. | Different from GKS frontend stack (though same language). Requires app store distribution. Build tooling overhead. |
| **Flutter** | Excellent native API access. Strong offline/SQLite story. | Different language (Dart). No shared code with GKS frontend. |

## Decision

**OPEN.** The calendar integration (F3), offline credential verifier stored in secure enclave (NF3), biometric auth (F5.4), Bluetooth discovery (F8), and background sync (F7) all require native API access that PWA cannot reliably provide on iOS.

**Recommendation:** React Native. Shares the TypeScript/React mental model with GKS frontend. Expo managed workflow reduces native build complexity.

**Decision owner:** Harshavardhana P — confirm before any code is written.

## Consequences

- If React Native: use Expo SDK. Calendar via `expo-calendar`. Secure storage via `expo-secure-store`. Background tasks via `expo-background-fetch`.
- If PWA: calendar and biometric features will be limited/unavailable on iOS. Bluetooth (F8) is impossible. Flag these as hard constraints at product level before choosing.
