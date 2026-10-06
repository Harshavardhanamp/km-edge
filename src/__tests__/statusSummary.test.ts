/**
 * K6 — status wording (REQ-0013 C6.1/C6.3), Home banner (C6.4), How syncing works (C8).
 * Wording is driven by the error codes in the pinned GKS fixtures.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resetDb } from './helpers/setupDb';
import { db } from '../lib/db/index';
import { loadStatusSummary, retryDelta, contractBanner } from '../lib/sync/statusSummary';
import { mapError } from '../lib/errors/edgeErrorMap';
import { HOW_SYNCING_PARAGRAPHS } from '../lib/help/howSyncing';

const FIXTURE_DIR = path.join(__dirname, '../test/fixtures/edge-sync/v1');
const FALLBACK = 'This record couldn’t be sent. Contact your administrator.';

/** Record/attachment rejection codes found in the fixtures (auth/contract codes never land on a record). */
function fixtureRejectionCodes(): string[] {
  const codes = new Set<string>();
  for (const dir of ['records', 'attachments']) {
    for (const f of fs.readdirSync(path.join(FIXTURE_DIR, dir))) {
      const body = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, dir, f), 'utf8'))?.response?.body;
      // Data routes answer flat { code }; gate errors use { error: { code } } (contract §0 amendment).
      const code = body?.error?.code ?? body?.code;
      if (code) codes.add(code);
    }
  }
  return [...codes].sort();
}

let n = 0;
function insertRecord(overrides: { gks_id?: string | null; title?: string; is_deleted?: number } = {}): string {
  const edge_id = `edge-${++n}`;
  db.runSync(
    `INSERT INTO records (
      edge_id, gks_id, schema_version, type, capture_kind, title, content,
      created, author, classification, importance, tags, life_areas, place,
      about, relationships, captured_at, sync_status, content_sha256, is_deleted
    ) VALUES (?, ?, 1, 'KNOWLEDGE', 'JOURNAL', ?, 'C', '2026-10-01', 'human', 'NORMAL', 'NORMAL',
      '[]', '[]', NULL, '[]', '[]', '2026-10-01T10:00:00Z', 'PENDING', 'sha', ?)`,
    edge_id, overrides.gks_id ?? null, overrides.title ?? `Record ${n}`, overrides.is_deleted ?? 0
  );
  return edge_id;
}

function insertDelta(edge_id: string, status: string, gks_error: string | null = null): number {
  db.runSync(
    `INSERT INTO delta_log (edge_id, operation, record_type, capture_kind, timestamp, status, gks_error)
     VALUES (?, 'CREATE', 'KNOWLEDGE', 'JOURNAL', '2026-10-01T10:00:00Z', ?, ?)`,
    edge_id, status, gks_error
  );
  return db.getFirstSync<{ seq: number }>(`SELECT last_insert_rowid() AS seq`)!.seq;
}

function insertFailedFile(edge_id: string, filename: string, code: string) {
  const id = `att-${++n}`;
  db.runSync(
    `INSERT INTO attachments (edge_attachment_id, sha256, original_filename, mime_type, size_bytes, blob_path, captured_at, sync_status, sync_error)
     VALUES (?, ?, ?, 'application/octet-stream', 1, ?, '2026-10-01T10:00:00Z', 'FAILED', ?)`,
    id, `sha-${id}`, filename, `attachments/${id}`, code
  );
  db.runSync(`INSERT INTO record_attachments (edge_id, edge_attachment_id) VALUES (?, ?)`, edge_id, id);
}

beforeEach(() => resetDb());

