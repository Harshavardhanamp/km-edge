import { resetDb } from './helpers/setupDb';
import {
  blobPath,
  saveAttachment,
  linkAttachment,
  getAttachmentsForRecord,
  unlinkAttachment,
  purgeAttachment,
} from '../lib/db/attachmentStore';
import { createRecord } from '../lib/db/recordStore';
import { db } from '../lib/db/index';
import { __setFileExists, __reset as resetFs, documentDirectory } from 'expo-file-system/legacy';

function makeRecord(edge_id = 'rec-1') {
  return {
    edge_id,
    gks_id: null,
    schema_version: 1 as const,
    type: 'KNOWLEDGE' as const,
    capture_kind: 'NOTE' as const,
    title: 'Test',
    content: '',
    created: '2026-09-30',
    author: 'human' as const,
    classification: 'NORMAL' as const,
    importance: 'NORMAL' as const,
    tags: [],
    life_areas: [] as any,
    place: null,
    about: [],
    relationships: [],
    captured_at: '2026-09-30T10:00:00Z',
    sync_status: 'PENDING' as const,
    sync_error: null,
    content_sha256: 'sha-rec',
  };
}

function makeFile(overrides: Partial<{
  edge_attachment_id: string;
  sha256: string;
  original_filename: string;
}> = {}) {
  const sha256 = overrides.sha256 ?? 'deadbeef01234567';
  const source = `${documentDirectory}tmp/${sha256}`;
  __setFileExists(source, true);
  return {
    edge_attachment_id: overrides.edge_attachment_id ?? 'att-1',
    original_filename: overrides.original_filename ?? 'photo.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 1024,
    sha256,
    source_uri: source,
    captured_at: '2026-09-30T10:00:00Z',
  };
}

beforeEach(() => {
  resetDb();
  resetFs();
  createRecord(makeRecord());
});

describe('blobPath', () => {
  test('returns content-addressed path with first-2-char prefix', () => {
    expect(blobPath('deadbeef')).toBe('attachments/de/deadbeef');
  });
});

describe('saveAttachment', () => {
  test('saves attachment and returns edge_attachment_id', async () => {
    const file = makeFile();
    const id = await saveAttachment(file);
    expect(id).toBe('att-1');
    const row = db.getFirstSync<{ sha256: string }>(`SELECT sha256 FROM attachments WHERE edge_attachment_id = 'att-1'`);
    expect(row?.sha256).toBe(file.sha256);
  });

  test('deduplicates: same sha256 returns existing edge_attachment_id', async () => {
    const file = makeFile();
    await saveAttachment(file);
    const file2 = makeFile({ edge_attachment_id: 'att-2', sha256: file.sha256 });
    const id = await saveAttachment(file2);
    expect(id).toBe('att-1'); // returns the original
    const count = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM attachments`)!.n;
    expect(count).toBe(1); // only one row
  });

  test('blob_path is set to final content-addressed path after save', async () => {
    const file = makeFile();
    await saveAttachment(file);
    const row = db.getFirstSync<{ blob_path: string }>(
      `SELECT blob_path FROM attachments WHERE sha256 = ?`, file.sha256
    );
    expect(row?.blob_path).toBe(blobPath(file.sha256));
  });

  test('sync_status defaults to PENDING', async () => {
    await saveAttachment(makeFile());
    const row = db.getFirstSync<{ sync_status: string }>(
      `SELECT sync_status FROM attachments WHERE edge_attachment_id = 'att-1'`
    );
    expect(row?.sync_status).toBe('PENDING');
  });
});

describe('linkAttachment', () => {
  test('links attachment to record', async () => {
    await saveAttachment(makeFile());
    linkAttachment('rec-1', 'att-1');
    const atts = getAttachmentsForRecord('rec-1');
    expect(atts).toHaveLength(1);
    expect(atts[0].edge_attachment_id).toBe('att-1');
  });

  test('is idempotent (INSERT OR IGNORE)', async () => {
    await saveAttachment(makeFile());
    linkAttachment('rec-1', 'att-1');
    linkAttachment('rec-1', 'att-1');
    expect(getAttachmentsForRecord('rec-1')).toHaveLength(1);
  });
});

describe('getAttachmentsForRecord', () => {
  test('returns empty array when record has no attachments', () => {
    expect(getAttachmentsForRecord('rec-1')).toEqual([]);
  });

  test('returns only attachments for the requested record', async () => {
    createRecord(makeRecord('rec-2'));
    const f1 = makeFile({ edge_attachment_id: 'att-1', sha256: 'sha111' });
    const f2 = makeFile({ edge_attachment_id: 'att-2', sha256: 'sha222' });
    await saveAttachment(f1);
    await saveAttachment(f2);
    linkAttachment('rec-1', 'att-1');
    linkAttachment('rec-2', 'att-2');
    const atts = getAttachmentsForRecord('rec-1');
    expect(atts).toHaveLength(1);
    expect(atts[0].edge_attachment_id).toBe('att-1');
  });
});

describe('unlinkAttachment — live record (A4 fix)', () => {
  test('purges blob immediately when no DELETE delta exists (live record)', async () => {
    const file = makeFile();
    await saveAttachment(file);
    linkAttachment('rec-1', 'att-1');
    await unlinkAttachment('rec-1', 'att-1');
    // Blob purged: row should be gone from attachments
    const row = db.getFirstSync<{ edge_attachment_id: string }>(
      `SELECT edge_attachment_id FROM attachments WHERE edge_attachment_id = 'att-1'`
    );
    expect(row).toBeNull();
  });

  test('does not purge when another record still references the same blob', async () => {
    createRecord(makeRecord('rec-2'));
    const file = makeFile();
    await saveAttachment(file);
    linkAttachment('rec-1', 'att-1');
    linkAttachment('rec-2', 'att-1');
    await unlinkAttachment('rec-1', 'att-1');
    // rec-2 still references it — blob must survive
    const row = db.getFirstSync<{ edge_attachment_id: string }>(
      `SELECT edge_attachment_id FROM attachments WHERE edge_attachment_id = 'att-1'`
    );
    expect(row).not.toBeNull();
  });

  test('defers purge when parent record has a DELETE delta (A4 fix)', async () => {
    const file = makeFile();
    await saveAttachment(file);
    linkAttachment('rec-1', 'att-1');
    // Simulate a DELETE delta existing for rec-1
    db.runSync(
      `INSERT INTO delta_log (edge_id, operation, record_type, capture_kind, timestamp, status)
       VALUES ('rec-1', 'DELETE', 'KNOWLEDGE', 'NOTE', '2026-09-30T10:00:00Z', 'PENDING')`
    );
    await unlinkAttachment('rec-1', 'att-1');
    // Blob should be deferred (pending_delete=1), not purged
    const row = db.getFirstSync<{ pending_delete: number }>(
      `SELECT pending_delete FROM attachments WHERE edge_attachment_id = 'att-1'`
    );
    expect(row?.pending_delete).toBe(1);
  });
});

describe('purgeAttachment', () => {
  test('removes row from attachments table', async () => {
    await saveAttachment(makeFile());
    await purgeAttachment('att-1');
    const row = db.getFirstSync<{ edge_attachment_id: string }>(
      `SELECT edge_attachment_id FROM attachments WHERE edge_attachment_id = 'att-1'`
    );
    expect(row).toBeNull();
  });
});
