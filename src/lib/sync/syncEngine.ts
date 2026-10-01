import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import { db } from '../db/index';
import { getRecord, localSoftDelete } from '../db/recordStore';
import { purgeAttachment } from '../db/attachmentStore';
import {
  getPendingDeltas,
  markInFlight,
  acknowledgeDelta,
  rejectDelta,
  resetDeltaToPending,
  resetInFlightToPending,
  bumpRetry,
  type DeltaEntry,
} from '../db/deltaStore';
import {
  createRecord,
  updateRecord,
  deleteRecord,
  syncStatus,
  postTelemetry,
  capabilities,
  healthCheck,
} from '../gksClient';
import { buildEnvelope, buildUpdateEnvelope } from './envelope';
import { mapError } from '../errors/edgeErrorMap';
import { get, set, KEYS } from '../secureStore';

export type SyncResult = {
  synced: number;
  failed: number;
  skipped: number;
  telemetryFlushed: number;
};

async function uploadAttachments(
  baseUrl: string,
  edge_id: string,
  gks_record_id: string
): Promise<void> {
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
        }
      );
    } catch {
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
      const token = await get(KEYS.EDGE_TOKEN);
      const bindRes = await fetch(
        `${baseUrl}/api/v1/attachments/records/${gks_record_id}/attachments/${gks_attachment_id}`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
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
  // DELETE path
  if (delta.operation === 'DELETE') {
    const edge_id = delta.edge_id;
    // Use edge_id from the delta for the new API; fall back to gks_record_id for legacy
    const hasGks = delta.gks_record_id ?? delta.gks_id;
    if (!hasGks) {
      // Never synced to GKS — acknowledge locally
      acknowledgeDelta(delta.seq, '');
      return 'ok';
    }
    markInFlight(delta.seq);

    const result = await deleteRecord(baseUrl, edge_id);

    if ('network' in result && result.network) {
      resetDeltaToPending(delta.seq);
      return 'stop';
    }
    if (!result.ok) {
      const { code } = result.error;
      if (code === 'EDGE_SESSION_EXPIRED' || code === 'EDGE_SESSION_REVOKED') {
        resetDeltaToPending(delta.seq);
        return 'stop';
      }
      if (code === 'EDGE_RECORD_DELETED' || code === 'EDGE_NOT_FOUND') {
        // Already gone on server — treat as success
        acknowledgeDelta(delta.seq, hasGks);
        return 'ok';
      }
      const entry = mapError(code);
      if (entry.retryable) {
        resetDeltaToPending(delta.seq);
        return 'skip';
      }
      rejectDelta(delta.seq, code);
      return 'fail';
    }

    const body = result.body as Record<string, unknown>;
    const state = body?.state as string | undefined;
    if (state === 'DELETION_REQUESTED' || state === 'DELETED') {
      acknowledgeDelta(delta.seq, hasGks);
      return 'ok';
    }
    // Any other 2xx — acknowledge
    acknowledgeDelta(delta.seq, hasGks);
    return 'ok';
  }

  // C7 fix: soft-deleted record's stale CREATE/UPDATE deltas must not transmit
  const isDeleted = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM records WHERE edge_id = ? AND is_deleted = 1`,
    delta.edge_id
  );
  if (isDeleted?.n) {
    const gksId = db.getFirstSync<{ gks_id: string | null }>(
      `SELECT gks_id FROM records WHERE edge_id = ?`, delta.edge_id
    )?.gks_id ?? '';
    acknowledgeDelta(delta.seq, gksId);
    return 'ok';
  }

  const record = getRecord(delta.edge_id);
  if (!record) {
    rejectDelta(delta.seq, 'EDGE_NOT_FOUND');
    return 'fail';
  }

  // UPDATE path — if record has gks_id but no synced_content_sha256, or no content change pending
  if (delta.operation === 'UPDATE') {
    const row = db.getFirstSync<{ gks_id: string | null; synced_content_sha256: string | null }>(
      `SELECT gks_id, synced_content_sha256 FROM records WHERE edge_id = ?`,
      delta.edge_id
    );

    if (row?.gks_id && !row.synced_content_sha256) {
      // Already synced, no pending content change — acknowledge locally
      acknowledgeDelta(delta.seq, row.gks_id);
      return 'ok';
    }

    if (row?.gks_id) {
      // Has a base sha — send update
      markInFlight(delta.seq);
      const result = await updateRecord(baseUrl, delta.edge_id, buildUpdateEnvelope(record, row.synced_content_sha256), row.synced_content_sha256);

      if ('network' in result && result.network) {
        resetDeltaToPending(delta.seq);
        return 'stop';
      }
      if (!result.ok) {
        const { code } = result.error;
        if (code === 'EDGE_SESSION_EXPIRED' || code === 'EDGE_SESSION_REVOKED') {
          resetDeltaToPending(delta.seq);
          return 'stop';
        }
        if (code === 'EDGE_RECORD_DELETED') {
          rejectDelta(delta.seq, code);
          localSoftDelete(delta.edge_id, 'removed on desktop');
          return 'fail';
        }
        const entry = mapError(code);
        if (entry.retryable) {
          resetDeltaToPending(delta.seq);
          return 'skip';
        }
        rejectDelta(delta.seq, code);
        return 'fail';
      }

      const body = result.body as Record<string, unknown>;
      const state = body?.state as string | undefined;
      const gks_id = (body?.gks_id ?? row.gks_id) as string;
      const new_sha = body?.content_sha256 as string | undefined;

      if (state === 'UPDATED' || state === 'ACCEPTED' || state === 'CONFLICT') {
        acknowledgeDelta(delta.seq, gks_id);
        db.runSync(
          `UPDATE records SET gks_id = ?, synced_content_sha256 = ?, sync_status = 'SYNCED' WHERE edge_id = ?`,
          gks_id,
          new_sha ?? record.content_sha256,
          delta.edge_id
        );
      } else {
        acknowledgeDelta(delta.seq, gks_id);
      }
      return 'ok';
    }

    // UPDATE delta but no gks_id yet — fall through to CREATE
  }

  // CREATE path (and UPDATE with no gks_id yet)
  markInFlight(delta.seq);
  const result = await createRecord(baseUrl, buildEnvelope(record));

  if ('network' in result && result.network) {
    resetDeltaToPending(delta.seq);
    return 'stop';
  }
  if (!result.ok) {
    const { code } = result.error;
    if (code === 'EDGE_SESSION_EXPIRED' || code === 'EDGE_SESSION_REVOKED') {
      resetDeltaToPending(delta.seq);
      return 'stop';
    }
    if (code === 'EDGE_RECORD_DELETED') {
      rejectDelta(delta.seq, code);
      localSoftDelete(delta.edge_id, 'removed on desktop');
      return 'fail';
    }
    const entry = mapError(code);
    if (entry.retryable) {
      resetDeltaToPending(delta.seq);
      return 'skip';
    }
    rejectDelta(delta.seq, code);
    return 'fail';
  }

  const body = result.body as Record<string, unknown>;
  const state = body?.state as string | undefined;
  const gks_id = body?.gks_id as string | undefined ?? '';
  const content_sha = body?.content_sha256 as string | undefined;

  acknowledgeDelta(delta.seq, gks_id);

  if (state === 'ACCEPTED' || state === 'ALREADY_SYNCED' || state === 'UPDATED' || state === 'CONFLICT') {
    if (gks_id) {
      db.runSync(
        `UPDATE records SET gks_id = ?, synced_content_sha256 = ?, sync_status = 'SYNCED' WHERE edge_id = ?`,
        gks_id,
        content_sha ?? record.content_sha256,
        delta.edge_id
      );
    }
  }

  await uploadAttachments(baseUrl, delta.edge_id, gks_id);
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

  const res = await postTelemetry(baseUrl, events);
  if (!res.ok) return 0;

  const ids = rows.map((r) => r.id).join(',');
  db.runSync(`UPDATE telemetry_events SET transmitted = 1 WHERE id IN (${ids})`);
  return rows.length;
}

async function verifyChecksums(baseUrl: string): Promise<void> {
  const result = await syncStatus(baseUrl);
  if (!result.ok) return;

  const data = result.body as { records?: { edge_id: string; gks_id?: string; content_sha256: string }[]; synced_record_count?: number };
  if (!data?.records) return;

  for (const gksRec of data.records) {
    const local = db.getFirstSync<{
      content_sha256: string;
      seq: number;
      retry_count: number;
    }>(
      `SELECT r.content_sha256, d.seq, COALESCE(d.retry_count, 0) AS retry_count
       FROM records r
       JOIN delta_log d ON d.edge_id = r.edge_id AND d.status = 'ACKNOWLEDGED'
       WHERE r.edge_id = ?
       ORDER BY d.seq DESC LIMIT 1`,
      gksRec.edge_id
    );

    if (!local) continue;

    // Head re-pointing: if server reports a different gks_id, update local record
    if (gksRec.gks_id) {
      db.runSync(
        `UPDATE records SET gks_id = ? WHERE edge_id = ? AND (gks_id IS NULL OR gks_id != ?)`,
        gksRec.gks_id,
        gksRec.edge_id,
        gksRec.gks_id
      );
    }

    if (local.content_sha256 === gksRec.content_sha256) continue;

    // Mismatch
    if (local.retry_count >= 2) {
      rejectDelta(local.seq, 'CHECKSUM_MISMATCH');
    } else {
      resetDeltaToPending(local.seq);
      bumpRetry(local.seq);
    }
  }

  // Update synced count from server's authoritative count
  if (typeof data.synced_record_count === 'number') {
    await set(KEYS.GKS_SYNCED_COUNT, String(data.synced_record_count));
  }
}

export async function runSync(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, skipped: 0, telemetryFlushed: 0 };

  const net = await Network.getNetworkStateAsync();
  if (!net.isConnected) return result;

  const baseUrl = await get(KEYS.GKS_SERVER_URL);
  if (!baseUrl) return result;

  // Probe GKS capabilities — also catches 426 (CONTRACT_BLOCK written by gksClient)
  const cap = await capabilities(baseUrl);
  if (!cap.ok) {
    // 426 or session error — abort; gksClient already wrote CONTRACT_BLOCK for 426
    return result;
  }

  // Health probe: expo-network only checks device internet; Tailscale tunnel may be down
  if (await healthCheck(baseUrl) === 'offline') return result;

  // Reset any IN_FLIGHT from a previous crashed session
  resetInFlightToPending();

  // Upload PENDING attachments for records already acknowledged in a prior run
  const orphanedAttachmentRecords = db.getAllSync<{ edge_id: string; gks_id: string }>(
    `SELECT DISTINCT r.edge_id, r.gks_id
     FROM records r
     JOIN record_attachments ra ON ra.edge_id = r.edge_id
     JOIN attachments a ON a.edge_attachment_id = ra.edge_attachment_id
     WHERE a.sync_status = 'PENDING' AND r.gks_id IS NOT NULL AND r.is_deleted = 0`
  );
  for (const row of orphanedAttachmentRecords) {
    await uploadAttachments(baseUrl, row.edge_id, row.gks_id);
  }

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

  // last_synced_at written after verifyChecksums (even if verification fails internally)
  await set(KEYS.LAST_SYNCED_AT, new Date().toISOString());

  return result;
}
