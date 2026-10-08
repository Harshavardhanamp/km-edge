import { EDGE_CONTRACT_VERSION } from '../contract';
import type { DateRef, EdgeRecord, FieldOrigin, IdentityRef } from '../types';

export interface Envelope {
  schema_version: typeof EDGE_CONTRACT_VERSION;
  edge_id: string;
  record_type: string;
  title: string;
  content: string;
  content_sha256: string;
  created: string;
  captured_at: string;
  classification: string;
  importance: string;
  life_areas: string[];
  tags: string[];
  place_label?: string;
  event?: { start: string; end?: string };
  // Contract v2 §6 (KK-2.2 E5.1): structure entered on the review card, each with its origin.
  summary?: string | null;
  topics?: IdentityRef[];
  people?: IdentityRef[];
  place?: IdentityRef | null;
  dates?: DateRef[];
  title_origin?: FieldOrigin;
  summary_origin?: FieldOrigin;
  type_origin?: FieldOrigin;
  importance_origin?: FieldOrigin;
  topics_origin?: FieldOrigin;
  people_origin?: FieldOrigin;
  place_origin?: FieldOrigin;
  dates_origin?: FieldOrigin;
}

export interface EnvelopeWithBase extends Envelope {
  base_content_sha256: string | null;
}

export function buildEnvelope(
  record: EdgeRecord & { event_start?: string | null; event_end?: string | null }
): Envelope {
  const env: Envelope = {
    schema_version: EDGE_CONTRACT_VERSION,
    edge_id: record.edge_id,
    record_type: record.capture_kind,
    title: record.title,
    content: record.content,
    content_sha256: record.content_sha256,
    created: record.created,
    captured_at: record.captured_at,
    classification: record.classification,
    importance: record.importance,
    life_areas: record.life_areas,
    tags: record.tags,
  };

  if (record.place?.name) {
    env.place_label = record.place.name;
  }

  if (record.capture_kind === 'EVENT' && record.event_start) {
    env.event = { start: record.event_start };
    if (record.event_end) env.event.end = record.event_end;
  }

  const s = record.structure;
  if (s) {
    env.summary = s.summary;
    env.topics = s.topics;
    env.people = s.people;
    env.place = s.place;
    env.dates = s.dates;
    for (const [field, origin] of Object.entries(s.origins)) {
      if (origin) (env as unknown as Record<string, unknown>)[`${field}_origin`] = origin;
    }
  }

  return env;
}

export function buildUpdateEnvelope(
  record: EdgeRecord & { event_start?: string | null; event_end?: string | null },
  synced_content_sha256: string | null
): EnvelopeWithBase {
  return { ...buildEnvelope(record), base_content_sha256: synced_content_sha256 };
}
