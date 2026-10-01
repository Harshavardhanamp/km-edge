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
  gks_record_id: string | null;
  gks_acknowledged_at: string | null;
  gks_error: string | null;
  retry_count: number;
}

export function getPendingDeltas(): DeltaEntry[] {
  return db.getAllSync<DeltaEntry>(
    `SELECT * FROM delta_log WHERE status = 'PENDING' ORDER BY seq ASC`
  );
}

export function markInFlight(seq: number): void {
  db.runSync(`UPDATE delta_log SET status = 'IN_FLIGHT' WHERE seq = ?`, seq);
}

export function acknowledgeDelta(seq: number, gks_record_id: string): void {
  db.runSync(
    `UPDATE delta_log SET status = 'ACKNOWLEDGED', gks_record_id = ?, gks_acknowledged_at = ?
     WHERE seq = ?`,
    gks_record_id,
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

export function resetInFlightToPending(): void {
  // Called on app start — any IN_FLIGHT from a crashed session becomes retryable
  db.runSync(`UPDATE delta_log SET status = 'PENDING' WHERE status = 'IN_FLIGHT'`);
}

export function resetDeltaToPending(seq: number): void {
  db.runSync(
    `UPDATE delta_log SET status = 'PENDING', gks_error = NULL WHERE seq = ?`,
    seq
  );
}

export function bumpRetry(seq: number): void {
  db.runSync(
    `UPDATE delta_log SET retry_count = COALESCE(retry_count, 0) + 1 WHERE seq = ?`,
    seq
  );
}
