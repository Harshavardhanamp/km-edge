import * as FileSystem from 'expo-file-system/legacy';
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
  // Deduplication: if sha256 already exists, skip INSERT
  const existing = db.getFirstSync<{ edge_attachment_id: string }>(
    `SELECT edge_attachment_id FROM attachments WHERE sha256 = ?`,
    file.sha256
  );

  if (existing) {
    return existing.edge_attachment_id;
  }

  // Step 4: copy blob to staging first
  const stagingDir = `${FileSystem.documentDirectory}attachments/staging/`;
  const stagingPath = `attachments/staging/${file.sha256}`;
  const stagingFullPath = `${FileSystem.documentDirectory}${stagingPath}`;

  const stagingDirInfo = await FileSystem.getInfoAsync(stagingDir);
  if (!stagingDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true });
  }
  await FileSystem.copyAsync({ from: file.source_uri, to: stagingFullPath });

  // Step 5: DB transaction — INSERT with staging blob_path
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO attachments (
        edge_attachment_id, sha256, original_filename, mime_type,
        size_bytes, blob_path, captured_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      file.edge_attachment_id,
      file.sha256,
      file.original_filename,
      file.mime_type,
      file.size_bytes,
      stagingPath,
      file.captured_at
    );
  });

  // Step 6: move from staging to final path
  const finalRelPath = blobPath(file.sha256);
  const finalFullPath = `${FileSystem.documentDirectory}${finalRelPath}`;
  const finalDir = `${FileSystem.documentDirectory}attachments/${file.sha256.slice(0, 2)}/`;

  const finalDirInfo = await FileSystem.getInfoAsync(finalDir);
  if (!finalDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(finalDir, { intermediates: true });
  }
  await FileSystem.moveAsync({ from: stagingFullPath, to: finalFullPath });

  // Step 7: update blob_path to final path
  db.runSync(
    `UPDATE attachments SET blob_path = ? WHERE sha256 = ?`,
    finalRelPath,
    file.sha256
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

  if (!refCount || refCount.n > 0) return;

  // A4 fix: only defer purge if the parent record is being deleted (DELETE delta exists).
  // Removing an attachment from a live record has no DELETE delta to wait for —
  // purge the blob immediately once the ref count hits zero.
  const deleteDelta = db.getFirstSync<{ seq: number }>(
    `SELECT seq FROM delta_log
     WHERE edge_id = ? AND operation = 'DELETE'
     ORDER BY seq DESC LIMIT 1`,
    edge_id
  );

  if (deleteDelta) {
    db.runSync(
      `UPDATE attachments
       SET pending_delete = 1, delete_delta_seq = ?
       WHERE edge_attachment_id = ?`,
      deleteDelta.seq,
      edge_attachment_id
    );
  } else {
    // Live record — purge blob now, no GKS ack to wait for
    await purgeAttachment(edge_attachment_id);
  }
}

// Called by sync engine after GKS acknowledges delete — physically removes blob
export async function purgeAttachment(edge_attachment_id: string): Promise<void> {
  const row = db.getFirstSync<{ blob_path: string }>(
    `SELECT blob_path FROM attachments WHERE edge_attachment_id = ?`,
    edge_attachment_id
  );
  db.runSync(`DELETE FROM attachments WHERE edge_attachment_id = ?`, edge_attachment_id);
  if (row) {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${row.blob_path}`, { idempotent: true });
  }
}

// Called on startup to recover from crashes mid-saveAttachment.
// Orphan staging files (no DB row) are deleted; staging files with a DB row
// pointing to staging are moved to their final path; staging leftovers where
// the DB already points to final are deleted.
export async function cleanStagingDirectory(): Promise<void> {
  const stagingDir = `${FileSystem.documentDirectory}attachments/staging/`;
  const dirInfo = await FileSystem.getInfoAsync(stagingDir);
  if (!dirInfo.exists) return;

  const files = await FileSystem.readDirectoryAsync(stagingDir);

  for (const filename of files) {
    const stagingPath = `attachments/staging/${filename}`;
    const fullStagingPath = `${FileSystem.documentDirectory}${stagingPath}`;

    // filename is the sha256
    const row = db.getFirstSync<{ blob_path: string }>(
      `SELECT blob_path FROM attachments WHERE sha256 = ?`,
      filename
    );

    if (!row) {
      // Orphan staging file — no DB row, safe to delete
      await FileSystem.deleteAsync(fullStagingPath, { idempotent: true });
      continue;
    }

    const isStaging = row.blob_path.includes('/staging/');
    if (isStaging) {
      // DB row points to staging — move to final path
      const xx = filename.slice(0, 2);
      const finalRelPath = `attachments/${xx}/${filename}`;
      const finalFullPath = `${FileSystem.documentDirectory}${finalRelPath}`;
      const finalDir = `${FileSystem.documentDirectory}attachments/${xx}/`;

      const finalDirInfo = await FileSystem.getInfoAsync(finalDir);
      if (!finalDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(finalDir, { intermediates: true });
      }

      await FileSystem.moveAsync({ from: fullStagingPath, to: finalFullPath });
      db.runSync(
        `UPDATE attachments SET blob_path = ? WHERE sha256 = ?`,
        finalRelPath,
        filename
      );
    } else {
      // DB row points to final path — staging copy is leftover, delete it
      await FileSystem.deleteAsync(fullStagingPath, { idempotent: true });
    }
  }
}