describe('Needs attention — wording from fixture codes', () => {
  test('the fixtures supply rejection codes', () => {
    expect(fixtureRejectionCodes()).toEqual(expect.arrayContaining(['EDGE_CONTENT_TOO_LONG', 'EDGE_RECORD_DELETED', 'EDGE_TYPE_LOCKED']));
  });

  test.each(fixtureRejectionCodes())('%s → mapped sentence, never the code; Retry only when retryable', (code) => {
    const seq = insertDelta(insertRecord({ title: 'Trip notes' }), 'REJECTED', code);
    const [item] = loadStatusSummary().attention;
    expect(item.title).toBe('Trip notes');
    expect(item.sentence).toBe(mapError(code).sentence);
    expect(item.sentence.length).toBeGreaterThan(0);
    expect(item.sentence).not.toContain(code);
    expect(item.retrySeq).toBe(mapError(code).retryable ? seq : null);
  });

  test('checksum mismatch is the retryable case; type locked is not', () => {
    const a = insertDelta(insertRecord(), 'REJECTED', 'EDGE_CHECKSUM_MISMATCH');
    insertDelta(insertRecord(), 'REJECTED', 'EDGE_TYPE_LOCKED');
    const items = loadStatusSummary().attention;
    expect(items.map((i) => i.retrySeq)).toEqual([a, null]);
  });

  test('unmapped or missing code → C6.1 fallback sentence, no Retry', () => {
    insertDelta(insertRecord(), 'REJECTED', 'SOME_FUTURE_CODE');
    insertDelta(insertRecord(), 'REJECTED', null);
    for (const item of loadStatusSummary().attention) {
      expect(item.sentence).toBe(FALLBACK);
      expect(item.retrySeq).toBeNull();
    }
  });

  test('a rejection is no longer listed once a later change for that record exists', () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'REJECTED', 'EDGE_CONTENT_TOO_LONG');
    expect(loadStatusSummary().attention).toHaveLength(1);
    insertDelta(edge_id, 'PENDING'); // the user edited the record
    expect(loadStatusSummary().attention).toHaveLength(0);
  });

  test('failed files are listed by file name with the mapped sentence, no Retry', () => {
    insertFailedFile(insertRecord(), 'scan.heic', 'EDGE_FILE_TOO_LARGE');
    const [item] = loadStatusSummary().attention;
    expect(item).toMatchObject({ title: 'scan.heic', sentence: 'This file is too large to sync.', retrySeq: null });
  });

  test('a file linked to two records is listed once', () => {
    const a = insertRecord();
    insertFailedFile(a, 'shared.pdf', 'EDGE_FILE_TOO_LARGE');
    const id = db.getFirstSync<{ edge_attachment_id: string }>(`SELECT edge_attachment_id FROM attachments`)!.edge_attachment_id;
    db.runSync(`INSERT INTO record_attachments (edge_id, edge_attachment_id) VALUES (?, ?)`, insertRecord(), id);
    expect(loadStatusSummary().attention).toHaveLength(1);
  });
});

describe('Needs attention — one action per item (checklist 6.4)', () => {
  test('too long → Edit opens the record', () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'REJECTED', 'EDGE_CONTENT_TOO_LONG');
    expect(loadStatusSummary().attention[0]).toMatchObject({ openLabel: 'Edit', edgeId: edge_id, retrySeq: null });
  });

  test('type locked → Open record (change the type back there)', () => {
    const edge_id = insertRecord();
    insertDelta(edge_id, 'REJECTED', 'EDGE_TYPE_LOCKED');
    expect(loadStatusSummary().attention[0]).toMatchObject({ openLabel: 'Open record', edgeId: edge_id });
  });

  test('file problem → Open record on the record carrying the file', () => {
    const edge_id = insertRecord();
    insertFailedFile(edge_id, 'virus.exe', 'EDGE_FILE_TYPE_NOT_SUPPORTED');
    expect(loadStatusSummary().attention[0]).toMatchObject({ openLabel: 'Open record', edgeId: edge_id });
  });

  test('retryable → Retry only; nothing-to-do codes → no button', () => {
    insertDelta(insertRecord(), 'REJECTED', 'EDGE_CHECKSUM_MISMATCH');
    insertDelta(insertRecord(), 'REJECTED', 'EDGE_VALIDATION');
    const [retry, none] = loadStatusSummary().attention;
    expect(retry).toMatchObject({ openLabel: null });
    expect(retry.retrySeq).not.toBeNull();
    expect(none).toMatchObject({ openLabel: null, retrySeq: null });
  });

  test('removed on desktop → no action (the record is hidden on the phone)', () => {
    insertDelta(insertRecord({ is_deleted: 1 }), 'REJECTED', 'EDGE_RECORD_DELETED');
    expect(loadStatusSummary().attention[0]).toMatchObject({ openLabel: null, edgeId: null, retrySeq: null });
  });
});

