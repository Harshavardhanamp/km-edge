# Contradictions & Gaps Review — 2026-09-29

Systematic audit of every contradiction between design docs, ADRs, and the V1 implementation.
Each item is classified and dispositioned. Items marked **FIXED** are already resolved in code.

---

## Group A — ADR internal contradictions

| ID | Location | Issue | Disposition |
|----|----------|-------|-------------|
| A1 | ADR-0004 vs ADR-0009 | ADR-0004 specified cloud drive; ADR-0009 supersedes with local SQLite | **Stale doc — ADR-0009 wins. ADR-0004 header updated with "Superseded by ADR-0009".** |
| A2 | ADR-0008 vs ADR-0009 | ADR-0008 referenced Expo SQLite cloud backup; ADR-0009 removes cloud dep entirely | **Stale doc — same resolution as A1.** |
| A3 | ADR-0003 secure enclave | Says "stored in secure enclave"; iOS Keychain + Android Keystore, not hardware enclave on all devices | **Accepted inconsistency — "secure enclave" is shorthand for platform credential store. No code change.** |
| A4 | ADR-0005 vs ADR-0010 | ADR-0005 implies V1 transmits; ADR-0010 explicitly says V1 writes only, V2 transmits | **Stale doc — ADR-0010 wins. delta_log is append-only in V1; transmission is V2.** |
| A5 | ADR-0010 "minimal gap" | Says V1→V2 gap should be "minimal" but no timeline defined | **Decision needed before V2 planning. Not a code issue.** |

---

## Group B — REQ vs ADR conflicts

| ID | Location | Issue | Disposition |
|----|----------|-------|-------------|
| B1 | REQ-0003 vs ADR-0003 | REQ says "biometric unlock"; ADR-0003 says Argon2id password verifier | **REQ-0003 biometrics is V2 scope (REQ-0011 V2-002). V1 uses Argon2id only. Accepted.** |
| B2 | REQ-0007 "silent re-auth" vs ADR-0003 | Silent re-auth requires storing GKS_PASSWORD_ENC in secure store — tradeoff not documented in ADR-0003 | **FIXED — ADR-0003 addendum written documenting the tradeoff and V2 refresh-token upgrade path.** |
| B3 | REQ-0004 vs ADR-0009 | REQ-0004 listed cloud backup requirement; ADR-0009 removes it | **Stale REQ — ADR-0009 supersedes. REQ-0004 marked V2 deferred.** |
| B4 | REQ-0008 GKS health | Req says "real-time GKS status"; implementation is 60s poll | **Accepted — 60s poll is "near real-time" for the use case. No code change.** |
| B5 | REQ-0009 NF3 privacy | "No third-party telemetry servers" — implementation writes to local SQLite only in V1 | **V2 concern — central telemetry server (gks-central-obs) is user-controlled, not third-party. Add NF3 exception note in REQ-0009.** |
| B6 | REQ-0011 V2-002 biometric | app.json previously included expo-local-authentication plugin | **FIXED — removed from app.json (fix F10).** |
| B7 | REQ-0006 attachment purge | REQ says purge after GKS ack; V1 unlinkAttachment purges immediately on remove | **FIXED — ADR-0005 addendum written documenting V1 immediate-purge rationale and V2 deferred-purge requirement (pending_delete flag).** |

---

## Group C — Implementation Plan vs actual code

| ID | Location | Issue | Disposition |
|----|----------|-------|-------------|
| C1 | Sprint plan migration order | Plan called for migrations 002 (telemetry) + 003 (calendar) separately | **Stale doc — all columns consolidated into 001_initial.ts. No downside for V1. Accepted.** |
| C2 | Sprint plan Tailscale peer enum | Plan said "probe each Tailscale peer via MagicDNS / local API" | **FIXED (workaround) — probes /24 subnet of device 100.x.x.x. Tailscale exposes no peer-list API to third-party apps. See E1.** |
| C3 | Sprint plan orphan-blob purge | Plan called for full orphan-blob GC on Clear Attachments button | **V2 concern — button is placeholder in V1 (ponytail comment in SettingsScreen). unlinkAttachment already ref-counts and purges on remove, so real orphans are rare. ADR note needed for V2.** |
| C4 | Sprint plan CaptureScreen stack | Plan had Capture in HomeStack + RecordsStack | **FIXED — Capture is fullScreenModal at AppShell level, not per-tab stack.** |
| C5 | Sprint plan StatusDot | Plan had StatusDot only on HomeScreen | **FIXED — AppHeader renders StatusDot on all 4 tab screens.** |

---

## Group D — Data model contradictions

| ID | Location | Issue | Disposition |
|----|----------|-------|-------------|
| D1 | EventRecord date storage | EVENT capture stores start/end only in delta_log JSON payload; records table has no dedicated date columns | **V2 concern — V1 delta_log payload includes event dates for future sync. Accepted for V1.** |
| D2 | Event dates in content body | CaptureScreen writes `**Event:** <toLocaleString()>` into content body — locale-dependent, lossy | **FIXED — replaced with `toISOString()` in CaptureScreen.tsx line 91.** |
| D3 | delta_log vs records sync status | records.sync_status column exists but nothing sets it in V1 | **V2 concern — sync_status will be set by V2 sync engine reading delta_log. Accepted for V1.** |
| D4 | schema_migrations table | migrations.ts creates the table then inserts version — no idempotency guard on the table creation itself | **Stale concern — `CREATE TABLE IF NOT EXISTS` is used. Non-issue.** |
| D5 | attachments.size_bytes | Populated from file info; compress.ts may reduce actual size but size_bytes is set from the compressed file | **Accepted — size_bytes reflects stored size (post-compression). Correct behavior.** |
| D6 | record_attachments.display_order | Column exists, nothing sets it beyond insertion order | **V2 concern — UI drag-to-reorder is V2. Accepted for V1.** |
| D7 | telemetry_events retention | Table grows unbounded in V1; no purge | **V2 concern — V2 sync flushes to central server then truncates. Accepted for V1.** |
| D8 | validateFile 100MB > record total 50MB | Per-file cap 100MB larger than 50MB total, making 50-100MB files impossible to attach | **FIXED — per-file cap reduced to 50MB (matches record total).** |

