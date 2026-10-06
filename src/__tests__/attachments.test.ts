/**
 * K5 — attachment upload (contract §6) and capabilities-driven validation.
 * uploadAsync is driven through the expo-file-system mock; fetch is routed by URL.
 */
import { resetDb } from './helpers/setupDb';
import { db } from '../lib/db/index';
import { uploadAttachment } from '../lib/gksClient';
import { runSync } from '../lib/sync/syncEngine';
import { validateFile, validateRecordLimits } from '../lib/attachments/validate';
import { __reset as resetSecureStore, setItemAsync } from 'expo-secure-store';
import { __reset as resetFs, __setUpload, __setFileExists, __setFileBase64 } from 'expo-file-system/legacy';
import { createHash } from 'crypto';
import { __setConnected } from 'expo-network';

const BASE = 'http://gks.test';
const SHA = 'a'.repeat(64);
const MB = 1024 * 1024;

function upload(status: number, body: unknown) {
  const calls: Array<{ url: string; uri: string; opts: any }> = [];
  __setUpload(async (url, uri, opts) => {
    calls.push({ url, uri, opts });
    return { status, body: JSON.stringify(body) };
  });
  return calls;
}

function accepted(state = 'ACCEPTED') {
  return { contract_version: 1, state, edge_id: 'edge-1', gks_id: 'GKS-1', edge_attachment_id: 'att-1', gks_attachment_id: 'GA-1', sha256: SHA, size_bytes: 4, scan_status: 'CLEAN' };
}

function edgeError(code: string) {
  return { error: { code, message: code } };
}

const ATT = { edge_attachment_id: 'att-1', sha256: SHA, original_filename: 'photo.jpg', mime_type: 'image/jpeg', fileUri: '/mock-docs/attachments/att-1.jpg' };

beforeEach(async () => {
  resetDb();
  resetSecureStore();
  resetFs();
  __setConnected(true);
  await setItemAsync('gks_server_url', BASE);
  await setItemAsync('edge_token', 'tok-test');
  await setItemAsync('device_id', 'dev-001');
  jest.restoreAllMocks();
});

afterEach(() => jest.restoreAllMocks());

