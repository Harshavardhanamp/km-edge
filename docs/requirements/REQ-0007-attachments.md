# REQ-0007: Attachments

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Related:** REQ-0002 F2, REQ-0005, ADR-0009

---

## A1 — File Sources

All five sources supported:

| Source | Mechanism |
|---|---|
| Device file system (Files app) | `expo-document-picker` |
| Device camera — take photo | `expo-camera` or `expo-image-picker` (camera mode) |
| Device photo library | `expo-image-picker` (gallery mode) |
| Device camera — scan document | `expo-camera` with document scan mode or OS document scanner |
| Device media library (video/audio) | `expo-document-picker` (file mode, user selects mp4/mov/mp3/m4a) |

---

## A2 — Accepted File Types

Identical to GKS `ALLOWED_EXT` and edge `validate.ts` (updated 2026-09-30 — 23 extensions):  
`pdf, txt, md, rtf, csv, json, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png, webp, gif, svg, heic, mp4, mov, mp3, m4a`

Photos taken with camera or picked from gallery are always accepted (JPEG/PNG output).  
Video/audio files (`mp4`, `mov`, `mp3`, `m4a`) and HEIC images are accepted via the file picker (A1 — media library source).

---

## A3 — Rejected File Types

Rejected at the point of selection — no server round-trip needed:
- Any extension not in the accepted list
- Password-protected or encrypted files (detected by file header inspection where feasible)
- Archive/compressed files: `.zip`, `.tar`, `.gz`, `.7z`, `.rar`
- Executables: `.exe`, `.dll`, `.so`, `.apk`, `.bat`, `.cmd`, `.sh`

Content-level malware scanning delegated to GKS at sync time (GKS runs ClamAV).

**Rejection UX:** Inline error message naming the rejected file and listing accepted types. Not a generic toast.

---

## A4 — Limits

| Limit | Value |
|---|---|
| Max files per record | 10 |
| Max total size per record | 50 MB (sum of all attachments on that record) |
| Max single file size | 50 MB (edge enforced; updated 2026-09-30 to match code) |

Both limits checked before saving. If either is exceeded, show inline error. Existing attachments on the record are not affected.

---

## A5 — Image Compression

Photos taken with the camera or picked from the photo library are compressed before storing:
- Resize to max 2048px on the longest side (aspect ratio preserved)
- JPEG quality: 80%
- Applied to: `jpg`, `jpeg`, `png`, `webp` sources from camera or gallery
- Not applied to: files picked from the file system (user chose the file intentionally)
- Originals in the device photo library are never modified

---

## A6 — Storage

- Blob stored content-addressed at `<app_documents>/attachments/<sha256[:2]>/<sha256>` (REQ-0005 S4)
- Metadata in SQLite `attachments` table; link in `record_attachments` table
- Deduplication: identical files (same sha256) share one blob, referenced by multiple records

---

## A7 — Preview on Record Detail Screen

- **Images** (`jpg`, `jpeg`, `png`, `webp`, `gif`, `heic`): rendered inline as thumbnails in the attachments section. Tap to view full-screen.
- **PDF and documents**: show filename + size + type icon. Tap to open in device system viewer (`expo-sharing` or `Linking.openURL`).
- **SVG**: rendered as image thumbnail if possible, otherwise filename + icon.
- **Video** (`mp4`, `mov`): show filename + duration estimate + video icon. Tap to open in device media player.
- **Audio** (`mp3`, `m4a`): show filename + audio icon. Tap to open in device media player.

---

## A8 — Remove Attachment

- User can remove an attachment from a record via a long-press or swipe-to-delete gesture on the attachment row
- Confirmation dialog: "Remove attachment?" with Remove / Cancel
- On confirm:
  1. Delete row from `record_attachments`
  2. Check if any other `record_attachments` row references the same `edge_attachment_id`
  3. If no other references: delete blob from filesystem and row from `attachments`
  4. Update `updated_at` on the parent record, append UPDATE delta log entry

---

## A9 — Sync Behaviour

- Attachment blobs transmitted to GKS separately from the record during sync (V2)
- GKS performs content-level scanning (ClamAV) on receipt — edge does not
- If GKS rejects an attachment (malware, bad content): attachment marked `REJECTED` in delta log, record sync proceeds without it, user notified
- Delta log CREATE entry for the record includes `attachment_edge_ids` array so V2 sync knows which blobs to transmit

---

## A10 — Out of Scope (V1)

- Attachment reordering
- Attachment rename
- Attachment download from GKS to edge (requires bidirectional sync — V2+)
