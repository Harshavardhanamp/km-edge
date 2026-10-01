import { resetDb } from './helpers/setupDb';
import { db } from '../lib/db/index';
import { createRecord } from '../lib/db/recordStore';

beforeEach(resetDb);

function tableColumns(table: string): string[] {
  return db
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
    .map((r: { name: string }) => r.name);
}

function appliedVersions(): number[] {
  return db
    .getAllSync<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
    .map((r: { version: number }) => r.version);
}

describe('migration 004 — contract alignment', () => {
  test('migration version 4 recorded', () => {
    expect(appliedVersions()).toContain(4);
  });

  test('records table has event_start column', () => {
    expect(tableColumns('records')).toContain('event_start');
  });

  test('records table has event_end column', () => {
    expect(tableColumns('records')).toContain('event_end');
  });

  test('records table has synced_content_sha256 column', () => {
    expect(tableColumns('records')).toContain('synced_content_sha256');
  });

  test('telemetry_events table is empty after migration', () => {
    const count = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM telemetry_events`)!.n;
    expect(count).toBe(0);
  });

  test('synced_content_sha256 backfilled from acknowledged delta', () => {
    createRecord({
      edge_id: 'e-backfill',
      gks_id: 'KNOW-001',
      schema_version: 1,
      type: 'KNOWLEDGE',
      capture_kind: 'JOURNAL',
      title: 'Test',
      content: 'body',
      created: '2026-10-01',
      author: 'human',
      classification: 'NORMAL',
      importance: 'NORMAL',
      tags: [],
      life_areas: [],
      place: null,
      about: [],
      relationships: [],
      captured_at: '2026-10-01T10:00:00Z',
      sync_status: 'PENDING',
      sync_error: null,
      content_sha256: 'sha-live',
    });
    // Simulate an acknowledged delta with a specific hash
    db.runSync(
      `INSERT INTO delta_log (edge_id, operation, record_type, capture_kind, timestamp, content_sha256, status, gks_record_id)
       VALUES ('e-backfill', 'CREATE', 'KNOWLEDGE', 'JOURNAL', '2026-10-01T10:00:00Z', 'sha-server-acked', 'ACKNOWLEDGED', 'KNOW-001')`
    );
    // Run the backfill UPDATE directly (migration already ran; simulate what it would do on a DB with pre-existing data)
    db.execSync(`
      UPDATE records
      SET synced_content_sha256 = (
        SELECT d.content_sha256
        FROM delta_log d
        WHERE d.edge_id = records.edge_id
          AND d.status = 'ACKNOWLEDGED'
          AND d.content_sha256 IS NOT NULL
        ORDER BY d.seq DESC
        LIMIT 1
      )
      WHERE synced_content_sha256 IS NULL
    `);
    const row = db.getFirstSync<{ synced_content_sha256: string | null }>(
      `SELECT synced_content_sha256 FROM records WHERE edge_id = 'e-backfill'`
    );
    expect(row?.synced_content_sha256).toBe('sha-server-acked');
  });

  test('event_start and event_end stored and retrieved for EVENT record', () => {
    createRecord({
      edge_id: 'e-event',
      gks_id: null,
      schema_version: 1,
      type: 'EVENT',
      capture_kind: 'EVENT',
      title: 'Team offsite',
      content: 'All hands in Bangalore',
      created: '2026-10-17',
      author: 'human',
      classification: 'NORMAL',
      importance: 'NORMAL',
      tags: [],
      life_areas: [],
      place: null,
      about: [],
      relationships: [],
      captured_at: '2026-10-01T09:00:00Z',
      sync_status: 'PENDING',
      sync_error: null,
      content_sha256: 'sha-event',
      event_start: '2026-10-17T13:00:00+05:30',
      event_end: '2026-10-17T14:00:00+05:30',
    });
    const row = db.getFirstSync<{ event_start: string | null; event_end: string | null }>(
      `SELECT event_start, event_end FROM records WHERE edge_id = 'e-event'`
    );
    expect(row?.event_start).toBe('2026-10-17T13:00:00+05:30');
    expect(row?.event_end).toBe('2026-10-17T14:00:00+05:30');
  });
});
