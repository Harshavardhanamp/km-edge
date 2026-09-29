import { db } from './index';

export interface DeltaEntry {
  seq: number;
  edge_id: string;
  operation: string;
  record_type: string;
  capture_kind: string;
  timestamp: string;
  content_sha256: string | null;
  attachment_edge_ids: string;
  status: string;
  gks_id: string | null;
  gks_acknowledged_at: string | null;
  gks_error: string | null;
  retry_count: number;
}

export function getPendingDeltas(): DeltaEntry[] {
  return db.getAllSync<DeltaEntry>(
    `SELECT * FROM delta_log WHERE status = 'PENDING' ORDER BY seq ASC`
  );
}

export function acknowledgeDelta(seq: number, gks_id: string): void {
  db.runSync(
    `UPDATE delta_log SET status = 'ACKNOWLEDGED', gks_id = ?, gks_acknowledged_at = ?
     WHERE seq = ?`,
    gks_id,
    new Date().toISOString(),
    seq
  );
}

export function rejectDelta(seq: number, error: string): void {
  db.runSync(
    `UPDATE delta_log SET status = 'REJECTED', gks_error = ?, retry_count = retry_count + 1
     WHERE seq = ?`,
    error,
    seq
  );
}
