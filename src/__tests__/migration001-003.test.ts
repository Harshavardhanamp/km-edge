import { resetDb } from './helpers/setupDb';
import { db } from '../lib/db/index';

beforeEach(resetDb);

function tableColumns(table: string): string[] {
  return db
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
    .map(r => r.name);
}

function appliedVersions(): number[] {
  return db
    .getAllSync<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
    .map(r => r.version);
}

describe('schema_migrations', () => {
  test('all three migrations recorded', () => {
    expect(appliedVersions()).toEqual([1, 2, 3]);
  });
});

describe('migration 001 — initial schema', () => {
  test('records table has required columns', () => {
    const cols = tableColumns('records');
    for (const c of ['edge_id', 'gks_id', 'type', 'content', 'sync_status', 'content_sha256']) {
      expect(cols).toContain(c);
    }
  });

  test('delta_log table has required columns', () => {
    const cols = tableColumns('delta_log');
    for (const c of ['seq', 'edge_id', 'operation', 'status', 'retry_count']) {
      expect(cols).toContain(c);
    }
  });

  test('attachments table exists', () => {
    expect(tableColumns('attachments')).toContain('edge_attachment_id');
  });

  test('telemetry_events table exists', () => {
    expect(tableColumns('telemetry_events')).toContain('event_type');
  });
});

describe('migration 002 — v2 additions', () => {
  test('attachments has pending_delete column', () => {
    expect(tableColumns('attachments')).toContain('pending_delete');
  });

  test('delta_log has gks_record_id column', () => {
    expect(tableColumns('delta_log')).toContain('gks_record_id');
  });
});

describe('migration 003 — attachment sync', () => {
  test('attachments has sync_status column', () => {
    expect(tableColumns('attachments')).toContain('sync_status');
  });

  test('attachments has sync_error column', () => {
    expect(tableColumns('attachments')).toContain('sync_error');
  });
});