describe('Waiting to sync / Synced counts', () => {
  test('waiting counts records (not deltas) with PENDING or IN_FLIGHT changes', () => {
    const a = insertRecord();
    insertDelta(a, 'PENDING');
    insertDelta(a, 'PENDING');
    insertDelta(insertRecord(), 'IN_FLIGHT');
    insertDelta(insertRecord(), 'ACKNOWLEDGED');
    insertDelta(insertRecord(), 'REJECTED', 'EDGE_TYPE_LOCKED');
    expect(loadStatusSummary().waiting).toBe(2);
  });

  test('synced counts live records Kashyap’s Knowledge holds', () => {
    insertRecord({ gks_id: 'GKS-1' });
    insertRecord({ gks_id: 'GKS-2' });
    insertRecord({ gks_id: 'GKS-3', is_deleted: 1 });
    insertRecord();
    expect(loadStatusSummary().synced).toBe(2);
  });

  test('empty phone → nothing waiting, nothing needs attention', () => {
    expect(loadStatusSummary()).toEqual({ waiting: 0, synced: 0, attention: [] });
  });
});

describe('retryDelta', () => {
  test('resets a rejected delta to PENDING with a fresh retry window', () => {
    const seq = insertDelta(insertRecord(), 'REJECTED', 'EDGE_CHECKSUM_MISMATCH');
    db.runSync(`UPDATE delta_log SET retry_count = 3 WHERE seq = ?`, seq);
    retryDelta(seq);
    expect(db.getFirstSync(`SELECT status, retry_count, gks_error FROM delta_log WHERE seq = ?`, seq))
      .toEqual({ status: 'PENDING', retry_count: 0, gks_error: null });
  });

  test('never touches an acknowledged delta', () => {
    const seq = insertDelta(insertRecord(), 'ACKNOWLEDGED');
    retryDelta(seq);
    expect(db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE seq = ?`, seq)!.status).toBe('ACKNOWLEDGED');
  });
});

describe('contractBanner (Home)', () => {
  const UPDATE_APP = 'Update KM-Edge to keep syncing.';
  const ASK_ADMIN = 'Ask your administrator to update Kashyap’s Knowledge.';
  const block = (direction?: string) => JSON.stringify({ code: 'EDGE_CONTRACT_UNSUPPORTED', message: 'x', details: direction ? { direction } : {} });

  test('no block → no banner', () => {
    expect(contractBanner(null)).toBeNull();
    expect(contractBanner('')).toBeNull();
  });

  test('phone is older → update the app', () => {
    expect(contractBanner(block('client_too_old'))).toBe(UPDATE_APP);
  });

  test('server is older → ask the administrator', () => {
    expect(contractBanner(block('server_too_old'))).toBe(ASK_ADMIN);
  });

  test('the fixture 426 (version 99, server older) as stored by gksClient → ask the administrator', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'errors/contract-unsupported.json'), 'utf8'));
    expect(contractBanner(JSON.stringify(fixture.response.body.error))).toBe(ASK_ADMIN); // edgeFetchInternal stores body.error
    expect(contractBanner(JSON.stringify(fixture.response.body))).toBe(ASK_ADMIN);
  });

  test('no direction or an unreadable block still shows a banner', () => {
    expect(contractBanner(block())).toBe(UPDATE_APP);
    expect(contractBanner('{not json')).toBe(UPDATE_APP);
  });
});

describe('How syncing works (C8)', () => {
  const text = HOW_SYNCING_PARAGRAPHS.join(' ');
  test.each([
    ['records stay on the phone until synced', /stay on this phone until/],
    ['Kashyap’s Knowledge is the copy that matters', /copy that matters/],
    ['unsynced records are lost with the phone', /lost or the app is reinstalled.*lost/],
    ['administrator resolves tags, places and dates', /administrator.*tags, places and dates/],
    ['type changes on desktop after sync', /type can only be changed on the desktop/],
  ])('says %s', (_label, pattern) => {
    expect(text).toMatch(pattern);
  });

  test('plain words — no contract codes', () => {
    expect(text).not.toMatch(/EDGE_|delta|gks_id/i);
  });
});
