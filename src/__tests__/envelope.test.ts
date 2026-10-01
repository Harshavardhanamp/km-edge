import { buildEnvelope, buildUpdateEnvelope } from '../lib/sync/envelope';
import { EDGE_CONTRACT_VERSION } from '../lib/contract';
import type { EdgeRecord } from '../lib/types';

function makeRecord(overrides: Partial<EdgeRecord & { event_start?: string | null; event_end?: string | null }> = {}) {
  return {
    edge_id: 'e-001',
    gks_id: null,
    schema_version: 1 as const,
    type: 'KNOWLEDGE' as const,
    capture_kind: 'JOURNAL' as const,
    title: 'Test journal',
    content: 'Today was a good day',
    created: '2026-10-01',
    author: 'human' as const,
    classification: 'NORMAL' as const,
    importance: 'NORMAL' as const,
    tags: ['work'],
    life_areas: ['professional'] as any,
    place: null,
    about: [],
    relationships: [],
    attachments: [],
    captured_at: '2026-10-01T10:00:00Z',
    sync_status: 'PENDING' as const,
    sync_error: null,
    content_sha256: 'abc123',
    ...overrides,
  };
}

describe('buildEnvelope', () => {
  test('sets schema_version to EDGE_CONTRACT_VERSION', () => {
    const env = buildEnvelope(makeRecord());
    expect(env.schema_version).toBe(EDGE_CONTRACT_VERSION);
  });

  test('includes required fields', () => {
    const env = buildEnvelope(makeRecord());
    expect(env.edge_id).toBe('e-001');
    expect(env.record_type).toBe('JOURNAL');
    expect(env.content).toBe('Today was a good day');
    expect(env.content_sha256).toBe('abc123');
    expect(env.created).toBe('2026-10-01');
    expect(env.captured_at).toBe('2026-10-01T10:00:00Z');
    expect(env.classification).toBe('NORMAL');
    expect(env.importance).toBe('NORMAL');
    expect(env.tags).toEqual(['work']);
    expect(env.life_areas).toEqual(['professional']);
  });

  test('no event field for non-EVENT records', () => {
    const env = buildEnvelope(makeRecord({ capture_kind: 'JOURNAL', event_start: '2026-10-01T13:00:00Z' }));
    expect(env.event).toBeUndefined();
  });

  test('EVENT record includes event.start from column', () => {
    const env = buildEnvelope(makeRecord({
      capture_kind: 'EVENT',
      type: 'EVENT',
      event_start: '2026-10-17T13:00:00+05:30',
      event_end: null,
    }));
    expect(env.event).toEqual({ start: '2026-10-17T13:00:00+05:30' });
  });

  test('EVENT record includes event.end when present', () => {
    const env = buildEnvelope(makeRecord({
      capture_kind: 'EVENT',
      type: 'EVENT',
      event_start: '2026-10-17T13:00:00+05:30',
      event_end: '2026-10-17T14:00:00+05:30',
    }));
    expect(env.event).toEqual({ start: '2026-10-17T13:00:00+05:30', end: '2026-10-17T14:00:00+05:30' });
  });

  test('EVENT with no event_start produces no event field', () => {
    const env = buildEnvelope(makeRecord({ capture_kind: 'EVENT', type: 'EVENT', event_start: null }));
    expect(env.event).toBeUndefined();
  });

  test('place_label from place.name', () => {
    const env = buildEnvelope(makeRecord({ place: { name: 'Bangalore' } }));
    expect(env.place_label).toBe('Bangalore');
  });

  test('no place_label when place is null', () => {
    const env = buildEnvelope(makeRecord({ place: null }));
    expect(env.place_label).toBeUndefined();
  });

  test('content is stored verbatim — no body injection', () => {
    const env = buildEnvelope(makeRecord({
      capture_kind: 'EVENT',
      type: 'EVENT',
      content: 'Team offsite',
      event_start: '2026-10-17T13:00:00+05:30',
    }));
    expect(env.content).toBe('Team offsite');
    expect(env.content).not.toContain('Event:');
  });
});

describe('buildUpdateEnvelope', () => {
  test('includes base_content_sha256 when provided', () => {
    const env = buildUpdateEnvelope(makeRecord(), 'prev-sha');
    expect(env.base_content_sha256).toBe('prev-sha');
  });

  test('base_content_sha256 is null when never synced', () => {
    const env = buildUpdateEnvelope(makeRecord(), null);
    expect(env.base_content_sha256).toBeNull();
  });
});
