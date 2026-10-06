/**
 * Plain-word sync status for StatusDetailScreen and the Home banner (REQ-0013 C6, design §8).
 * Pure DB/JSON reads so the wording is testable without rendering.
 */
import { db } from '../db/index';
import { mapError } from '../errors/edgeErrorMap';

export interface AttentionItem {
  key: string;
  title: string;
  sentence: string;
  /** Delta seq to reset on Retry; set only when the code is retryable (C6.1). */
  retrySeq: number | null;
}

export interface StatusSummary {
  /** Records with a change not yet accepted by Kashyap's Knowledge. */
  waiting: number;
  /** Records Kashyap's Knowledge holds (local count; the screen prefers the server's count when known). */
  synced: number;
  attention: AttentionItem[];
}

function sentenceFor(code: string | null): string {
  // Silent codes (empty sentence) never end REJECTED, but never show a blank line if one does.
  return mapError(code ?? '').sentence || mapError('').sentence;
}

export function loadStatusSummary(): StatusSummary {
  const waiting = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(DISTINCT edge_id) AS n FROM delta_log WHERE status IN ('PENDING', 'IN_FLIGHT')`
  )?.n ?? 0;

  const synced = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM records WHERE gks_id IS NOT NULL AND is_deleted = 0`
  )?.n ?? 0;

  type RejectedRow = { seq: number; title: string; gks_error: string | null };
  type FailedFileRow = { edge_attachment_id: string; original_filename: string; sync_error: string | null };

  // A rejection stops needing attention once a later change for the same record exists (e.g. after Edit).
  const rejected = db.getAllSync<RejectedRow>(
    `SELECT d.seq, r.title, d.gks_error
     FROM delta_log d
     JOIN records r ON r.edge_id = d.edge_id
     WHERE d.status = 'REJECTED'
       AND NOT EXISTS (SELECT 1 FROM delta_log d2 WHERE d2.edge_id = d.edge_id AND d2.seq > d.seq)
     ORDER BY d.seq ASC`
  );

  const failedFiles = db.getAllSync<FailedFileRow>(
    `SELECT DISTINCT a.edge_attachment_id, a.original_filename, a.sync_error
     FROM attachments a
     JOIN record_attachments ra ON ra.edge_attachment_id = a.edge_attachment_id
     WHERE a.sync_status = 'FAILED'
     ORDER BY a.edge_attachment_id ASC`
  );

  const attention: AttentionItem[] = [
    ...rejected.map((d: RejectedRow) => ({
      key: `delta-${d.seq}`,
      title: d.title,
      sentence: sentenceFor(d.gks_error),
      retrySeq: mapError(d.gks_error ?? '').retryable ? d.seq : null,
    })),
    ...failedFiles.map((a: FailedFileRow) => ({
      key: `file-${a.edge_attachment_id}`,
      title: a.original_filename,
      sentence: sentenceFor(a.sync_error),
      retrySeq: null, // file problems are fixed by removing the file
    })),
  ];

  return { waiting, synced, attention };
}

/** Manual Retry: a fresh three-attempt window (v2-sync-status.md §8). */
export function retryDelta(seq: number): void {
  db.runSync(
    `UPDATE delta_log SET status = 'PENDING', retry_count = 0, gks_error = NULL WHERE seq = ? AND status = 'REJECTED'`,
    seq
  );
}

/**
 * Home banner text for a stored CONTRACT_BLOCK (C6.4), or null when syncing is not blocked.
 * details.direction is client_too_old | server_too_old (contract §8).
 */
export function contractBanner(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let direction: unknown;
  try {
    const block = JSON.parse(raw);
    direction = block?.details?.direction ?? block?.error?.details?.direction;
  } catch {
    // unreadable block: still blocked, assume this app is the older side
  }
  return direction === 'server_too_old'
    ? 'Ask your administrator to update Kashyap’s Knowledge.'
    : 'Update KM-Edge to keep syncing.';
}
