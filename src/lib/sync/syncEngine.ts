import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import { db } from '../db/index';
import { getRecord } from '../db/recordStore';
import { purgeAttachment } from '../db/attachmentStore';
import {
  getPendingDeltas,
  markInFlight,
  acknowledgeDelta,
  rejectDelta,
  resetDeltaToPending,
  resetInFlightToPending,
  type DeltaEntry,
} from '../db/deltaStore';
import { fetchWithReauth, authHeaders } from '../gksClient';
import { get, set, KEYS } from '../secureStore';

export type SyncResult = {
  synced: number;
  failed: number;
  skipped: number;
  telemetryFlushed: number;
};

// Map edge capture_kind to GKS record_type string
function gksCaptureType(capture_kind: string): string {
  const map: Record<string, string> = {
    JOURNAL: 'journal',
    NOTE: 'note',
    EVENT: 'event',
    DECISION: 'decision',
    LESSON: 'lesson',
    GOAL: 'goal',
    PERSON: 'person',
  };
  return map[capture_kind] ?? 'note';
}

function buildAuthHeaders(): Record<string, string> {
  return authHeaders();
}

async function uploadAttachments(
  baseUrl: string,
  edge_id: string,
  gks_record_id: string
): Promise<void> {
  // Only attachments not yet synced
  const attachments = db.getAllSync<{
    edge_attachment_id: string;
    sha256: string;
    blob_path: string;
  }>(
    `SELECT a.edge_attachment_id, a.sha256, a.blob_path
     FROM attachments a
     JOIN record_attachments ra ON ra.edge_attachment_id = a.edge_attachment_id
     WHERE ra.edge_id = ? AND a.sync_status = 'PENDING' AND a.gks_attachment_id IS NULL`,
    edge_id
  );

  for (const att of attachments) {
    const fullPath = `${FileSystem.documentDirectory}${att.blob_path}`;
    const info = await FileSystem.getInfoAsync(fullPath);
    if (!info.exists) continue;

    let uploadRes: { status: number; body: string };
    try {
      uploadRes = await FileSystem.uploadAsync(
        `${baseUrl}/api/v1/attachments/workflow/NEW_ENTRY`,
        fullPath,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          parameters: { entity_ref: gks_record_id },
          headers: buildAuthHeaders(),
        }
      );
    } catch {
      // Network error — leave PENDING, skip this attachment
      continue;
    }

    if (uploadRes.status === 400) {
      let errBody: { detail?: string } = {};
      try { errBody = JSON.parse(uploadRes.body); } catch { /* ignore */ }
      db.runSync(
        `UPDATE attachments SET sync_status = 'FAILED', sync_error = ? WHERE edge_attachment_id = ?`,
        errBody.detail ?? 'GKS_REJECTED',
        att.edge_attachment_id
      );
      continue;
    }

    if (uploadRes.status !== 200 && uploadRes.status !== 201) continue;

    let body: { attachment_id?: string; sha256?: string };
    try { body = JSON.parse(uploadRes.body); } catch { continue; }

    // Checksum verification
    if (body.sha256 !== att.sha256) {
      db.runSync(
        `UPDATE attachments SET sync_status = 'FAILED', sync_error = 'CHECKSUM_MISMATCH' WHERE edge_attachment_id = ?`,
        att.edge_attachment_id
      );
      continue;
    }

    const gks_attachment_id = body.attachment_id;
    if (!gks_attachment_id) continue;

    // Bind to record
    try {
      const bindRes = await fetch(
        `${baseUrl}/api/v1/attachments/records/${gks_record_id}/attachments/${gks_attachment_id}`,
        { method: 'POST', headers: buildAuthHeaders() }
      );
      if (!bindRes.ok) continue;
    } catch {
      continue;
    }

    db.runSync(
      `UPDATE attachments SET gks_attachment_id = ?, sync_status = 'SYNCED', sync_error = NULL WHERE edge_attachment_id = ?`,
      gks_attachment_id,
      att.edge_attachment_id
    );
  }

  // Purge blobs only when DELETE delta is ACKNOWLEDGED
  const toDelete = db.getAllSync<{ edge_attachment_id: string }>(
    `SELECT a.edge_attachment_id
     FROM attachments a
     JOIN delta_log d ON d.seq = a.delete_delta_seq
     WHERE a.pending_delete = 1 AND d.status = 'ACKNOWLEDGED'`
  );
  for (const { edge_attachment_id } of toDelete) {
    await purgeAttachment(edge_attachment_id);
  }
}

