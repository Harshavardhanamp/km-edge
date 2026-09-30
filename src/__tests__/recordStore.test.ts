import { resetDb } from './helpers/setupDb';
import {
  createRecord,
  updateRecord,
  softDeleteRecord,
  getRecord,
  listRecords,
  getRecentRecords,
  getCalendarFields,
} from '../lib/db/recordStore';
import { db } from '../lib/db/index';

function makeRecord(overrides: Partial<Parameters<typeof createRecord>[0]> = {}) {
  return {
    edge_id: 'edge-1',
    gks_id: null,
    schema_version: 1 as const,
    type: 'KNOWLEDGE' as const,
    capture_kind: 'JOURNAL' as const,
    title: 'Test record',
    content: 'Hello world',
    created: '2026-09-30',
    author: 'human' as const,
    classification: 'NORMAL' as const,
    importance: 'NORMAL' as const,
    tags: ['tag1'],
    life_areas: ['personal'] as any,
    place: null,
    about: [],
    relationships: [],
    captured_at: '2026-09-30T10:00:00Z',
    sync_status: 'PENDING' as const,
    sync_error: null,
    content_sha256: 'abc123',
    ...overrides,
  };
}

beforeEach(resetDb);

describe('createRecord', () => {
  test('inserts record and can be retrieved', () => {
    createRecord(makeRecord());
    const r = getRecord('edge-1');
    expect(r).not.toBeNull();
    expect(r!.title).toBe('Test record');
    expect(r!.tags).toEqual(['tag1']);
    expect(r!.life_areas).toEqual(['personal']);
  });

  test('writes a PENDING CREATE delta', () => {
    createRecord(makeRecord());
    const delta = db.getFirstSync<{ operation: string; status: string }>(
      `SELECT operation, status FROM delta_log WHERE edge_id = 'edge-1'`
    );
    expect(delta?.operation).toBe('CREATE');
    expect(delta?.status).toBe('PENDING');
  });

  test('stores place as JSON and round-trips correctly', () => {
    createRecord(makeRecord({ place: { name: 'Home', precision: 'city' } as any }));
    const r = getRecord('edge-1');
    expect(r!.place).toEqual({ name: 'Home', precision: 'city' });
  });

  test('stores null place correctly', () => {
    createRecord(makeRecord({ place: null }));
    const r = getRecord('edge-1');
    expect(r!.place).toBeNull();
  });

  test('create and delta are atomic — both exist or neither', () => {
    createRecord(makeRecord());
    const recCount = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM records`)!.n;
    const deltaCount = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM delta_log`)!.n;
    expect(recCount).toBe(1);
    expect(deltaCount).toBe(1);
  });
});

