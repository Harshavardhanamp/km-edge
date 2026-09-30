import { resetDb } from './helpers/setupDb';
import {
  getPendingDeltas,
  markInFlight,
  acknowledgeDelta,
  rejectDelta,
  resetInFlightToPending,
  resetDeltaToPending,
} from '../lib/db/deltaStore';
import { db } from '../lib/db/index';

function insertDelta(edge_id = 'edge-1', operation = 'CREATE') {
  db.runSync(
    `INSERT INTO delta_log (edge_id, operation, record_type, capture_kind, timestamp, status)
     VALUES (?, ?, 'KNOWLEDGE', 'JOURNAL', '2026-01-01T00:00:00Z', 'PENDING')`,
    edge_id, operation
  );
  return (db.getFirstSync<{ seq: number }>(`SELECT last_insert_rowid() AS seq`))!.seq;
}

beforeEach(resetDb);

describe('getPendingDeltas', () => {
  test('returns empty array when no deltas', () => {
    expect(getPendingDeltas()).toEqual([]);
  });

  test('returns only PENDING deltas in seq order', () => {
    const s1 = insertDelta('e1');
    const s2 = insertDelta('e2');
    markInFlight(s1);
    const pending = getPendingDeltas();
    expect(pending).toHaveLength(1);
    expect(pending[0].seq).toBe(s2);
  });
});

describe('markInFlight', () => {
  test('sets status to IN_FLIGHT', () => {
    const seq = insertDelta();
    markInFlight(seq);
    const row = db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE seq = ?`, seq);
    expect(row?.status).toBe('IN_FLIGHT');
  });
});

describe('acknowledgeDelta', () => {
  test('sets ACKNOWLEDGED, stores gks_record_id and timestamp', () => {
    const seq = insertDelta();
    acknowledgeDelta(seq, 'KNOW-000042');
    const row = db.getFirstSync<{ status: string; gks_record_id: string; gks_acknowledged_at: string }>(
      `SELECT status, gks_record_id, gks_acknowledged_at FROM delta_log WHERE seq = ?`, seq
    );
    expect(row?.status).toBe('ACKNOWLEDGED');
    expect(row?.gks_record_id).toBe('KNOW-000042');
    expect(row?.gks_acknowledged_at).toBeTruthy();
  });
});

describe('rejectDelta', () => {
  test('sets REJECTED, stores error, increments retry_count', () => {
    const seq = insertDelta();
    rejectDelta(seq, 'VALIDATION_ERROR');
    const row = db.getFirstSync<{ status: string; gks_error: string; retry_count: number }>(
      `SELECT status, gks_error, retry_count FROM delta_log WHERE seq = ?`, seq
    );
    expect(row?.status).toBe('REJECTED');
    expect(row?.gks_error).toBe('VALIDATION_ERROR');
    expect(row?.retry_count).toBe(1);
  });

  test('increments retry_count on repeated rejection', () => {
    const seq = insertDelta();
    rejectDelta(seq, 'err');
    rejectDelta(seq, 'err');
    const row = db.getFirstSync<{ retry_count: number }>(
      `SELECT retry_count FROM delta_log WHERE seq = ?`, seq
    );
    expect(row?.retry_count).toBe(2);
  });
});

describe('resetInFlightToPending', () => {
  test('resets all IN_FLIGHT deltas back to PENDING', () => {
    const s1 = insertDelta('e1');
    const s2 = insertDelta('e2');
    markInFlight(s1);
    markInFlight(s2);
    resetInFlightToPending();
    const pending = getPendingDeltas();
    expect(pending).toHaveLength(2);
  });

  test('does not affect ACKNOWLEDGED or REJECTED deltas', () => {
    const s1 = insertDelta('e1');
    const s2 = insertDelta('e2');
    acknowledgeDelta(s1, 'GKS-1');
    rejectDelta(s2, 'err');
    resetInFlightToPending();
    const ack = db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE seq = ?`, s1);
    const rej = db.getFirstSync<{ status: string }>(`SELECT status FROM delta_log WHERE seq = ?`, s2);
    expect(ack?.status).toBe('ACKNOWLEDGED');
    expect(rej?.status).toBe('REJECTED');
  });
});

describe('resetDeltaToPending', () => {
  test('resets single delta to PENDING and increments retry_count', () => {
    const seq = insertDelta();
    markInFlight(seq);
    resetDeltaToPending(seq);
    const row = db.getFirstSync<{ status: string; retry_count: number; gks_error: string | null }>(
      `SELECT status, retry_count, gks_error FROM delta_log WHERE seq = ?`, seq
    );
    expect(row?.status).toBe('PENDING');
    expect(row?.retry_count).toBe(1);
    expect(row?.gks_error).toBeNull();
  });
});
