# ADR-0008: Cloud Storage OAuth — Full Implementation in Login Sprint

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Context

The login screen includes a mandatory cloud storage setup gate (REQ-0004 L2). Two implementation scope options were considered:

| Option | Pros | Cons |
|---|---|---|
| Placeholder UI only | Keeps login sprint focused and smaller | Login gate is non-functional; app cannot be used end-to-end |
| Full OAuth now | Login flow works end-to-end from day one | Larger sprint scope |

## Decision

**Full OAuth implementation** in the login sprint. Google Drive and Dropbox OAuth2 flows are wired in `StorageSetupScreen` — not placeholders. Rationale: the storage gate is a hard prerequisite for any record capture; building it as a placeholder means the app cannot be meaningfully tested end-to-end until a second sprint.

## Prerequisites

App credentials must be registered in both developer consoles before Step 7 of the implementation plan:

- **Google Drive:** Register app in [Google Cloud Console](https://console.cloud.google.com). Enable Google Drive API. Create OAuth2 credentials (iOS + Android client IDs). Redirect URI: Expo Auth Session proxy or custom scheme `kmedge://`.
- **Dropbox:** Register app in [Dropbox App Console](https://www.dropbox.com/developers/apps). Choose "Scoped access" + "App folder". Note client ID. Redirect URI: `kmedge://oauth/dropbox`.

**Action required from Harshavardhana P:** Create credentials in both consoles and provide client IDs before implementation reaches Step 7. Instructions will be provided at that point.

## Library

`expo-auth-session` (already part of Expo SDK) handles the OAuth2 browser flow on both iOS and Android. No additional OAuth library needed.

## Consequences

- Sprint scope is larger but produces a fully functional login + storage setup flow
- Client IDs must be available before Step 7 — this is a hard dependency
- Client IDs stored in `app.json` (non-secret) and `.env` (secrets, never committed)
