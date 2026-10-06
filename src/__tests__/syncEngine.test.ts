/**
 * syncEngine tests — K4
 * Uses in-memory SQLite (expo-sqlite mock) + SecureStore mock.
 * fetch is mocked per-test via jest.spyOn(global, 'fetch').
 */
import { resetDb } from './helpers/setupDb';
import { db } from '../lib/db/index';
import { runSync } from '../lib/sync/syncEngine';
import { __reset as resetSecureStore } from 'expo-secure-store';
import { __setConnected } from 'expo-network';

// ---- helpers ----------------------------------------------------------------

function insertRecord(overrides: Partial<{
  edge_id: string;
  gks_id: string | null;
  title: string;
  content: string;
  content_sha256: string;
  synced_content_sha256: string | null;
  capture_kind: string;
  is_deleted: number;
}> = {}) {
  const edge_id = overrides.edge_id ?? 'edge-001';
  db.runSync(
    `INSERT INTO records (
      edge_id, gks_id, schema_version, type, capture_kind, title, content,
      created, author, classification, importance, tags, life_areas, place,
      about, relationships, captured_at, sync_status, content_sha256, synced_content_sha256, is_deleted
    ) VALUES (?, ?, 1, 'KNOWLEDGE', ?, ?, ?, '2026-10-01', 'human', 'NORMAL', 'NORMAL',
      '[]', '[]', NULL, '[]', '[]', '2026-10-01T10:00:00Z', 'PENDING', ?, ?, ?)`,
    edge_id,
    overrides.gks_id ?? null,
    overrides.capture_kind ?? 'JOURNAL',
    overrides.title ?? 'Test Record',
    overrides.content ?? 'Test content',
    overrides.content_sha256 ?? 'sha-abc',
    overrides.synced_content_sha256 ?? null,
    overrides.is_deleted ?? 0,
  );
  return edge_id;
}

function insertDelta(edge_id: string, operation: string, gks_record_id: string | null = null) {
  db.runSync(
    `INSERT INTO delta_log (edge_id, operation, record_type, capture_kind, timestamp, status, gks_record_id)
     VALUES (?, ?, 'KNOWLEDGE', 'JOURNAL', '2026-10-01T10:00:00Z', 'PENDING', ?)`,
    edge_id, operation, gks_record_id
  );
  return (db.getFirstSync<{ seq: number }>(`SELECT last_insert_rowid() AS seq`))!.seq;
}

async function setupSecureStore() {
  const { setItemAsync } = await import('expo-secure-store');
  await setItemAsync('gks_server_url', 'http://gks.test');
  await setItemAsync('edge_token', 'tok-test');
  await setItemAsync('device_id', 'dev-001');
  // Suppress capabilities cache so it fetches each time
}

function mockFetch(responses: Array<{ ok?: boolean; status?: number; json?: () => Promise<unknown> }>) {
  let callIndex = 0;
  return jest.spyOn(global, 'fetch').mockImplementation(async (_url, _opts) => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok ?? true,
      status: resp.status ?? 200,
      json: resp.json ?? (() => Promise.resolve({})),
      text: () => Promise.resolve(''),
      headers: { get: () => null },
    } as unknown as Response;
  });
}

function capOk() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      contract_version: 1,
      supported_contract_versions: [1],
      server: { display_name: 'GKS', version: '1.0', build_sha: 'abc' },
      attachments: { allowed_extensions: [], max_file_bytes: 0, max_record_total_bytes: 0, max_files_per_record: 0, scan_policy: '' },
      limits: { max_content_chars: 0, max_tags: 0, max_tag_chars: 0, max_batch_telemetry_events: 0 },
      record_types: [],
      life_areas: [],
      session: { absolute_seconds: 0 },
    }),
  };
}

function healthOk() {
  return { ok: true, status: 200, json: () => Promise.resolve({}) };
}

function syncStatusEmpty() {
  return { ok: true, status: 200, json: () => Promise.resolve({ records: [], synced_record_count: 0 }) };
}

// ---- setup / teardown -------------------------------------------------------