---

## Group E — Environment / infrastructure gaps

| ID | Location | Issue | Disposition |
|----|----------|-------|-------------|
| E1 | Tailscale discovery | Design: probe Tailscale peers. Reality: no API. Workaround: scan /24 subnet of device 100.x.x.x | **Accepted workaround for V1.** ServerDiscoveryScreen has ponytail comment. V2 upgrade: Tailscale local API at `100.100.100.100:41112` (if user grants local network). |
| E2 | QR fallback camera | ServerDiscoveryScreen uses expo-camera CameraView barcode scanner — needs CAMERA permission | **Accepted — permission requested at runtime before showing scanner.** |
| E3 | EAS Build free tier | Free tier has no Mac runner; iOS builds via Xcode Cloud or local Mac required | **Accepted — documented in setup notes. Distribution is TestFlight, so Mac needed for App Store upload but not for build itself if using EAS.** |
| E4 | expo-camera in app.json | expo-camera plugin not listed in app.json plugins | **FIXED — added `"expo-camera"` to plugins in app.json.** |
| E5 | expo-document-picker | No plugin declaration in app.json; iCloud access on iOS may require entitlement | **V2 concern — test on device; add plugin if needed.** |
| E6 | expo-image-picker | No plugin declaration in app.json | **FIXED — added with photosPermission + cameraPermission strings.** |
| E7 | Android sideload | APK from EAS Build (unsigned or debug) vs AAB (Play Store) | **Accepted — EAS Build produces APK for internal distribution. No Play Store.** |
| E8 | tenant_id origin | Login returns session cookie only; tenant_id has no API source; stored as empty string | **Decision needed before V2.** Options: (a) derive from GKS /me endpoint, (b) store in server config, (c) use userId as tenant scope. |

---

## Group F — app.json / native config

| ID | Location | Issue | Disposition |
|----|----------|-------|-------------|
| F1 | icon assets | app.json references `./assets/icon.png`, `./assets/android-icon-*.png`, `./assets/favicon.png` | **Accepted — placeholder assets must exist before EAS Build. User provides final assets.** |
| F2 | bundleIdentifier | `com.kashyap.kmedge` — matches across ios + android | **Accepted.** |
| F3 | userInterfaceStyle: automatic | Enables dark mode; warm palette may not have dark variants | **FIXED — changed to `"light"` in app.json.** |
| F4 | supportsTablet | Set to true on iOS | **Accepted — layout is single-column, works on tablet.** |
| F5 | predictiveBackGestureEnabled: false | Android predictive back disabled | **Accepted — prevents accidental navigation with swipe-back.** |
| F6 | web target | `web.favicon` present but web is not a distribution target | **Accepted — harmless, Expo includes it by default.** |
| F7 | No splash screen config | No `expo.splash` in app.json | **FIXED — added splash config with warm `#FDF8F4` background. Provide `./assets/splash.png` before first EAS build.** |
| F8 | No entitlements config | iOS entitlements (iCloud, HealthKit) not listed | **Accepted — not needed for V1.** |
| F9 | No privacy manifest | iOS 17+ requires PrivacyInfo.xcprivacy for certain APIs | **V2 concern — required before App Store submission, not for TestFlight.** |
| F10 | V2 plugins in app.json | expo-local-authentication + expo-background-fetch were listed | **FIXED — both removed.** |

---

## Group G — Documentation / ADR completeness

| ID | Location | Issue | Disposition |
|----|----------|-------|-------------|
| G1 | ADR-0005 idempotency | ADR says delta replay is idempotent; nothing in V1 enforces idempotency keys | **V2 concern — V2 sync engine enforces idempotency via delta_log.id. Accepted for V1.** |
| G2 | ADR index | No master ADR index file | **Stale docs — low priority. Add ADR/README.md with table when V2 docs written.** |
| G3 | Sprint doc vs code | Sprint docs describe some functions that were renamed during implementation | **Stale docs — sprint docs are planning artifacts, not living docs. Accepted.** |
| G4 | No CHANGELOG | No changelog tracking V1 → V2 boundary | **V2 concern — add CHANGELOG.md at V2 kickoff.** |
| G5 | calendar.ts getSelectedCalendarIds | Used raw string `'calendar_selected_ids'` not in KEYS object | **FIXED — added `KEYS.CALENDAR_SELECTED_IDS` to secureStore.ts; calendar.ts updated to use it. Key intentionally excluded from clearSession (preference, not credential).** |

---

## Summary by disposition

| Disposition | Count |
|-------------|-------|
| **FIXED** | 15 (B2, B6, B7, C2, C4, C5, D2, D8, E4, E6, F3, F7, F10, G5 + ADR-0003/0005 addenda) |
| Stale doc / accepted | 14 |
| V2 concern (no V1 action) | 13 |
| **Decision needed** | 2 (A5, E8) |

### Remaining decision queue

1. **E8** — Tenant ID origin. Decide before V2 sync work starts. Options: (a) `/me` endpoint on GKS, (b) server config, (c) userId = tenant scope.
2. **A5** — V1→V2 timeline. Not a blocker but should be named before V2 planning.