async function syncDelta(baseUrl: string, delta: DeltaEntry): Promise<'ok' | 'fail' | 'skip' | 'stop'> {
  if (delta.operation === 'DELETE') {
    const gks_record_id = delta.gks_record_id ?? delta.gks_id;
    if (!gks_record_id) {
      // Record was never synced to GKS — nothing to delete remotely
      acknowledgeDelta(delta.seq, '');
      return 'ok';
    }
    markInFlight(delta.seq);

    let res: Response | null;
    try {
      res = await fetchWithReauth(baseUrl, `${baseUrl}/api/v1/records/${gks_record_id}`, {
        method: 'DELETE',
      });
    } catch {
      resetDeltaToPending(delta.seq);
      return 'stop';
    }

    if (!res) {
      // Auth failure — reset to PENDING, stop processing
      resetDeltaToPending(delta.seq);
      return 'stop';
    }
    if (res.status === 404 || res.status === 204) {
      // 404 = already gone, 204 = deleted now — both are success
      acknowledgeDelta(delta.seq, gks_record_id);
      return 'ok';
    }
    if (res.status >= 500) {
      resetDeltaToPending(delta.seq);
      return 'skip';
    }
    rejectDelta(delta.seq, `HTTP ${res.status}`);
    return 'fail';
  }

  const record = getRecord(delta.edge_id);
  if (!record) {
    rejectDelta(delta.seq, 'Record not found locally');
    return 'fail';
  }

  // A2 fix: GKS records are immutable — no PUT/PATCH endpoint exists.
  // UPDATE deltas for already-synced records have nothing to do remotely;
  // acknowledge locally so they don't block the queue or hit 409 loops.
  if (delta.operation === 'UPDATE' && record.gks_id) {
    acknowledgeDelta(delta.seq, record.gks_id);
    return 'ok';
  }

  markInFlight(delta.seq);

  const payload = {
    edge_id: delta.edge_id,
    record_type: gksCaptureType(record.capture_kind),
    title: record.title,
    content: record.content,
    content_sha256: record.content_sha256,
    preserve_authored_body: true,
    tags: record.tags,
    importance: record.importance,
    classification: record.classification,
    life_areas: record.life_areas,
  };

  let res: Response | null;
  try {
    res = await fetchWithReauth(baseUrl, `${baseUrl}/api/v1/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    resetDeltaToPending(delta.seq);
    return 'stop';
  }

  if (!res) {
    // Auth failure — reset to PENDING, stop processing
    resetDeltaToPending(delta.seq);
    return 'stop';
  }

  if (res.status === 409) {
    // Duplicate — GKS already has it; read the record_id from response
    const body = await res.json().catch(() => ({}));
    const gks_record_id = body.record_id ?? '';
    acknowledgeDelta(delta.seq, gks_record_id);
    await uploadAttachments(baseUrl, delta.edge_id, gks_record_id);
    return 'ok';
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    rejectDelta(delta.seq, body.detail ?? `HTTP ${res.status}`);
    return 'fail';
  }

  const body = await res.json();
  const gks_record_id: string = body.record?.id ?? '';
  acknowledgeDelta(delta.seq, gks_record_id);

  // Update local record with GKS id
  if (gks_record_id) {
    db.runSync(
      `UPDATE records SET gks_id = ?, sync_status = 'SYNCED' WHERE edge_id = ?`,
      gks_record_id,
      delta.edge_id
    );
  }

  await uploadAttachments(baseUrl, delta.edge_id, gks_record_id);
  return 'ok';
}

async function flushTelemetry(baseUrl: string): Promise<number> {
  const rows = db.getAllSync<{
    id: number;
    session_id: string;
    user_id: string;
    event_type: string;
    event_name: string;
    timestamp: string;
    metadata: string;
  }>(`SELECT id, session_id, user_id, event_type, event_name, timestamp, metadata
      FROM telemetry_events WHERE transmitted = 0 ORDER BY id ASC LIMIT 200`);

  if (rows.length === 0) return 0;

  const events = rows.map((r) => ({
    id: String(r.id),
    user_id: r.user_id,
    session_id: r.session_id,
    event_type: r.event_type,
    action: r.event_name,
    metadata: JSON.parse(r.metadata),
    occurred_at: r.timestamp,
  }));

  const res = await fetchWithReauth(baseUrl, `${baseUrl}/api/v1/telemetry/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });

  if (!res || !res.ok) return 0;

  const ids = rows.map((r) => r.id).join(',');
  db.runSync(`UPDATE telemetry_events SET transmitted = 1 WHERE id IN (${ids})`);
  return rows.length;
}

async function verifyChecksums(baseUrl: string): Promise<void> {
  let res: Response | null;
  try {
    res = await fetchWithReauth(baseUrl, `${baseUrl}/api/v1/sync/status`, {
      method: 'GET',
    });
  } catch {
    return; // network error — skip verification this run
  }
  if (!res || !res.ok) return;

  const data = await res.json().catch(() => null);
  if (!data?.records) return;

  for (const gksRec of data.records as { edge_id: string; content_sha256: string }[]) {
    const local = db.getFirstSync<{
      content_sha256: string;
      seq: number;
      retry_count: number;
    }>(
      `SELECT r.content_sha256, d.seq, COALESCE(d.retry_count, 0) AS retry_count
       FROM records r
       JOIN delta_log d ON d.edge_id = r.edge_id AND d.status = 'ACKNOWLEDGED'
       WHERE r.edge_id = ?`,
      gksRec.edge_id
    );

    if (!local) continue;
    if (local.content_sha256 === gksRec.content_sha256) continue;

    // Mismatch
    if (local.retry_count >= 2) {
      // 3rd failure — reject permanently
      rejectDelta(local.seq, 'CHECKSUM_MISMATCH');
    } else {
      resetDeltaToPending(local.seq);
    }
  }
}

export async function runSync(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, skipped: 0, telemetryFlushed: 0 };

  const net = await Network.getNetworkStateAsync();
  if (!net.isConnected) return result;

  const baseUrl = await get(KEYS.GKS_SERVER_URL);
  if (!baseUrl) return result;

  // Reset any IN_FLIGHT from a previous crashed session
  resetInFlightToPending();

  const deltas = getPendingDeltas();
  for (const delta of deltas) {
    const outcome = await syncDelta(baseUrl, delta);
    if (outcome === 'stop') break;
    if (outcome === 'ok') result.synced++;
    else if (outcome === 'fail') result.failed++;
    else result.skipped++;
  }

  result.telemetryFlushed = await flushTelemetry(baseUrl);

  await verifyChecksums(baseUrl);

  await set(KEYS.LAST_SYNCED_AT, new Date().toISOString());
  await set(KEYS.GKS_SYNCED_COUNT, String(result.synced));

  return result;
}
