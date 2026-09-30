# Handoff — Kashyap's Knowledge 2.1 program (Edge Sync + audit reconciliation)

> **2026-09-30 update.** A requirements↔design↔implementation audit was merged
> into this stream. The governing plan is now
> `docs/roadmap/KK-2.1-CONSOLIDATED-PLAN.md` (21 packets: A, P0–P8, K0–K7, F, G).
> **Packet A (reconciliation and cheap fixes) runs before P0.** Its exact
> document amendments are in that plan's Appendix — apply them verbatim. Two
> new design docs: `docs/design/KK-FIND-F5-ADAPTIVE-SYNTHESIS.md` (Packet F)
> and the Goals/Home design to be written at the start of Packet G. Everything
> below about the edge-sync stream remains valid; read the consolidated plan
> first, then this file.

## 0. Product-owner decisions added by the audit merge (do not re-open)

Results-first adaptive Find synthesis (F5); suggested filters / More filters formally deferred; Gmail kept behind `GKS_GMAIL_ENABLED` (default off) with ADR; retroactive `v2.0.0` tag at `3051f32` and STATUS/README/CHANGELOG fixed; Goals/Home gaps recorded as accepted deviations now and implemented in Packet G after edge sync; sequencing A → edge sync → F → G.

---

# Edge Sync Contract v1 (GKS 2.1.0 + KM-Edge 2.0.0)

**For:** Claude Code, working in two repositories:
- GKS: `C:\Users\mysoreh\generational-knowledge-system` (contract owner)
- KM-Edge: `C:\Users\mysoreh\km-edge` (consumer)

**Prepared:** 2026-09-30 by the design session with Harshavardhana P. Every decision below was made explicitly by the product owner; do not re-open them. Where implementation reveals a genuine contradiction, stop and surface it (AGENTS.md L3/L4; KM-Edge ADR-0006).

---

## 1. Read first, in this order

0. GKS `docs/roadmap/KK-2.1-CONSOLIDATED-PLAN.md` — the governing 21-packet plan and audit traceability; Packet A first.
1. GKS `AGENTS.md` — the governance you must follow (docs + Help + tests + tag + push + remote verify + clean worktree per slice; progress percentages at packet start/end).
2. GKS `docs/requirements/KK-EDGE-SYNC-REQUIREMENTS.md` — frozen requirements and decision register D1–D27.
3. GKS `docs/design/KK-EDGE-SYNC-CONTRACT-V1.md` — the wire contract. Both repos build to this.
4. GKS `docs/design/KK-EDGE-SYNC-DETAILED-DESIGN.md` — server-side design (§ numbers referenced by the plan).
5. GKS `docs/testing/KK-EDGE-SYNC-TEST-STRATEGY.md` — four test layers; which run on the server.
6. GKS `docs/roadmap/KK-EDGE-SYNC-IMPLEMENTATION-PLAN.md` — Packets 0–8.
7. KM-Edge `src/AGENTS.md` (Expo rules: fetch versioned docs before touching Expo APIs), `docs/requirements/REQ-0013-gks-sync-contract-alignment.md`, `docs/adr/0011…0015`, `docs/design/v2-sync-contract-alignment.md`, `docs/design/implementation-plan-v2-contract-alignment.md` — Packets K0–K7.

## 2. Step 1 — commit the documentation (both repos), before any code

### GKS
```
git status                      # expect: new docs + 3 amended frozen docs + this file; ~665 CRLF-only diffs may show — do not commit whitespace-only changes to unrelated files
git add docs/roadmap/KK-2.1-CONSOLIDATED-PLAN.md \
        docs/design/KK-FIND-F5-ADAPTIVE-SYNTHESIS.md \
        docs/requirements/KK-EDGE-SYNC-REQUIREMENTS.md \
        docs/design/KK-EDGE-SYNC-CONTRACT-V1.md \
        docs/design/KK-EDGE-SYNC-DETAILED-DESIGN.md \
        docs/testing/KK-EDGE-SYNC-TEST-STRATEGY.md \
        docs/roadmap/KK-EDGE-SYNC-IMPLEMENTATION-PLAN.md \
        docs/design/KK-R1C-TOPIC-PLACE-RELATIONSHIP-SECURITY-DESIGN-FROZEN.md \
        docs/design/KK-V2-PRODUCT-OBSERVABILITY.md \
        docs/design/KASHYAPS-KNOWLEDGE-V1.3-S1-AUTH-RBAC-DESIGN.md \
        HANDOFF-EDGE-SYNC.md
# Also add: README.md pointer paragraph + CHANGELOG "## 2.1.0 — Unreleased" (write them now; see Packet 0)
git commit -m "docs(edge-sync): freeze Edge Sync Contract v1 requirements, contract, design, tests, plan"
git push origin main            # pushes the 3 existing edge commits too (decision D3)
git tag -a v2.1.0-edge-sync-design -m "Edge Sync Contract v1 design freeze"
git push origin v2.1.0-edge-sync-design
git fetch && git rev-parse HEAD origin/main   # must match
```
If `git` reports `.git/index.lock` permission problems (seen from a sandboxed mount), run from a native shell on the host.

