# Implementation Plan: Record Capture

**Date:** 2026-09-29  
**Status:** Approved  
**Author:** Harshavardhana P  
**Requirement:** REQ-0006  
**Design:** record-capture.md  
**Depends on:** Local storage complete (Steps 1–7 of storage plan)

---

## Steps

### Step 1 — Title derivation utility (`src/lib/titleDerive.ts`)
- `deriveTitle(content: string): string`
- Extracts first sentence, strips Markdown syntax, truncates to 100 chars, falls back to "Untitled"
- Pure function — testable in isolation

### Step 2 — `src/screens/CaptureScreen.tsx`
- Header: type label (tappable → type-picker sheet) + Save button (disabled until content non-empty)
- Content body: multiline `TextInput`, auto-focused on mount, keyboard opens immediately
- "More details" collapsible section with all optional fields
- Event-specific date/time pickers (shown only when type === EVENT)
- Discard dialog on back-press with non-empty content
- On Save: calls `deriveTitle()`, `sha256String()`, `recordStore.createRecord()`, navigates to detail screen

### Step 3 — `src/screens/RecordDetailScreen.tsx`
- Displays type icon, date, relative time in sub-header
- Title editable inline (tap to edit)
- Content rendered as Markdown (read mode), tap to switch to raw edit mode
- Optional fields shown as read-only tags/labels below content
- `[⋮ menu]`: Delete (with confirmation dialog) + Change type
- On any edit: calls `recordStore.updateRecord()` on Save
- Attachment section placeholder (wired in attachment sprint)

### Step 4 — Type-picker sheet (`src/components/TypePickerSheet.tsx`)
- Bottom sheet showing all 7 types as icon + label grid
- Used from: home screen capture button, capture screen header, detail screen ⋮ menu
- Shared component — single implementation, used in multiple places

### Step 5 — Markdown renderer (`src/components/MarkdownView.tsx`)
- Renders Markdown string to styled React Native text
- Library: `react-native-markdown-display` (lightweight, no web dependency)
- Used on: record detail screen (read mode)

### Step 6 — Navigation wiring
- Capture screen reachable from: type-picker (home), type-picker (records tab FAB)
- Detail screen reachable from: recent records (home), records list
- Type-picker sheet reachable from: capture screen header, detail ⋮ menu

---

## Definition of Done

- [ ] Capture screen opens with keyboard focused on content body
- [ ] Save disabled until content is non-empty
- [ ] Title auto-derived from first sentence on save
- [ ] Record written to SQLite + delta log atomically on save
- [ ] "More details" section collapses/expands correctly
- [ ] EVENT type shows date/time pickers, other types do not
- [ ] Discard dialog shown when back-pressed with non-empty unsaved content
- [ ] Detail screen renders Markdown content
- [ ] Title editable inline on detail screen
- [ ] Delete soft-deletes record, navigates back, record disappears from lists
- [ ] Type changeable from detail screen ⋮ menu
- [ ] TypeScript: zero errors
