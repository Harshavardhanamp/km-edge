# Implementation Plan: Attachments

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0007  
**Design:** attachments.md  
**Depends on:** Local storage complete, Record capture complete

---

## Prerequisites

- [ ] `expo-image-picker` — already in Expo SDK 57
- [ ] `expo-document-picker` — already installed
- [ ] `expo-file-system` — already installed
- [ ] `expo-image-manipulator` — install via `npx expo install expo-image-manipulator`
- [ ] `expo-camera` — install via `npx expo install expo-camera`
- [ ] `expo-sharing` — install via `npx expo install expo-sharing`
- [ ] `react-native-image-viewing` — install via `npm install react-native-image-viewing`

---

## Steps

### Step 1 — File validation (`src/lib/attachments/validate.ts`)
- `validateFile(file: { name, size, uri })` → `{ ok: true } | { ok: false, reason: string }`
- Checks: extension in ALLOWED_EXT, file size ≤ 100MB
- `validateRecordLimits(existingTotal: number, newSize: number, existingCount: number)` → `{ ok: true } | { ok: false, reason: string }`
- Checks: total ≤ 50MB, count ≤ 10
- Pure functions — no side effects, fully testable

### Step 2 — Image compression (`src/lib/attachments/compress.ts`)
- `compressImage(uri: string, mimeType: string)` → `{ uri, size }` compressed output
- Uses `expo-image-manipulator`: resize to max 2048px, JPEG 80%
- Only runs for `image/*` mime types from camera/gallery source
- Files from document picker pass through unmodified

### Step 3 — Attachment service (`src/lib/attachments/attachmentService.ts`)
- `addAttachment(recordEdgeId, file, source)` → `edge_attachment_id | error`
  1. Validate file type + record limits
  2. Compress if image from camera/gallery
  3. Compute sha256 via `crypto.sha256File()`
  4. Dedup check: query `attachments` table for existing sha256
  5. If new: copy blob to content-addressed path via `expo-file-system`
  6. Insert/reuse `attachments` row, insert `record_attachments` row
  7. Update record `updated_at`, append UPDATE delta entry
- `removeAttachment(recordEdgeId, edgeAttachmentId)` → void
  1. Delete `record_attachments` row
  2. Check remaining references
  3. If zero: delete blob + `attachments` row
  4. Update record `updated_at`, append UPDATE delta entry
- `getAttachments(recordEdgeId)` → attachment metadata list

### Step 4 — Source picker sheet (`src/components/AttachmentSourceSheet.tsx`)
- Bottom sheet: Files / Take photo / Photo library / Scan document
- Each option calls the appropriate Expo API and returns a file result
- Returns `{ uri, name, size, mimeType, source }` to parent

### Step 5 — Attachment strip (`src/components/AttachmentStrip.tsx`)
- Horizontal `ScrollView` of thumbnail cards
- Image types: renders `<Image>` thumbnail
- Document types: renders file icon + short name
- `[+ Add]` button at the end of the strip (or in section header)
- Long-press on card: shows Remove confirmation
- Tap on card: opens full-screen viewer (images) or system viewer (documents)

### Step 6 — Full-screen image viewer
- Uses `react-native-image-viewing`
- Opens as modal overlay
- Pinch to zoom, swipe down to dismiss, filename + size in footer

### Step 7 — Wire into `RecordDetailScreen`
- Add `AttachmentStrip` to bottom of detail screen
- Connect `[+ Add]` → `AttachmentSourceSheet`
- On attachment added/removed: refresh strip

---

## Definition of Done

- [ ] User can attach from all 4 sources (files, camera, gallery, scan)
- [ ] Rejected file shows inline error with accepted types list
- [ ] 50MB total and 10-file limits enforced with clear inline error
- [ ] Camera/gallery images compressed to max 2048px, JPEG 80%
- [ ] Identical file attached twice: one blob on disk
- [ ] Images render as thumbnails in horizontal strip
- [ ] Documents show file icon + name
- [ ] Tap image → full-screen viewer with pinch zoom
- [ ] Tap document → system viewer opens
- [ ] Long-press → Remove → confirmation → attachment removed, blob purged if unreferenced
- [ ] Delta log UPDATE entry appended on every attach/remove
- [ ] TypeScript: zero errors
