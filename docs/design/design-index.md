# Design Document Index

| ID | Title | Status | ADR |
|---|---|---|---|
| [data-model](data-model.md) | KM-Edge Data Model — record envelope, GKS type mapping, extension fields | Draft | ADR-0001, ADR-0004, ADR-0005 |
| [GKS-API-extensions](GKS-API-extensions.md) | GKS API changes required for KM-Edge sync | Draft | ADR-0005 |
| [home-screen](home-screen.md) | Home screen layout, section specs, data requirements | Frozen | ADR-0002, ADR-0009, ADR-0010 |
| [implementation-plan-home-screen](implementation-plan-home-screen.md) | 6-step implementation plan for home screen — approved | Approved | — |
| [local-storage](local-storage.md) | SQLite schema, delta log, attachment blob layout, migration strategy | Frozen | ADR-0009, ADR-0010 |
| [implementation-plan-local-storage](implementation-plan-local-storage.md) | 7-step implementation plan for local storage — approved | Approved | — |
| [record-capture](record-capture.md) | Capture + detail screen layouts, title derivation, EVENT fields | Frozen | ADR-0009, ADR-0010 |
| [implementation-plan-record-capture](implementation-plan-record-capture.md) | 6-step implementation plan for record capture — approved | Approved | — |
| [attachments](attachments.md) | Attachment section layout, validation flow, compression, remove flow | Frozen | ADR-0009 |
| [implementation-plan-attachments](implementation-plan-attachments.md) | 7-step implementation plan for attachments — approved | Approved | — |
| [observability](observability.md) | Telemetry schema, service design, central server architecture, GKS admin dashboard | Frozen | — |
| [implementation-plan-observability](implementation-plan-observability.md) | 12-step plan (edge + central server + GKS extensions) — approved | Approved | — |
| [calendar](calendar.md) | Calendar service, full calendar screen layout, event lifecycle, settings | Frozen | ADR-0002 |
| [implementation-plan-calendar](implementation-plan-calendar.md) | 7-step implementation plan for calendar — approved | Approved | — |
| [navigation](navigation.md) | Navigator tree, auth state switch, app shell, records + settings screens | Frozen | ADR-0002 |
| [implementation-plan-navigation](implementation-plan-navigation.md) | 10-step integration plan — runs last, after all screens exist | Approved | — |
| [login-screen](login-screen.md) | Login flow, server discovery, offline auth, lockout, storage gate | Frozen | ADR-0003, ADR-0004 |
| [implementation-plan-login](implementation-plan-login.md) | 10-step implementation plan for login screen — approved | Approved | ADR-0007, ADR-0008 |
| [v2-sync-engine](v2-sync-engine.md) | V2 sync engine (original) — §5 mapping and gaps 1–3, 8, 10–11 superseded | Amended by contract alignment | ADR-0005, ADR-0014 |
| [v2-attachment-sync](v2-attachment-sync.md) | V2 attachment sync — §4 upload protocol superseded; staging/purge kept | Amended | ADR-0009 |
| [v2-sync-status](v2-sync-status.md) | V2 sync status — §5–6 superseded | Amended | — |
| [v2-deep-linking](v2-deep-linking.md) | `kmedge://record` deep link; `kmedge://connect` added | Frozen (+ADR-0015) | — |
| [v2-sync-contract-alignment](v2-sync-contract-alignment.md) | **Current sync design** — client, envelope, engine, telemetry, screens, tests | Frozen | ADR-0011–0015 |
| [implementation-plan-v2-contract-alignment](implementation-plan-v2-contract-alignment.md) | K0–K7 packets to reach 2.0.0 | Approved | — |
| [GKS-API-extensions](GKS-API-extensions.md) | Superseded by GKS-owned `KK-EDGE-SYNC-CONTRACT-V1.md` | Superseded | ADR-0011 |
| [observability](observability.md) | Superseded by ADR-0013 (sync health only) | Superseded | ADR-0013 |
