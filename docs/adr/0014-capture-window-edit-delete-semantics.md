# ADR-0014: Capture-Window Semantics for Edits and Deletes After Sync

**Date:** 2026-09-30
**Status:** Accepted — amends ADR-0005 (sync protocol) and REQ-0005 S2.2/S2.3 as they apply to synced records
**Author:** Harshavardhana P

## Context

KM-Edge edits overwrite a record in place with no version history (REQ-0005). GKS never overwrites canonical content: desktop Update/Correct create a new linked record, and desktop has no delete at all. The V2 sync engine re-POSTed edited records, which GKS treated as duplicates; the edit never landed and, after three checksum-verification rounds, every edited record ended in `REJECTED: CHECKSUM_MISMATCH`. Deletes worked only because GKS had an unguarded `DELETE /api/v1/records/{id}` that let any member delete any record.

A phone user's fresh capture, edited minutes later, is the same act of capturing; a record the administrator has already resolved, linked, or corrected is established knowledge. One rule cannot serve both.

## Decision

GKS defines a record's **resolution state** (GKS design §4.1): *unresolved* until a human on desktop has acted on it (or dismissed it). The phone does not know or need this state; GKS applies it.

**Edits** (`PUT /api/v1/edge/records/{edge_id}` with `base_content_sha256`):
- unresolved, base == head → GKS overwrites in place and keeps the prior body in `System/edge/revisions/`;
- resolved, base == head → GKS creates an Update version; the phone re-points `gks_id` to the new head via sync-status;
- base != head (desktop changed it too) → GKS keeps **both** as versions and flags a conflict for the administrator. Nothing is lost. The phone sees "Synced".

**Deletes** (`DELETE /api/v1/edge/records/{edge_id}`):
- unresolved → immediate soft delete on GKS;
- resolved → a **deletion request** the administrator confirms or keeps; the record is hidden from the requesting member either way. The phone treats both outcomes as success.
- GKS keeps a 30-day **Restore** for phone-originated deletes.

**Type** is locked on the phone once a record has a `gks_id` (GKS record IDs and directories are type-specific). "Change type on desktop."

The phone additionally stores `synced_content_sha256` (the base) so that verification compares what GKS holds against what was last sent, not against a newer unsynced local edit.

## Consequences

- REQ-0005 "no version history in V1" stands for the phone; history exists server-side once records are synced.
- ADR-0005's step 4b (`POST` for every entry) becomes `POST` for CREATE, `PUT` for UPDATE, `DELETE` for DELETE; step 6 (verify) compares against the base hash.
- Conflict resolution (REQ-0012 open item "V3") is closed for V2 by keep-both; a richer merge UI remains V3.
- `EDGE_RECORD_DELETED` on PUT (record removed on desktop) rejects the local delta and soft-deletes locally with a reason; the member is not asked to do anything.
