/**
 * K5 — device sync-health telemetry (REQ-0013 ES9.1, GKS contract §7).
 * Vocabulary only, no ids, ≤200 per batch, rows marked transmitted only after a 200.
 */
import { resetDb } from './helpers/setupDb';
import { db } from '../lib/db/index';
import {
  telemetry, buildTelemetryBatch, markTelemetryTransmitted, durationBucket, errorCategory, MAX_BATCH_EVENTS,
} from '../lib/telemetry';
import { runSync } from '../lib/sync/syncEngine';
import { __reset as resetSecureStore, setItemAsync } from 'expo-secure-store';
import { __reset as resetFs } from 'expo-file-system/legacy';
import { __setConnected } from 'expo-network';

// Exact key sets GKS's strict models accept (api/edge/models.py); anything else is 422.
const ALLOWED_KEYS: Record<string, string[]> = {
  sync_run: ['at', 'counts', 'duration_bucket', 'event', 'result'],
  error: ['at', 'category', 'event'],
  capture_count: ['at', 'by_type', 'event'],
};
const COUNT_KEYS = ['attachments', 'created', 'deleted', 'rejected', 'updated'];

function insertRecord(edge_id: string, kind: string, is_deleted = 0) {
  db.runSync(
    `INSERT INTO records (
      edge_id, gks_id, schema_version, type, capture_kind, title, content,
      created, author, classification, importance, tags, life_areas, place,
      about, relationships, captured_at, sync_status, content_sha256, is_deleted
    ) VALUES (?, NULL, 1, 'KNOWLEDGE', ?, 'T', 'C', '2026-10-01', 'human', 'NORMAL', 'NORMAL',
      '[]', '[]', NULL, '[]', '[]', '2026-10-01T10:00:00Z', 'SYNCED', 'sha', ?)`,
    edge_id, kind, is_deleted
  );
}

function queued(): number {
  return db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM telemetry_events WHERE transmitted = 0`)!.n;
}

const RUN = { result: 'completed' as const, durationMs: 1200, counts: { created: 2, updated: 1, deleted: 0, attachments: 1, rejected: 0 } };

beforeEach(async () => {
  resetDb();
  resetSecureStore();
  resetFs();
  __setConnected(true);
  jest.restoreAllMocks();
});

afterEach(() => jest.restoreAllMocks());

describe('vocabulary', () => {
  test('sync_run event carries exactly the contract fields', () => {
    telemetry.syncRun(RUN);
    const { events } = buildTelemetryBatch();
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]).sort()).toEqual(ALLOWED_KEYS.sync_run);
    expect(events[0]).toMatchObject({ event: 'sync_run', result: 'completed', duration_bucket: 'lt5s' });
    expect(Object.keys(events[0].counts as object).sort()).toEqual(COUNT_KEYS);
  });

  test('error event carries category only; raw text collapses to other', () => {
    telemetry.error('EDGE_CHECKSUM_MISMATCH');
    telemetry.error('network');
    telemetry.error('TypeError: cannot read property x of undefined at Screen.tsx:12');
    telemetry.error(undefined);
    const { events } = buildTelemetryBatch();
    expect(events.map((e) => e.category)).toEqual(['EDGE_CHECKSUM_MISMATCH', 'network', 'other', 'other']);
    for (const e of events) expect(Object.keys(e).sort()).toEqual(ALLOWED_KEYS.error);
  });

  test('errorCategory accepts §8 codes and the four generic categories only', () => {
    expect(errorCategory('EDGE_FILE_TOO_LARGE')).toBe('EDGE_FILE_TOO_LARGE');
    for (const c of ['network', 'storage', 'contract']) expect(errorCategory(c)).toBe(c);
    expect(errorCategory('EDGE_DUPLICATE')).toBe('other'); // retired in GKS P7
    expect(errorCategory('RUNTIME_ERROR')).toBe('other');
  });

  test('durationBucket boundaries', () => {
    expect(durationBucket(999)).toBe('lt1s');
    expect(durationBucket(1000)).toBe('lt5s');
    expect(durationBucket(4999)).toBe('lt5s');
    expect(durationBucket(5000)).toBe('lt30s');
    expect(durationBucket(29999)).toBe('lt30s');
    expect(durationBucket(30000)).toBe('gte30s');
  });

  test('capture_count is computed from live records, contract types only', () => {
    telemetry.syncRun(RUN);
    insertRecord('e1', 'JOURNAL');
    insertRecord('e2', 'JOURNAL');
    insertRecord('e3', 'EVENT');
    insertRecord('e4', 'NOTE', 1); // deleted — not counted
    const { events } = buildTelemetryBatch();
    const cc = events.find((e) => e.event === 'capture_count')!;
    expect(Object.keys(cc).sort()).toEqual(ALLOWED_KEYS.capture_count);
    expect(cc.by_type).toEqual({ JOURNAL: 2, EVENT: 1 });
  });

  test('legacy V1/V2 rows are deleted, never sent', () => {
    db.runSync(
      `INSERT INTO telemetry_events (session_id, user_id, tenant_id, event_type, event_name, timestamp, metadata)
       VALUES ('sess-1', 'user-1', '', 'screen_enter', 'HomeScreen', '2026-10-01T10:00:00Z', '{}')`
    );
    telemetry.syncRun(RUN);
    const { events } = buildTelemetryBatch();
    expect(events.map((e) => e.event)).toEqual(['sync_run']);
    expect(db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM telemetry_events WHERE event_type = 'screen_enter'`)!.n).toBe(0);
  });
});

