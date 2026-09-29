# Design: Record Capture

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Requirement:** REQ-0006  
**Related ADRs:** ADR-0009, ADR-0010

---

## Capture Screen Layout

```
┌─────────────────────────────────────┐
│  ← Back      Journal      [Save]   │  ← Header: type label centre, Save right
├─────────────────────────────────────┤
│                                     │
│  What happened?                     │  ← Placeholder text
│  |                                  │  ← Cursor here on open, keyboard up
│                                     │
│  (content body — grows with text)   │
│                                     │
├─────────────────────────────────────┤
│  ▸ More details                     │  ← Collapsible section (closed by default)
├─────────────────────────────────────┤
│  [keyboard]                         │
└─────────────────────────────────────┘
```

**Expanded "More details" section:**
```
├─────────────────────────────────────┤
│  ▾ More details                     │
│                                     │
│  Tags          [work, family    ]   │
│  Importance    [ Low  Normal  High] │
│  Classification [Normal] [Private]  │
│  Life areas    [family] [personal]  │
│  Place         [Home              ] │
│  Date          [29 Sep 2026       ] │
│                                     │  ← EVENT type only:
│  Event start   [29 Sep 2026 10:00] │
│  Event end     [29 Sep 2026 11:00] │
│  Add to calendar  [toggle]          │
└─────────────────────────────────────┘
```

---

## Screen Behaviour

- **On open:** keyboard focuses content body immediately
- **Type label** in header shows current type (e.g. "Journal") — tappable to change type (shows type-picker sheet)
- **Save button** disabled until content is non-empty
- **Back button:** if content is non-empty and unsaved → shows discard dialog: "Discard record?" with "Discard" and "Keep editing" buttons. If content is empty → navigates back silently.
- **"More details" section:** collapsed by default. Tapping the row expands/collapses. State not persisted — always starts collapsed.

---

## Title Derivation (at save time)

```
title = first sentence of content
      → strip leading/trailing whitespace
      → strip Markdown syntax (**, *, #, etc.)
      → truncate to 100 chars
      → if empty after processing → "Untitled"
```

Stored in `records.title`. Editable on detail screen. GKS may overwrite with AI title at sync time.

---

## Record Detail Screen Layout

Same screen for read and edit — tapping any field makes it editable inline.

```
┌─────────────────────────────────────┐
│  ← Back                  [⋮ menu]  │  ← Menu: Delete, Change type
├─────────────────────────────────────┤
│  📓 Journal · 29 Sep · 2h ago       │  ← Type icon, date, relative time
│                                     │
│  Morning reflection                 │  ← Title (auto-derived, editable)
│                                     │
├─────────────────────────────────────┤
│  What happened?                     │  ← Content (Markdown rendered)
│  Today I noticed that...            │
│                                     │
├─────────────────────────────────────┤
│  Tags: work, family                 │
│  Importance: Normal                 │
│  Life areas: personal               │
├─────────────────────────────────────┤
│  Attachments (0)          [+ Add]   │  ← Attachment section (REQ-0007)
└─────────────────────────────────────┘
```

- Tapping content area switches to raw Markdown edit mode
- Tapping title makes it editable inline
- `[⋮ menu]` → Delete (with confirmation), Change type
- On any edit + Save: `updateRecord()` called, `updated_at` stamped

---

## Event Type: Date/Time Fields

EVENT type gets two additional fields in "More details":

- **Event start** — date + time picker, defaults to now
- **Event end** — date + time picker, optional, must be after start if set
- **Add to calendar** — toggle. If on: creates a native calendar entry via `expo-calendar` on save. The native entry is a copy — not kept in sync after creation.

Event start/end stored in the content body as a structured block:

```markdown
**Event:** 29 Sep 2026 10:00 – 11:00

Today the team met offsite...
```

Not separate DB columns — keeps schema simple. GKS parses structured content during ingest (existing GKS temporal parsing handles this).

---

## Placeholder Text by Type

| Type | Placeholder |
|---|---|
| Journal | What's on your mind? |
| Note | What do you want to remember? |
| Event | What happened? |
| Decision | What did you decide, and why? |
| Lesson | What did you learn? |
| Goal | What do you want to achieve? |
| Person | Who is this person? |

---

## Discard Dialog

```
Discard record?
[Keep editing]   [Discard]
```

"Discard" is destructive — right-aligned, red tint. "Keep editing" is the safe default — left-aligned.

---

## Navigation Flow

```
Type picker (home screen) → Capture screen (type pre-selected)
  → [Save] → Record detail screen
  → [Back, content empty] → Previous screen (no dialog)
  → [Back, content non-empty] → Discard dialog → Previous screen or stay

Record detail screen
  → [⋮ menu → Delete → confirm] → Records list or Home
  → [⋮ menu → Change type] → Type picker sheet → back to detail
```

---

## Data Written on Save

```typescript
{
  edge_id:        uuidv7(),
  type:           selectedType,
  capture_kind:   selectedCaptureKind,
  title:          deriveTitle(content),
  content:        content,
  created:        today(),            // YYYY-MM-DD
  captured_at:    now(),              // ISO8601
  classification: classification,
  importance:     importance,
  tags:           tags,
  life_areas:     lifeAreas,
  place:          place ?? null,
  sync_status:    'PENDING',
  content_sha256: sha256(content),
}
```
