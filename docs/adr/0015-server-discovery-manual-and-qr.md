# ADR-0015: Server Discovery by Manual Address and QR Code; Subnet Scan Removed

**Date:** 2026-09-30
**Status:** Accepted — supersedes REQ-0004 L1 and the contradictions-review E1 workaround
**Author:** Harshavardhana P

## Context

The V1 `ServerDiscoveryScreen` probes the `/24` around the phone's `100.x.x.x` Tailscale address. Tailscale allocates from `100.64.0.0/10`; the server and the phone are usually not in the same `/24`, so the scan typically finds nothing after a long spinner. Tailscale exposes no peer-list API to third-party apps. The QR fallback assumed a GKS admin feature that did not exist.

## Decision

- Discovery offers **Enter address** (MagicDNS name such as `gks.tail1234.ts.net`, or a full URL; `https://` assumed) and **Scan QR code**. The subnet scan is deleted.
- GKS Family Access provides **Connect a phone**: a QR encoding `kmedge://connect?url=<origin>&name=<display name>` plus the URL in text (GKS design §2.3).
- The app validates the address with `GET /api/v1/edge/capabilities` and shows the server's display name for confirmation before login.
- The `kmedge://connect` link is also handled as a deep link (alongside `kmedge://record/<edge_id>` from V2-F5) so a QR scanned by the OS camera opens KM-Edge directly at confirmation.

## Consequences

- First run works for a family member with a single instruction from the administrator ("scan this").
- `expo-camera` remains a dependency for the scanner; the Tailscale local API upgrade path noted in the contradictions review is dropped.
- Settings → GKS Server "Re-discover" becomes "Change server" and opens the same two-path screen.
