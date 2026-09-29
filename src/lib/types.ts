// GKS-compatible record types. Values match GKS canonical type strings exactly.
export type RecordType =
  | 'KNOWLEDGE'
  | 'EVENT'
  | 'DECISION'
  | 'LESSON'
  | 'GOAL'
  | 'PERSON';

export type CaptureKind =
  | 'JOURNAL'
  | 'NOTE'
  | 'EVENT'
  | 'DECISION'
  | 'LESSON'
  | 'GOAL'
  | 'PERSON';

export type Classification = 'NORMAL' | 'PRIVATE';
export type Importance = 'LOW' | 'NORMAL' | 'HIGH';
export type SyncStatus = 'PENDING' | 'IN_FLIGHT' | 'ACKNOWLEDGED' | 'REJECTED';

export type LifeArea =
  | 'family' | 'professional' | 'finance' | 'children' | 'social'
  | 'personal' | 'learning' | 'health' | 'home' | 'travel' | 'legacy';

export interface Attachment {
  edge_attachment_id: string;    // UUID v7
  original_filename: string;
  size_bytes: number;
  sha256: string;
  mime_type: string;
  captured_at: string;           // ISO8601
  gks_attachment_id: string | null;
}

// Edge record envelope — strict subset of GKS frontmatter.
// Fields GKS stamps at ingest (id, security_zone, provenance, created_by_*) are absent here.
export interface EdgeRecord {
  edge_id: string;               // UUID v7, edge-assigned
  gks_id: string | null;         // null until synced; e.g. "KNOW-000042"
  schema_version: 1;
  type: RecordType;
  capture_kind: CaptureKind;
  title: string;
  content: string;               // Markdown body
  created: string;               // ISO date "YYYY-MM-DD"
  author: 'human';
  classification: Classification;
  importance: Importance;
  tags: string[];
  life_areas: LifeArea[];
  place: { name: string; precision?: string } | null;
  about: string[];               // edge_id or gks_id of PERSON records
  relationships: string[];
  attachments: Attachment[];
  captured_at: string;           // ISO8601 full timestamp
  sync_status: SyncStatus;
  sync_error: string | null;     // populated when sync_status === 'REJECTED'
  content_sha256: string;
}

// Mapping from user-facing label → GKS type + capture_kind
export const CAPTURE_TYPES: {
  label: string;
  icon: string;
  type: RecordType;
  capture_kind: CaptureKind;
}[] = [
  { label: 'Journal',  icon: '📓', type: 'KNOWLEDGE', capture_kind: 'JOURNAL'  },
  { label: 'Note',     icon: '📝', type: 'KNOWLEDGE', capture_kind: 'NOTE'     },
  { label: 'Event',    icon: '📅', type: 'EVENT',     capture_kind: 'EVENT'    },
  { label: 'Decision', icon: '⚡', type: 'DECISION',  capture_kind: 'DECISION' },
  { label: 'Lesson',   icon: '💡', type: 'LESSON',    capture_kind: 'LESSON'   },
  { label: 'Goal',     icon: '🎯', type: 'GOAL',      capture_kind: 'GOAL'     },
  { label: 'Person',   icon: '👤', type: 'PERSON',    capture_kind: 'PERSON'   },
];
