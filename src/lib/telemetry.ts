/**
 * Device sync-health telemetry (REQ-0013 ES9.1, design §6, GKS contract §7).
 *
 * Fixed vocabulary only: sync_run, error, capture_count. No user/session/record
 * ids, no screens, no free text — identity is derived by GKS from the bearer
 * session. Rows are queued in telemetry_events and sent by flushTelemetry.
 */
import { db } from './db/index';
import { EDGE_ERROR_CATALOGUE } from './contract';

export type SyncRunResult = 'completed' | 'aborted_network' | 'aborted_auth';
export type DurationBucket = 'lt1s' | 'lt5s' | 'lt30s' | 'gte30s';
export type ErrorCategory = string; // a contract §8 code, or network | storage | contract | other
export interface SyncRunCounts { created: number; updated: number; deleted: number; attachments: number; rejected: number }

export const MAX_BATCH_EVENTS = 200;
// capture_count is not queued: it is computed at flush time.
const VOCABULARY = ['sync_run', 'error'] as const;
const CONTRACT_RECORD_TYPES = new Set(['JOURNAL', 'NOTE', 'EVENT', 'DECISION', 'LESSON', 'KNOWLEDGE', 'QUESTION', 'GOAL', 'PERSON']);

export function durationBucket(ms: number): DurationBucket {
  if (ms < 1000) return 'lt1s';
  if (ms < 5000) return 'lt5s';
  if (ms < 30000) return 'lt30s';
  return 'gte30s';
}

/** Map anything to a contract category so a raw message or stack can never leave the device. */
export function errorCategory(code: string | null | undefined): ErrorCategory {
  if (code && EDGE_ERROR_CATALOGUE.includes(code)) return code;
  if (code === 'network' || code === 'storage' || code === 'contract') return code;
  return 'other';
}

function write(event: (typeof VOCABULARY)[number], metadata: Record<string, unknown>) {
  try {
    db.runSync(
      `INSERT INTO telemetry_events (session_id, user_id, tenant_id, event_type, event_name, timestamp, metadata)
       VALUES ('', '', '', ?, ?, ?, ?)`,
      event, event, new Date().toISOString(), JSON.stringify(metadata)
    );
  } catch {
    // telemetry must never crash the app
  }
}

export const telemetry = {
  syncRun: ({ result, durationMs, counts }: { result: SyncRunResult; durationMs: number; counts: SyncRunCounts }) =>
    write('sync_run', { result, duration_bucket: durationBucket(durationMs), counts }),
  error: (category: string | null | undefined) => write('error', { category: errorCategory(category) }),
};

/** capture_count is computed at flush time from local records, never stored per capture. */
function captureCountEvent(): Record<string, unknown> | null {
  const rows = db.getAllSync<{ capture_kind: string; n: number }>(
    `SELECT capture_kind, COUNT(*) AS n FROM records WHERE is_deleted = 0 GROUP BY capture_kind`
  );
  const by_type: Record<string, number> = {};
  for (const r of rows) if (CONTRACT_RECORD_TYPES.has(r.capture_kind)) by_type[r.capture_kind] = r.n;
  return Object.keys(by_type).length ? { event: 'capture_count', at: new Date().toISOString(), by_type } : null;
}

/**
 * Build the next contract batch. Returns the queued row ids it covers so the caller
 * can mark them transmitted after a 200. Rows outside the vocabulary (legacy V1/V2
 * screen/session/action events) are deleted, never sent.
 */
export function buildTelemetryBatch(): { ids: number[]; events: Record<string, unknown>[] } {
  const vocab = VOCABULARY.map(() => '?').join(',');
  db.runSync(`DELETE FROM telemetry_events WHERE transmitted = 0 AND event_type NOT IN (${vocab})`, ...VOCABULARY);
  const rows = db.getAllSync<{ id: number; event_type: string; timestamp: string; metadata: string }>(
    `SELECT id, event_type, timestamp, metadata FROM telemetry_events
     WHERE transmitted = 0 AND event_type IN (${vocab}) ORDER BY id ASC LIMIT ?`,
    ...VOCABULARY, MAX_BATCH_EVENTS - 1
  );
  if (rows.length === 0) return { ids: [], events: [] };
  const events: Record<string, unknown>[] = rows.map((r: { event_type: string; timestamp: string; metadata: string }) => {
    const meta = JSON.parse(r.metadata || '{}');
    return r.event_type === 'sync_run'
      ? { event: 'sync_run', at: r.timestamp, result: meta.result, duration_bucket: meta.duration_bucket, counts: meta.counts }
      : { event: 'error', at: r.timestamp, category: errorCategory(meta.category) };
  });
  const counts = captureCountEvent();
  if (counts) events.push(counts);
  return { ids: rows.map((r: { id: number }) => r.id), events };
}

export function markTelemetryTransmitted(ids: number[]): void {
  if (ids.length === 0) return;
  db.runSync(`UPDATE telemetry_events SET transmitted = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
}