describe('uploadAttachment — one multipart call stores and binds', () => {
  test('201 ACCEPTED → ok with scan_status; contract parts and URL', async () => {
    const calls = upload(201, accepted());
    const res = await uploadAttachment(BASE, 'edge-1', ATT);
    expect(res.ok).toBe(true);
    expect((res as any).body.scan_status).toBe('CLEAN');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/v1/edge/records/edge-1/attachments`);
    expect(calls[0].opts.fieldName).toBe('file');
    expect(calls[0].opts.parameters).toEqual({ edge_attachment_id: 'att-1', sha256: SHA, original_filename: 'photo.jpg', mime_type: 'image/jpeg' });
  });

  test('multipart request carries bearer + contract headers but no JSON Content-Type', async () => {
    const calls = upload(201, accepted());
    await uploadAttachment(BASE, 'edge-1', ATT);
    const h = calls[0].opts.headers;
    expect(h['Authorization']).toBe('Bearer tok-test');
    expect(h['X-Edge-Contract-Version']).toBe('1');
    expect(h['X-Edge-Device-Id']).toBe('dev-001');
    expect(h['Content-Type']).toBeUndefined();
  });

  test('replay → 200 ALREADY_SYNCED is ok', async () => {
    upload(200, accepted('ALREADY_SYNCED'));
    const res = await uploadAttachment(BASE, 'edge-1', ATT);
    expect(res.ok).toBe(true);
    expect((res as any).body.state).toBe('ALREADY_SYNCED');
  });

  test.each([
    [400, 'EDGE_FILE_TYPE_NOT_SUPPORTED'],
    [400, 'EDGE_CHECKSUM_MISMATCH'],
    [413, 'EDGE_FILE_TOO_LARGE'],
    [409, 'EDGE_RECORD_ATTACHMENT_LIMIT'],
  ])('%i %s → error with the contract code', async (status, code) => {
    upload(status, edgeError(code));
    const res = await uploadAttachment(BASE, 'edge-1', ATT);
    expect(res.ok).toBe(false);
    expect((res as any).error).toMatchObject({ code, status });
  });

  test('non-JSON 5xx → EDGE_SERVER_ERROR', async () => {
    __setUpload(async () => ({ status: 502, body: '<html>bad gateway</html>' }));
    const res = await uploadAttachment(BASE, 'edge-1', ATT);
    expect((res as any).error.code).toBe('EDGE_SERVER_ERROR');
  });

  test('network failure → { network: true }', async () => {
    __setUpload(async () => { throw new Error('offline'); });
    expect(await uploadAttachment(BASE, 'edge-1', ATT)).toEqual({ ok: false, network: true });
  });
});

// ---- runSync: row state after upload ---------------------------------------

function insertSyncedRecordWithAttachment() {
  db.runSync(
    `INSERT INTO records (
      edge_id, gks_id, schema_version, type, capture_kind, title, content,
      created, author, classification, importance, tags, life_areas, place,
      about, relationships, captured_at, sync_status, content_sha256, synced_content_sha256, is_deleted
    ) VALUES ('edge-1', 'GKS-1', 1, 'KNOWLEDGE', 'JOURNAL', 'T', 'C', '2026-10-01', 'human', 'NORMAL', 'NORMAL',
      '[]', '[]', NULL, '[]', '[]', '2026-10-01T10:00:00Z', 'SYNCED', 'sha-c', 'sha-c', 0)`
  );
  db.runSync(
    `INSERT INTO attachments (edge_attachment_id, sha256, original_filename, mime_type, size_bytes, blob_path, captured_at)
     VALUES ('att-1', ?, 'photo.jpg', 'image/jpeg', 4, 'attachments/att-1.jpg', '2026-10-01T10:00:00Z')`,
    SHA
  );
  db.runSync(`INSERT INTO record_attachments (edge_id, edge_attachment_id) VALUES ('edge-1', 'att-1')`);
  __setFileExists('/mock-docs/attachments/att-1.jpg', true);
}

function routeFetch() {
  return jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const u = String(url);
    const body = u.includes('/capabilities')
      ? { contract_version: 1, supported_contract_versions: [1], attachments: {}, limits: {} }
      : u.includes('/sync-status') ? { records: [], synced_record_count: 1 } : {};
    return { ok: true, status: 200, json: () => Promise.resolve(body), headers: { get: () => null } } as unknown as Response;
  });
}

function attachmentRow() {
  return db.getFirstSync<{ sync_status: string; sync_error: string | null; gks_attachment_id: string | null; scan_status: string | null }>(
    `SELECT sync_status, sync_error, gks_attachment_id, scan_status FROM attachments WHERE edge_attachment_id = 'att-1'`
  );
}

describe('runSync — attachment rows', () => {
  test('migration 005 adds attachments.scan_status', () => {
    const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(attachments)`).map((r) => r.name);
    expect(cols).toContain('scan_status');
  });

  test('accepted upload → SYNCED with gks id and scan_status', async () => {
    insertSyncedRecordWithAttachment();
    routeFetch();
    upload(201, accepted());
    await runSync();
    expect(attachmentRow()).toEqual({ sync_status: 'SYNCED', sync_error: null, gks_attachment_id: 'GA-1', scan_status: 'CLEAN' });
  });

  test('checksum mismatch → FAILED with the contract code', async () => {
    insertSyncedRecordWithAttachment();
    routeFetch();
    upload(400, edgeError('EDGE_CHECKSUM_MISMATCH'));
    await runSync();
    expect(attachmentRow()).toMatchObject({ sync_status: 'FAILED', sync_error: 'EDGE_CHECKSUM_MISMATCH', gks_attachment_id: null });
  });

  test('retryable server error → stays PENDING', async () => {
    insertSyncedRecordWithAttachment();
    routeFetch();
    upload(500, edgeError('EDGE_SERVER_ERROR'));
    await runSync();
    expect(attachmentRow()).toMatchObject({ sync_status: 'PENDING', sync_error: null });
  });

  test('upload sends the raw-bytes hash and corrects a V1 base64-text hash on the row', async () => {
    insertSyncedRecordWithAttachment(); // row carries a V1-style hash ('a' × 64)
    const bytes = Buffer.from('ffd8ffe04b4d2d456467652050362066697874757265206a70656720626f6479', 'hex');
    __setFileBase64('/mock-docs/attachments/att-1.jpg', bytes.toString('base64'));
    const raw = createHash('sha256').update(bytes).digest('hex');
    routeFetch();
    const calls = upload(201, accepted());
    await runSync();
    expect(calls[0].opts.parameters.sha256).toBe(raw);
    expect(db.getFirstSync<{ sha256: string }>(`SELECT sha256 FROM attachments WHERE edge_attachment_id = 'att-1'`)!.sha256).toBe(raw);
  });

  test('network failure → stays PENDING', async () => {
    insertSyncedRecordWithAttachment();
    routeFetch();
    __setUpload(async () => { throw new Error('offline'); });
    await runSync();
    expect(attachmentRow()).toMatchObject({ sync_status: 'PENDING', gks_attachment_id: null });
  });
});

// ---- capabilities-driven validation ----------------------------------------

describe('validate — server limits from capabilities.attachments', () => {
  test('server extension list replaces the default list', () => {
    const limits = { allowed_extensions: ['pdf'] };
    expect(validateFile({ name: 'a.pdf', size: 1 }, limits).ok).toBe(true);
    expect(validateFile({ name: 'a.jpg', size: 1 }, limits).ok).toBe(false);
  });

  test('server per-file limit applies and is named in the message', () => {
    const res = validateFile({ name: 'a.pdf', size: 3 * MB }, { max_file_bytes: 2 * MB });
    expect(res.ok).toBe(false);
    expect((res as any).reason).toContain('2MB');
  });

  test('server count and total limits apply', () => {
    expect(validateRecordLimits(3, 0, 1, { max_files_per_record: 3 }).ok).toBe(false);
    expect(validateRecordLimits(0, 4 * MB, 2 * MB, { max_record_total_bytes: 5 * MB }).ok).toBe(false);
  });

  test('empty list / zero limits mean "not provided" — defaults apply', () => {
    const blank = { allowed_extensions: [], max_file_bytes: 0, max_record_total_bytes: 0, max_files_per_record: 0 };
    expect(validateFile({ name: 'a.jpg', size: 1 }, blank).ok).toBe(true);
    expect(validateRecordLimits(9, 0, 1, blank).ok).toBe(true);
    expect(validateRecordLimits(10, 0, 1, blank).ok).toBe(false);
  });
});
