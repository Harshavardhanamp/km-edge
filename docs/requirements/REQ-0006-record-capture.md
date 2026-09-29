# REQ-0006: Record Capture

**Date:** 2026-09-29  
**Status:** Frozen  
**Author:** Harshavardhana P  
**Related:** REQ-0002 F1, ADR-0005, ADR-0009, ADR-0010

---

## RC1 — Supported Record Types

All 7 types supported in V1. One shared capture form — type shown at top, form fields identical across types.

| User label | GKS type | GKS capture_kind |
|---|---|---|
| Journal | KNOWLEDGE | JOURNAL |
| Note | KNOWLEDGE | NOTE |
| Event | EVENT | EVENT |
| Decision | DECISION | DECISION |
| Lesson | LESSON | LESSON |
| Goal | GOAL | GOAL |
| Person | PERSON | PERSON |

Type is selectable at creation and editable after creation on the detail screen.

---

## RC2 — Mandatory Fields

Exactly two fields are required to save a record:

1. **Content** — the message/body. User must enter content before saving.
2. **Type** — selected before opening the capture form (from the type-picker). Editable after creation.

All other fields are optional.

---

## RC3 — Title Handling

- **No title input field on the capture screen.** User does not type a title.
- Title is **auto-derived** from the first sentence of content at save time (truncated to 100 chars, matching GKS behaviour).
- Title is stored in the local record — schema is consistent with GKS (`title` field always populated).
- At sync time, GKS **optionally overwrites** the title with an AI-generated title via Ollama during ingest. This happens asynchronously on the GKS side — user does not wait for it.
- The improved GKS title flows back to the edge when bidirectional sync is implemented (V2+).
- User can manually edit the title on the record detail screen at any time.

---

## RC4 — Content Body

- Plain Markdown text input — matches GKS content format exactly
- Rendered as Markdown on the record detail screen (read mode)
- Raw Markdown editable on the capture and edit screens (edit mode)
- No rich text editor, no toolbar in V1

---

## RC5 — Optional Fields (exposed in capture form)

All optional. User can skip any or all of them:

| Field | Input type | GKS field |
|---|---|---|
| Tags | Comma-separated text input, max 20 tags, max 64 chars each | `tags` |
| Importance | Segmented control: Low / Normal / High (default: Normal) | `importance` |
| Classification | Toggle: Normal / Private (default: Normal) | `classification` |
| Life areas | Multi-select from fixed list of 11 GKS life areas | `life_areas` |
| Place | Free text name field | `place.name` |
| Date | Date picker (defaults to today) | `created` |

---

## RC6 — Event Type: Date + Time Picker

For the EVENT type only, an additional field appears in the form:

- **Event start:** date + time picker (mandatory for EVENT, optional for all others)
- **Event end:** date + time picker (optional)
- These values are stored in the content body as structured Markdown frontmatter — not separate DB columns in V1
- Optionally creates a native calendar entry on the device (user chooses via a toggle)

---

## RC7 — Auto-Save

- **No auto-save.** Save happens only on explicit tap of the Save button.
- If user navigates away without saving, content is lost — no draft recovery in V1.
- A discard confirmation dialog is shown if user has typed content and attempts to navigate away.

---

## RC8 — Save Behaviour

On Save:
1. Derive title from first sentence of content
2. Compute `content_sha256`
3. Write record + delta log entry atomically to SQLite (REQ-0005 S2.1)
4. Navigate to record detail screen
5. Home screen recent list updates on next render

---

## RC9 — Edit Behaviour

From the record detail screen:
- All fields editable inline (same screen, not a separate edit screen)
- Save writes the update atomically (REQ-0005 S2.2)
- Type is editable — changing type updates `type` and `capture_kind`, re-derives title if content changed
- `updated_at` timestamp set on every save

---

## RC10 — Delete Behaviour

From the record detail screen:
- Delete shows a confirmation dialog
- On confirm: soft delete (REQ-0005 S2.3) — record hidden from all lists immediately
- Record physically remains in SQLite until V2 sync acknowledges the DELETE

---

## RC11 — Out of Scope (V1)

- Attachments — separate feature (REQ-0007)
- Relationships / `about` field linking to other records — V2
- Voice capture — V2
- AI-assisted field suggestions (capture_ai) — V2