### KM-Edge
```
git tag -a v1.0.0 -m "KM-Edge V1 beta: local-first capture, no sync"   # on the last V1 commit if identifiable, else current HEAD with a note in CHANGELOG
git push origin main --tags     # pushes the 11 existing V2 commits (D3)
git add docs README.md
git commit -m "docs(v2): REQ-0013 contract alignment, ADR-0011..0015, design, plan, device checklist"
git push origin main
```
Then complete K0 items 2–4 (superseded headers, index, CHANGELOG) as a second docs commit.

## 3. Step 2 — implementation order across repos

| Order | Repo | Packet | Blocks |
|---|---|---|---|
| 0 | GKS | **Packet A** reconciliation + cheap fixes (consolidated plan §3) | P0 |
| 1 | GKS | P0 baseline (done by step 1) | — |
| 2 | GKS | P1 fixtures + scratch server | K1 |
| 3 | KM-Edge | K0 docs, K1 harness + fixtures pin | — |
| 4 | GKS | P2 edge auth | K2 live verification |
| 5 | KM-Edge | K2 client/discovery/auth | — |
| 6 | GKS | P3 landing + sync-status | K4 live verification |
| 7 | KM-Edge | K3 migration + envelope | — |
| 8 | GKS | P4 review queue | — |
| 9 | GKS | P5 lifecycle | K4 update/delete live verification |
| 10 | KM-Edge | K4 sync engine | — |
| 11 | GKS | P6 attachments; P7 telemetry | K5 |
| 12 | KM-Edge | K5 attachments/telemetry; K6 UX | — |
| 13 | GKS | P8 qualification → `v2.1.0` | K7 |
| 14 | KM-Edge | K7 device acceptance → `v2.0.0` | — |
| 15 | GKS | **Packet F** Find F5 results-first adaptive synthesis | — |
| 16 | GKS | **Packet G** Goals/Home deviations (design freeze first) | — |

KM-Edge unit tests (Jest against the fixture mock) never need a live server; live verification against the scratch server is an extra check, not a gate for K-packets before K7.

## 4. Tests that must run on the server

```
cd <gks repo> && source .venv/bin/activate
python -m pytest -q                                    # L1, existing 949 + new
python -m pytest -q tests/edge_contract -m edge_contract   # L2, starts a scratch GKS on :8790 with a throwaway archive
cd frontend && npm test                                # vitest
```
KM-Edge: `cd km-edge/src && npm test && npx tsc --noEmit && npx expo lint` (dev machine/CI).

## 5. Things that are decided — do not re-ask

Persona (member captures, admin resolves); GKS owns the contract; push existing commits as-is; scratch archive for L2 (no Test Mode); landing = canonical immediately + pending resolution + exact-match auto-link; dedicated `/api/v1/edge/*`; From phone filter in Needs review; phone shows only "Synced"; one-click local AI title; admin + owning member resolve; Dismiss exists; bulk by label; capture-window edit semantics; keep-both on conflict; type lock after sync; capture-window delete split; generic `DELETE /records` removed; 30-day Restore; bearer + 30-day device sessions + revoke; no password on device; manual MagicDNS + QR (no scan); single atomic attachment call; `scan_policy: NOT_SCANNED` until verified; Devices panel + Home line; **PRIVATE captures are included in the admin queue**; telemetry cut to sync health; no devices in the field → retire old routes without transition.

## 6. Known landmines

- `StrictModel` is `extra="forbid"`: every edge request model must list every field the phone sends, and the phone must send nothing else (KM-Edge envelope test enforces this).
- `capture_kind` must never be defaulted server-side for edge; the envelope always carries `record_type` (= capture kind).
- Dedupe must include soft-deleted records; `scan_records` currently excludes them — add `include_deleted`.
- `find_record` currently returns deleted records on API GET paths; add the guard (design §5.2).
- Do not reuse `request.state.archive_root` (does not exist); use `_require_archive(request)`.
- Bearer sessions must never be accepted on non-edge routes.
- The constant `"CLEAN"` scan stamp in `attachments.py:111` must become `NOT_SCANNED`.
- KM-Edge: the background-fetch task runs in a separate JS context — read the token from SecureStore, never from module state.
- KM-Edge: `expo-background-fetch` / `expo-local-authentication` were removed from `app.json` plugins during V1 (F10); re-add `expo-background-fetch` only after fetching the Expo SDK docs for the installed version.
- Verify `kb init` produces an archive that `is_archive()` accepts and that `auth-bootstrap` can run non-interactively; add flags if not (P1 item 2).

## 7. Reporting

At the start and end of each packet report: overall % (packets done / 21), packet %, remaining packets. At the end of each packet: tests run and counts, files changed, tag pushed, remote verified, worktree clean, Help status (`HELP_UPDATED=PASS` or `HELP_ALREADY_CURRENT=PASS`).
