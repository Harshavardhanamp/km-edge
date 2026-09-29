# Design: Attachments

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Requirement:** REQ-0007  
**Related ADRs:** ADR-0009

---

## Attachment Section on Record Detail Screen

Located at the bottom of the record detail screen, below content and optional fields:

```
┌─────────────────────────────────────┐
│  Attachments (3)         [+ Add]    │  ← Section header
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐        │  ← Horizontal scroll strip
│  │ 🖼️  │ │ 📄  │ │ 🖼️  │  →     │
│  │photo1│ │doc.pdf│ │photo2│        │
│  └──────┘ └──────┘ └──────┘        │
│                                     │
└─────────────────────────────────────┘
```

- Thumbnail size: ~72×72dp
- Images: actual thumbnail rendered
- Documents/PDFs: file type icon (📄) + short filename below
- Tap thumbnail: full-screen image viewer (images) or system viewer (documents)
- Long-press thumbnail: shows "Remove" option → confirmation dialog

---

## Source Picker Sheet

Shown when user taps `[+ Add]`:

```
┌─────────────────────────────────────┐
│  Add attachment                     │
│                                     │
│  📁  Files                          │
│  📷  Take photo                     │
│  🖼️  Photo library                  │
│  📋  Scan document                  │
│                                     │
│  [Cancel]                           │
└─────────────────────────────────────┘
```

---

## File Validation Flow

```
User selects file
  ↓
Check extension against ALLOWED_EXT
  ├─ Rejected → inline error: "This file type isn't supported.
  │              Supported types: pdf, jpg, png, doc..."
  └─ Accepted ↓
Check total record attachment size + new file ≤ 50MB
  ├─ Exceeded → inline error: "Adding this file would exceed the
  │              50MB limit for this record (currently X MB used)."
  └─ OK ↓
Check file count ≤ 10
  ├─ Exceeded → inline error: "Records can have up to 10 attachments."
  └─ OK ↓
[If image from camera/gallery] → compress (max 2048px, JPEG 80%)
  ↓
Compute sha256
  ↓
Check if blob already exists (dedup)
  ├─ Exists → reuse blob, create new record_attachments row only
  └─ New → copy blob to content-addressed path, insert attachments row
  ↓
Insert record_attachments row
Update record updated_at, append UPDATE delta entry
```

---

## Image Compression

Applied to camera captures and gallery picks (`jpg`, `jpeg`, `png`, `webp`) before sha256 computation:

- Resize: max 2048px longest side, aspect ratio preserved
- Encode: JPEG at 80% quality
- Library: `expo-image-manipulator`
- File system originals: never touched

---

## Full-Screen Image Viewer

Simple modal overlay:
- Pinch to zoom
- Swipe down to dismiss
- Shows filename and size in footer

---

## Reject UX

Inline error shown directly in the attachment section (not a toast, not a modal):

```
┌─────────────────────────────────────┐
│  Attachments (2)         [+ Add]    │
│  ⚠️ report.zip isn't supported.    │
│     Supported: pdf, jpg, png, doc,  │
│     docx, xls, xlsx, txt, md...     │
└─────────────────────────────────────┘
```

Error auto-dismisses after 5 seconds or on next user action.

---

## Remove Attachment Flow

Long-press on thumbnail → action sheet:

```
Remove attachment?
[Remove]   [Cancel]
```

On Remove:
1. Delete `record_attachments` row
2. Query remaining references to same `edge_attachment_id`
3. If zero references: delete blob file + `attachments` row
4. Update record `updated_at`, append UPDATE delta entry
5. Attachment strip re-renders without the removed item

---

## Libraries

| Need | Library |
|---|---|
| File picker | `expo-document-picker` |
| Camera + gallery | `expo-image-picker` |
| Document scan | `expo-camera` (document scan mode, iOS 16+ / Android) |
| Image compression | `expo-image-manipulator` |
| File system ops | `expo-file-system` |
| System viewer / open | `expo-sharing` |
| Full-screen image | `react-native-image-viewing` (lightweight, no heavy deps) |
