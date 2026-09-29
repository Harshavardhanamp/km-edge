# ADR-0007: Argon2id Library — hash-wasm

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Context

The offline credential verifier (ADR-0003) requires Argon2id hashing on the device. No Argon2id implementation exists in the React Native / JavaScript stdlib. Two viable options:

| Option | Pros | Cons |
|---|---|---|
| `hash-wasm` | WASM-based, works in Expo managed workflow, no ejecting, one npm install | Slightly slower than native (imperceptible for a single login hash) |
| `react-native-argon2` | Native module, fastest | Requires config plugin or ejecting to bare workflow; more setup and maintenance |

## Decision

**`hash-wasm`** — WASM-based Argon2id. Works in Expo managed workflow without ejecting. Performance difference for a single login hash operation is imperceptible to the user.

## Consequences

- No workflow changes — stays on Expo managed
- If performance is ever measured as a problem (it won't be for one login hash), switch to `react-native-argon2` with a bare workflow upgrade at that time
