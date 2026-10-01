import { resetDb } from './helpers/setupDb';
import { createRecord, getRecord, localSoftDelete } from '../lib/db/recordStore';
import { db } from '../lib/db/index';

beforeEach(resetDb);

function makeRecord(overrides: Partial<Parameters<typeof createRecord>[0]> = {}) {
  return {
    edge_id: 'e-lock',
    gks_id: null as string | null,
    schema_version: 1 as const,
    type: 'KNOWLEDGE' as const,
    capture_kind: 'JOURNAL' as const,
    title: 'Synced record',
    content: 'body text',
    created: '2026-10-01',
    author: 'human' as const,
    classification: 'NORMAL' as const,
    importance: 'NORMAL' as const,
    tags: [],
    life_areas: [],
    place: null,
    about: [],
    relationships: [],
    captured_at: '2026-10-01T10:00:00Z',
    sync_status: 'PENDING' as const,
    sync_error: null,
    content_sha256: 'sha-1',
    ...overrides,
  };
}

describe('type lock — gks_id gates type change', () => {
  test('record without gks_id is not type-locked', () => {
    createRecord(makeRecord({ gks_id: null }));
    const r = getRecord('e-lock');
    expect(r?.gks_id).toBeNull();
    // UI: "Change type" option is available when gks_id is null
  });

  test('record with gks_id is type-locked', () => {
    createRecord(makeRecord({ gks_id: 'KNOW-042' }));
    const r = getRecord('e-lock');
    expect(r?.gks_id).toBe('KNOW-042');
    // UI: "Change type" option is suppressed when gks_id is set
  });

  test('gks_id set after sync acknowledges delta', () => {
    createRecord(makeRecord());
    db.runSync(`UPDATE records SET gks_id = 'KNOW-099' WHERE edge_id = 'e-lock'`);
    const r = getRecord('e-lock');
    expect(r?.gks_id).toBe('KNOW-099');
  });
});

describe('localSoftDelete', () => {
  // createRecord already inserts a PENDING CREATE delta — no extra insert needed
  beforeEach(() => {
    createRecord(makeRecord({ gks_id: 'KNOW-001' }));
  });

  test('marks record deleted', () => {
    localSoftDelete('e-lock', 'EDGE_RECORD_DELETED');
    expect(getRecord('e-lock')).toBeNull();
  });

  test('rejects pending deltas with reason', () => {
    localSoftDelete('e-lock', 'EDGE_RECORD_DELETED');
    const delta = db.getFirstSync<{ status: string; gks_error: string | null }>(
      `SELECT status, gks_error FROM delta_log WHERE edge_id = 'e-lock'`
    );
    expect(delta?.status).toBe('REJECTED');
    expect(delta?.gks_error).toBe('EDGE_RECORD_DELETED');
  });

  test('is idempotent — second call does not create a second delta', () => {
    localSoftDelete('e-lock', 'EDGE_RECORD_DELETED');
    localSoftDelete('e-lock', 'EDGE_RECORD_DELETED');
    const count = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM delta_log WHERE edge_id = 'e-lock' AND status = 'REJECTED'`
    )!.n;
    expect(count).toBe(1);
  });

  test('does not write a new DELETE delta', () => {
    localSoftDelete('e-lock', 'EDGE_RECORD_DELETED');
    const deleteDelta = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM delta_log WHERE edge_id = 'e-lock' AND operation = 'DELETE'`
    )!.n;
    expect(deleteDelta).toBe(0);
  });
});