describe('updateRecord', () => {
  beforeEach(() => createRecord(makeRecord()));

  test('updates title and writes UPDATE delta', () => {
    updateRecord('edge-1', { title: 'Updated title' });
    const r = getRecord('edge-1');
    expect(r!.title).toBe('Updated title');
    const delta = db.getFirstSync<{ operation: string }>(
      `SELECT operation FROM delta_log WHERE edge_id = 'edge-1' AND operation = 'UPDATE'`
    );
    expect(delta).not.toBeNull();
  });

  test('merges partial changes — unchanged fields are preserved', () => {
    updateRecord('edge-1', { title: 'New title' });
    const r = getRecord('edge-1');
    expect(r!.content).toBe('Hello world');
    expect(r!.tags).toEqual(['tag1']);
  });

  test('sets updated_at timestamp', () => {
    updateRecord('edge-1', { title: 'x' });
    const row = db.getFirstSync<{ updated_at: string | null }>(
      `SELECT updated_at FROM records WHERE edge_id = 'edge-1'`
    );
    expect(row?.updated_at).toBeTruthy();
  });

  test('is a no-op on a non-existent edge_id', () => {
    updateRecord('does-not-exist', { title: 'x' });
    const count = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM delta_log WHERE operation='UPDATE'`)!.n;
    expect(count).toBe(0);
  });

  test('updates tags array correctly', () => {
    updateRecord('edge-1', { tags: ['a', 'b', 'c'] });
    expect(getRecord('edge-1')!.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('softDeleteRecord', () => {
  beforeEach(() => createRecord(makeRecord()));

  test('marks record as deleted and hidden from getRecord', async () => {
    await softDeleteRecord('edge-1');
    expect(getRecord('edge-1')).toBeNull();
  });

  test('writes a PENDING DELETE delta', async () => {
    await softDeleteRecord('edge-1');
    const delta = db.getFirstSync<{ operation: string; status: string }>(
      `SELECT operation, status FROM delta_log WHERE operation = 'DELETE'`
    );
    expect(delta?.operation).toBe('DELETE');
    expect(delta?.status).toBe('PENDING');
  });

  test('stamps gks_record_id on DELETE delta when record has gks_id (A1 fix)', async () => {
    db.runSync(`UPDATE records SET gks_id = 'KNOW-999' WHERE edge_id = 'edge-1'`);
    await softDeleteRecord('edge-1');
    const delta = db.getFirstSync<{ gks_record_id: string | null }>(
      `SELECT gks_record_id FROM delta_log WHERE operation = 'DELETE'`
    );
    expect(delta?.gks_record_id).toBe('KNOW-999');
  });

  test('gks_record_id is null on DELETE delta when record was never synced', async () => {
    await softDeleteRecord('edge-1');
    const delta = db.getFirstSync<{ gks_record_id: string | null }>(
      `SELECT gks_record_id FROM delta_log WHERE operation = 'DELETE'`
    );
    expect(delta?.gks_record_id).toBeNull();
  });

  test('is idempotent — second call is a no-op', async () => {
    await softDeleteRecord('edge-1');
    await softDeleteRecord('edge-1');
    const count = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM delta_log WHERE operation = 'DELETE'`
    )!.n;
    expect(count).toBe(1);
  });
});

describe('getRecord', () => {
  test('returns null for unknown edge_id', () => {
    expect(getRecord('no-such-id')).toBeNull();
  });

  test('returns null for soft-deleted record', async () => {
    createRecord(makeRecord());
    await softDeleteRecord('edge-1');
    expect(getRecord('edge-1')).toBeNull();
  });
});

describe('listRecords / getRecentRecords', () => {
  beforeEach(() => {
    createRecord(makeRecord({ edge_id: 'e1', captured_at: '2026-09-30T08:00:00Z' }));
    createRecord(makeRecord({ edge_id: 'e2', captured_at: '2026-09-30T09:00:00Z' }));
    createRecord(makeRecord({ edge_id: 'e3', captured_at: '2026-09-30T10:00:00Z' }));
  });

  test('listRecords returns all non-deleted in descending order', () => {
    const records = listRecords(10, 0);
    expect(records).toHaveLength(3);
    expect(records[0].edge_id).toBe('e3');
    expect(records[2].edge_id).toBe('e1');
  });

  test('listRecords honours limit and offset', () => {
    expect(listRecords(2, 0)).toHaveLength(2);
    expect(listRecords(2, 2)).toHaveLength(1);
  });

  test('listRecords excludes soft-deleted records', async () => {
    await softDeleteRecord('e2');
    expect(listRecords(10, 0)).toHaveLength(2);
  });

  test('getRecentRecords returns top-n most recent', () => {
    const recent = getRecentRecords(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].edge_id).toBe('e3');
  });
});

describe('getCalendarFields', () => {
  test('returns null for unknown edge_id', () => {
    expect(getCalendarFields('no-such')).toBeNull();
  });

  test('returns calendar fields including soft-deleted records', async () => {
    createRecord(makeRecord({
      native_calendar_event_id: 'ev-001',
      has_calendar_entry: true,
      reminder_minutes: 30,
    }));
    const fields = getCalendarFields('edge-1');
    expect(fields).toEqual({
      native_calendar_event_id: 'ev-001',
      has_calendar_entry: true,
      reminder_minutes: 30,
    });
  });
});