beforeEach(async () => {
  resetDb();
  resetSecureStore();
  __setConnected(true);
  await setupSecureStore();
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---- tests ------------------------------------------------------------------

describe('CREATE — tags accepted → ACCEPTED state', () => {
  test('delta is ACKNOWLEDGED and gks_id written to record', async () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'CREATE');

    mockFetch([
      capOk(),          // capabilities
      healthOk(),       // /api/v1/health
      { ok: true, status: 200, json: () => Promise.resolve({ state: 'ACCEPTED', gks_id: 'GKS-001', content_sha256: 'sha-abc' }) }, // createRecord
      syncStatusEmpty(), // verifyChecksums
    ]);

    const result = await runSync();
    expect(result.synced).toBe(1);

    const delta = db.getFirstSync<{ status: string; gks_record_id: string }>(
      `SELECT status, gks_record_id FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('ACKNOWLEDGED');

    const record = db.getFirstSync<{ gks_id: string }>(
      `SELECT gks_id FROM records WHERE edge_id = ?`, edge_id
    );
    expect(record?.gks_id).toBe('GKS-001');
  });
});

describe('CREATE — replay → ALREADY_SYNCED', () => {
  test('delta is ACKNOWLEDGED', async () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'CREATE');

    mockFetch([
      capOk(),
      healthOk(),
      { ok: true, status: 200, json: () => Promise.resolve({ state: 'ALREADY_SYNCED', gks_id: 'GKS-002', content_sha256: 'sha-abc' }) },
      syncStatusEmpty(),
    ]);

    const result = await runSync();
    expect(result.synced).toBe(1);

    const delta = db.getFirstSync<{ status: string }>(
      `SELECT status FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('ACKNOWLEDGED');
  });
});

describe('UPDATE — record has gks_id and synced_content_sha256', () => {
  test('calls updateRecord → UPDATED → acknowledged', async () => {
    const edge_id = insertRecord({ gks_id: 'GKS-003', content_sha256: 'sha-v2', synced_content_sha256: 'sha-v1' });
    insertDelta(edge_id, 'UPDATE', 'GKS-003');

    mockFetch([
      capOk(),
      healthOk(),
      { ok: true, status: 200, json: () => Promise.resolve({ state: 'UPDATED', gks_id: 'GKS-003', content_sha256: 'sha-v2' }) },
      syncStatusEmpty(),
    ]);

    const result = await runSync();
    expect(result.synced).toBe(1);

    const delta = db.getFirstSync<{ status: string }>(
      `SELECT status FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('ACKNOWLEDGED');

    const record = db.getFirstSync<{ synced_content_sha256: string }>(
      `SELECT synced_content_sha256 FROM records WHERE edge_id = ?`, edge_id
    );
    expect(record?.synced_content_sha256).toBe('sha-v2');
  });
});

describe('UPDATE — record has gks_id but no pending content change', () => {
  test('acknowledges locally without network call for record data', async () => {
    const edge_id = insertRecord({ gks_id: 'GKS-004', content_sha256: 'sha-abc', synced_content_sha256: null });
    insertDelta(edge_id, 'UPDATE', 'GKS-004');

    const fetchSpy = mockFetch([
      capOk(),
      healthOk(),
      // no createRecord/updateRecord call expected
      syncStatusEmpty(),
    ]);

    const result = await runSync();
    expect(result.synced).toBe(1);

    const delta = db.getFirstSync<{ status: string }>(
      `SELECT status FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('ACKNOWLEDGED');

    // Only 3 fetch calls: capabilities, health, syncStatus (no record API call)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('DELETE — gks_id present', () => {
  test('calls deleteRecord → delta ACKNOWLEDGED', async () => {
    const edge_id = insertRecord({ gks_id: 'GKS-005', is_deleted: 1 });
    insertDelta(edge_id, 'DELETE', 'GKS-005');

    mockFetch([
      capOk(),
      healthOk(),
      { ok: true, status: 200, json: () => Promise.resolve({ state: 'DELETED' }) },
      syncStatusEmpty(),
    ]);

    const result = await runSync();
    expect(result.synced).toBe(1);

    const delta = db.getFirstSync<{ status: string }>(
      `SELECT status FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('ACKNOWLEDGED');
  });
});

describe('DELETE — gks_id null (never synced)', () => {
  test('acknowledges locally, no record API network call', async () => {
    const edge_id = insertRecord({ gks_id: null, is_deleted: 1 });
    insertDelta(edge_id, 'DELETE', null);

    const fetchSpy = mockFetch([
      capOk(),
      healthOk(),
      syncStatusEmpty(),
    ]);

    const result = await runSync();
    expect(result.synced).toBe(1);

    // Only capabilities, health, syncStatus
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('Session expired', () => {
  test('401 EDGE_SESSION_EXPIRED → delta reset to PENDING, sync stops', async () => {
    const edge_id1 = insertRecord({ edge_id: 'edge-a' });
    const edge_id2 = insertRecord({ edge_id: 'edge-b' });
    insertDelta(edge_id1, 'CREATE');
    insertDelta(edge_id2, 'CREATE');

    mockFetch([
      capOk(),
      healthOk(),
      { ok: false, status: 401, json: () => Promise.resolve({ error: { code: 'EDGE_SESSION_EXPIRED', message: 'expired' } }) },
      // edge-b should NOT be processed
    ]);

    const result = await runSync();
    expect(result.synced).toBe(0);

    const d1 = db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE edge_id = ?`, edge_id1);
    const d2 = db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE edge_id = ?`, edge_id2);
    expect(d1?.status).toBe('PENDING');
    expect(d2?.status).toBe('PENDING');
  });
});

describe('426 contract unsupported', () => {
  test('capabilities 426 → sync aborts early, no deltas processed', async () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'CREATE');

    mockFetch([
      { ok: false, status: 426, json: () => Promise.resolve({ code: 'EDGE_CONTRACT_UNSUPPORTED', supported_contract_versions: [2], requested_version: 1 }) },
    ]);

    const result = await runSync();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);

    const delta = db.getFirstSync<{ status: string }>(
      `SELECT status FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('PENDING');
  });
});

describe('Network error mid-run', () => {
  test('network error → current delta reset to PENDING, remaining not processed', async () => {
    const edge_id1 = insertRecord({ edge_id: 'edge-c' });
    const edge_id2 = insertRecord({ edge_id: 'edge-d' });
    insertDelta(edge_id1, 'CREATE');
    insertDelta(edge_id2, 'CREATE');

    // createRecord will throw network error
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/api/v1/edge/capabilities')) return { ok: true, status: 200, json: () => Promise.resolve({ contract_version: 1, supported_contract_versions: [1], server: { display_name: '', version: '', build_sha: '' }, attachments: { allowed_extensions: [], max_file_bytes: 0, max_record_total_bytes: 0, max_files_per_record: 0, scan_policy: '' }, limits: { max_content_chars: 0, max_tags: 0, max_tag_chars: 0, max_batch_telemetry_events: 0 }, record_types: [], life_areas: [], session: { absolute_seconds: 0 } }) } as unknown as Response;
      if (u.includes('/api/v1/health')) return { ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response;
      if (u.includes('/api/v1/edge/records') && !u.includes('sync-status')) throw new Error('Network failure');
      if (u.includes('sync-status')) return { ok: true, status: 200, json: () => Promise.resolve({ records: [], synced_record_count: 0 }) } as unknown as Response;
      throw new Error('Unexpected URL: ' + u);
    });

    const result = await runSync();
    expect(result.synced).toBe(0);

    const d1 = db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE edge_id = ?`, edge_id1);
    const d2 = db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE edge_id = ?`, edge_id2);
    expect(d1?.status).toBe('PENDING');
    expect(d2?.status).toBe('PENDING');
  });
});

describe('last_synced_at', () => {
  test('is written after sync run', async () => {
    mockFetch([
      capOk(),
      healthOk(),
      syncStatusEmpty(),
    ]);

    await runSync();

    const { getItemAsync } = await import('expo-secure-store');
    const val = await getItemAsync('last_synced_at');
    expect(val).toBeTruthy();
    expect(new Date(val!).getTime()).toBeGreaterThan(0);
  });
});

describe('verifyChecksums', () => {
  test('mismatch → retry_count incremented, delta reset to PENDING', async () => {
    const edge_id = insertRecord({ gks_id: 'GKS-010', content_sha256: 'sha-local' });
    // Insert an ACKNOWLEDGED delta
    db.runSync(
      `INSERT INTO delta_log (edge_id, operation, record_type, capture_kind, timestamp, status, gks_record_id)
       VALUES (?, 'CREATE', 'KNOWLEDGE', 'JOURNAL', '2026-10-01T00:00:00Z', 'ACKNOWLEDGED', 'GKS-010')`,
      edge_id
    );

    // No PENDING deltas, so delta loop runs 0 times; only verifyChecksums runs
    mockFetch([
      capOk(),
      healthOk(),
      // syncStatus returns mismatched sha
      { ok: true, status: 200, json: () => Promise.resolve({ records: [{ edge_id, content_sha256: 'sha-server-different' }], synced_record_count: 1 }) },
    ]);

    await runSync();

    const delta = db.getFirstSync<{ status: string; retry_count: number }>(
      `SELECT status, retry_count FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('PENDING');
    expect(delta?.retry_count).toBe(1);
  });

  test('after 3 mismatches → delta REJECTED with EDGE_CHECKSUM_MISMATCH', async () => {
    const edge_id = insertRecord({ gks_id: 'GKS-011', content_sha256: 'sha-local-x' });
    db.runSync(
      `INSERT INTO delta_log (edge_id, operation, record_type, capture_kind, timestamp, status, gks_record_id, retry_count)
       VALUES (?, 'CREATE', 'KNOWLEDGE', 'JOURNAL', '2026-10-01T00:00:00Z', 'ACKNOWLEDGED', 'GKS-011', 2)`,
      edge_id
    );

    mockFetch([
      capOk(),
      healthOk(),
      { ok: true, status: 200, json: () => Promise.resolve({ records: [{ edge_id, content_sha256: 'sha-wrong' }], synced_record_count: 0 }) },
    ]);

    await runSync();

    const delta = db.getFirstSync<{ status: string; gks_error: string }>(
      `SELECT status, gks_error FROM delta_log WHERE edge_id = ?`, edge_id
    );
    expect(delta?.status).toBe('REJECTED');
    expect(delta?.gks_error).toBe('EDGE_CHECKSUM_MISMATCH');
  });
});

describe('K6 — last_synced_at honesty (REQ-0013 C6.2)', () => {
  async function lastSynced() {
    const { getItemAsync } = await import('expo-secure-store');
    return getItemAsync('last_synced_at');
  }

  test('not written when sync-status verification fails', async () => {
    mockFetch([
      capOk(),
      healthOk(),
      { ok: false, status: 500, json: () => Promise.resolve({ error: { code: 'EDGE_SERVER_ERROR', message: 'x' } }) },
    ]);
    await runSync();
    expect(await lastSynced()).toBeNull();
  });

  test('not written when the run stops on a network error', async () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'CREATE');
    let call = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      call++;
      if (call === 3) throw new Error('network down'); // createRecord
      const resp = call === 1 ? capOk() : call === 2 ? healthOk() : syncStatusEmpty();
      return { ok: true, status: 200, json: resp.json, headers: { get: () => null } } as unknown as Response;
    });
    await runSync();
    expect(await lastSynced()).toBeNull();
  });

  test('previous value is kept when a later run fails verification', async () => {
    const { setItemAsync } = await import('expo-secure-store');
    await setItemAsync('last_synced_at', '2026-10-01T09:00:00.000Z');
    mockFetch([capOk(), healthOk(), { ok: false, status: 500, json: () => Promise.resolve({}) }]);
    await runSync();
    expect(await lastSynced()).toBe('2026-10-01T09:00:00.000Z');
  });
});

describe('K6 — contract block and unmapped codes', () => {
  test('a fresh capabilities success clears a stored contract block', async () => {
    const { setItemAsync, getItemAsync } = await import('expo-secure-store');
    await setItemAsync('contract_block', JSON.stringify({ code: 'EDGE_CONTRACT_UNSUPPORTED', details: { direction: 'client_too_old' } }));
    mockFetch([capOk(), healthOk(), syncStatusEmpty()]);
    await runSync();
    expect(await getItemAsync('contract_block')).toBeNull();
  });

  test('a code outside the contract catalogue is logged as the "contract" category (C6.1)', async () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'CREATE');
    mockFetch([
      capOk(),
      healthOk(),
      { ok: false, status: 400, json: () => Promise.resolve({ error: { code: 'SOME_FUTURE_CODE', message: 'x' } }) },
      syncStatusEmpty(),
    ]);
    await runSync();
    const row = db.getFirstSync<{ metadata: string }>(`SELECT metadata FROM telemetry_events WHERE event_type = 'error'`);
    expect(JSON.parse(row!.metadata)).toEqual({ category: 'contract' });
  });
});

describe('K7 — 426 on a record call (checklist 6.3)', () => {
  const block426 = {
    ok: false, status: 426,
    json: () => Promise.resolve({ error: { code: 'EDGE_CONTRACT_UNSUPPORTED', message: 'x', details: { direction: 'client_too_old', supported_contract_versions: [2], client_contract_version: 1 } } }),
  };

  test('stops the run, keeps the change PENDING, rejects nothing, stores the banner block', async () => {
    const a = insertRecord({ edge_id: 'edge-426-a' });
    const b = insertRecord({ edge_id: 'edge-426-b' });
    insertDelta(a, 'CREATE');
    insertDelta(b, 'CREATE');
    mockFetch([capOk(), healthOk(), block426, syncStatusEmpty()]);
    await runSync();
    const rows = db.getAllSync<{ status: string }>(`SELECT status FROM delta_log ORDER BY seq`);
    expect(rows.map((r) => r.status)).toEqual(['PENDING', 'PENDING']);
    const { getItemAsync } = await import('expo-secure-store');
    expect(JSON.parse((await getItemAsync('contract_block'))!).details.direction).toBe('client_too_old');
    expect(await getItemAsync('last_synced_at')).toBeNull();
  });

  test('a later completed, verified run clears the block even with cached capabilities', async () => {
    const { setItemAsync, getItemAsync } = await import('expo-secure-store');
    await setItemAsync('capabilities_json', JSON.stringify({ contract_version: 1, supported_contract_versions: [1], attachments: {}, limits: {} }));
    await setItemAsync('capabilities_fetched_at', String(Date.now()));
    await setItemAsync('contract_block', JSON.stringify({ code: 'EDGE_CONTRACT_UNSUPPORTED', details: { direction: 'client_too_old' } }));
    mockFetch([healthOk(), syncStatusEmpty()]); // capabilities come from the cache
    await runSync();
    expect(await getItemAsync('contract_block')).toBeNull();
  });
});
