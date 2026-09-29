import * as FileSystem from 'expo-file-system';
import { db } from './index';

export interface AttachmentMeta {
  edge_attachment_id: string;
  sha256: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  captured_at: string;
  gks_attachment_id: string | null;
}

type AttachmentRow = AttachmentMeta & { blob_path: string };

export function blobPath(sha256: string): string {
  return `attachments/${sha256.slice(0, 2)}/${sha256}`;
}

export async function saveAttachment(file: {
  edge_attachment_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  source_uri: string;
  captured_at: string;
}): Promise<string> {
  const existing = db.getFirstSync<{ edge_attachment_id: string }>(
    `SELECT edge_attachment_id FROM attachments WHERE sha256 = ?`,
    file.sha256
  );

  if (existing) {
    return existing.edge_attachment_id;
  }

  const relative = blobPath(file.sha256);
  const dest = `${FileSystem.documentDirectory}${relative}`;

  const dir = dest.substring(0, dest.lastIndexOf('/'));
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.copyAsync({ from: file.source_uri, to: dest });

  db.runSync(
    `INSERT INTO attachments (
      edge_attachment_id, sha256, original_filename, mime_type,
      size_bytes, blob_path, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    file.edge_attachment_id,
    file.sha256,
    file.original_filename,
    file.mime_type,
    file.size_bytes,
    relative,
    file.captured_at
  );

  return file.edge_attachment_id;
}

export function linkAttachment(edge_id: string, edge_attachment_id: string): void {
  db.runSync(
    `INSERT OR IGNORE INTO record_attachments (edge_id, edge_attachment_id) VALUES (?, ?)`,
    edge_id,
    edge_attachment_id
  );
}

export function getAttachmentsForRecord(edge_id: string): AttachmentMeta[] {
  const rows = db.getAllSync<AttachmentRow>(
    `SELECT a.edge_attachment_id, a.sha256, a.original_filename, a.mime_type,
            a.size_bytes, a.captured_at, a.gks_attachment_id
     FROM attachments a
     JOIN record_attachments ra ON ra.edge_attachment_id = a.edge_attachment_id
     WHERE ra.edge_id = ?`,
    edge_id
  );
  return rows.map(({ blob_path: _bp, ...meta }) => meta);
}

export async function unlinkAttachment(
  edge_id: string,
  edge_attachment_id: string
): Promise<void> {
  db.runSync(
    `DELETE FROM record_attachments WHERE edge_id = ? AND edge_attachment_id = ?`,
    edge_id,
    edge_attachment_id
  );

  const refCount = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM record_attachments WHERE edge_attachment_id = ?`,
    edge_attachment_id
  );

  if (refCount && refCount.n === 0) {
    const row = db.getFirstSync<{ blob_path: string }>(
      `SELECT blob_path FROM attachments WHERE edge_attachment_id = ?`,
      edge_attachment_id
    );

    db.runSync(
      `DELETE FROM attachments WHERE edge_attachment_id = ?`,
      edge_attachment_id
    );

    if (row) {
      const fullPath = `${FileSystem.documentDirectory}${row.blob_path}`;
      await FileSystem.deleteAsync(fullPath, { idempotent: true });
    }
  }
}