describe('no identifiers leave the device', () => {
  test('batch contains no user, session, device, record or screen identifiers', () => {
    insertRecord('edge-secret-id', 'JOURNAL');
    telemetry.syncRun(RUN);
    telemetry.error('EDGE_NOT_FOUND');
    const json = JSON.stringify(buildTelemetryBatch().events);
    for (const banned of ['user_id', 'session_id', 'device_id', 'edge_id', 'tenant_id', 'screen', 'message', 'edge-secret-id']) {
      expect(json).not.toContain(banned);
    }
  });

  test('stored rows hold no user or session id', () => {
    telemetry.syncRun(RUN);
    telemetry.error('network');
    const rows = db.getAllSync<{ session_id: string; user_id: string }>(`SELECT session_id, user_id FROM telemetry_events`);
    for (const r of rows) expect(r).toEqual({ session_id: '', user_id: '' });
  });
});

describe('batching', () => {
  test(`a batch never exceeds ${MAX_BATCH_EVENTS} events including capture_count`, () => {
    insertRecord('e1', 'JOURNAL');
    for (let i = 0; i < 250; i++) telemetry.error('network');
    const { ids, events } = buildTelemetryBatch();
    expect(events.length).toBe(MAX_BATCH_EVENTS);
    expect(ids.length).toBe(MAX_BATCH_EVENTS - 1);
  });

  test('markTelemetryTransmitted marks only the given rows', () => {
    for (let i = 0; i < 3; i++) telemetry.error('network');
    const { ids } = buildTelemetryBatch();
    markTelemetryTransmitted(ids.slice(0, 2));
    expect(queued()).toBe(1);
  });
});

// ---- flush inside runSync ---------------------------------------------------

function routeFetch(telemetryStatus: number, telemetryBody: unknown = { contract_version: 1, accepted: 1 }) {
  const posted: unknown[] = [];
  const spy = jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init?: any) => {
    const u = String(url);
    let status = 200;
    let body: unknown = {};
    if (u.includes('/capabilities')) body = { contract_version: 1, supported_contract_versions: [1], attachments: {}, limits: {} };
    else if (u.includes('/sync-status')) body = { records: [], synced_record_count: 0 };
    else if (u.includes('/edge/telemetry')) {
      posted.push(JSON.parse(init.body));
      status = telemetryStatus;
      body = telemetryBody;
    }
    return { ok: status < 300, status, json: () => Promise.resolve(body), headers: { get: () => null } } as unknown as Response;
  });
  return { posted, spy };
}

async function signIn() {
  await setItemAsync('gks_server_url', 'http://gks.test');
  await setItemAsync('edge_token', 'tok-test');
  await setItemAsync('device_id', 'dev-001');
}

describe('runSync flush', () => {
  test('200 → queued rows marked transmitted; posts to /api/v1/edge/telemetry', async () => {
    await signIn();
    telemetry.error('network');
    const { posted } = routeFetch(200);
    const result = await runSync();
    expect(result.telemetryFlushed).toBe(1);
    expect(posted).toHaveLength(1);
    expect((posted[0] as any).events[0]).toMatchObject({ event: 'error', category: 'network' });
    // only this run's own sync_run is left queued, for the next run
    const left = db.getAllSync<{ event_type: string }>(`SELECT event_type FROM telemetry_events WHERE transmitted = 0`);
    expect(left.map((r) => r.event_type)).toEqual(['sync_run']);
  });

  test('server error → rows stay queued for the next run', async () => {
    await signIn();
    telemetry.error('network');
    routeFetch(500, { error: { code: 'EDGE_SERVER_ERROR', message: 'x' } });
    const result = await runSync();
    expect(result.telemetryFlushed).toBe(0);
    expect(db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM telemetry_events WHERE transmitted = 0 AND event_type = 'error' AND metadata LIKE '%network%'`)!.n).toBe(1);
  });

  test('422 EDGE_VALIDATION → batch dropped so it cannot block later batches', async () => {
    await signIn();
    telemetry.error('network');
    routeFetch(422, { error: { code: 'EDGE_VALIDATION', message: 'x', details: { fields: ['events.0'] } } });
    await runSync();
    expect(db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM telemetry_events WHERE transmitted = 0 AND metadata LIKE '%network%'`)!.n).toBe(0);
  });

  test('each run queues one sync_run with counts', async () => {
    await signIn();
    routeFetch(200);
    await runSync();
    const { events } = buildTelemetryBatch();
    const run = events.find((e) => e.event === 'sync_run')!;
    expect(run).toMatchObject({ result: 'completed', counts: { created: 0, updated: 0, deleted: 0, attachments: 0, rejected: 0 } });
  });
});
