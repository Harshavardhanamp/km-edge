import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import { db } from '../db/index';
import { getRecord } from '../db/recordStore';
import { getAttachmentsForRecord, purgeAttachment } from '../db/attachmentStore';
import {
  getPendingDeltas,
  markInFlight,
  acknowledgeDelta,
  rejectDelta,
  resetInFlightToPending,
  type DeltaEntry,
} from '../db/deltaStore';
import { fetchWithReauth } from '../gksClient';
import { get, KEYS } from '../secureStore';

export type SyncResult = {
  synced: number;
  failed: number;
  skipped: number;
  telemetryFlushed: number;
};

// Map edge capture_kind to GKS record_type string
function gksCaptureType(capture_kind: string): string {
  const map: Record<string, string> = {
    JOURNAL: 'JOURNAL',
    NOTE: 'NOTE',
    EVENT: 'EVENT',
    DECISION: 'DECISION',
    LESSON: 'LESSON',
    GOAL: 'GOAL',
    PERSON: 'PERSON',
  };
  return map[capture_kind] ?? 'NOTE';
}

async function uploadAttachments(
  baseUrl: string,
  edge_id: string,
  gks_record_id: string
): Promise<void> {
  const attachments = getAttachmentsForRecord(edge_id);
  for (const att of attachments) {
    if (att.gks_attachment_id) continue; // already uploaded

    // Read blob
    const row = db.getFirstSync<{ blob_path: string }>(
      `SELECT blob_path FROM attachments WHERE edge_attachment_id = ?`,
      att.edge_attachment_id
    );
    if (!row) continue;

    const fullPath = `${FileSystem.documentDirectory}${row.blob_path}`;
    const info = await FileSystem.getInfoAsync(fullPath);
    if (!info.exists) continue;

    // Upload via multipart — expo FileSystem.uploadAsync handles multipart
    const uploadRes = await FileSystem.uploadAsync(
      `${baseUrl}/api/v1/attachments/workflow/NEW_ENTRY`,
      fullPath,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        parameters: { entity_ref: gks_record_id },
        headers: await buildAuthHeaders(baseUrl),
      }
    );

    if (uploadRes.status !== 200 && uploadRes.status !== 201) continue;

    const body = JSON.parse(uploadRes.body);
    const gks_attachment_id: string = body.attachment_id;

    // Bind attachment to record
    const bindRes = await fetch(
      `${baseUrl}/api/v1/attachments/records/${gks_record_id}/attachments/${gks_attachment_id}`,
      { method: 'POST', headers: await buildAuthHeaders(baseUrl) }
    );
    if (!bindRes.ok) continue;

    db.runSync(
      `UPDATE attachments SET gks_attachment_id = ? WHERE edge_attachment_id = ?`,
      gks_attachment_id,
      att.edge_attachment_id
    );
  }

  // Purge any blobs marked pending_delete that are now safe to remove
  const toDelete = db.getAllSync<{ edge_attachment_id: string }>(
    `SELECT edge_attachment_id FROM attachments WHERE pending_delete = 1`
  );
  for (const { edge_attachment_id } of toDelete) {
    await purgeAttachment(edge_attachment_id);
  }
}

async function buildAuthHeaders(baseUrl: string): Promise<Record<string, string>> {
  // Re-use the module-level session cookie from gksClient via fetchWithReauth pattern.
  // We import authHeaders lazily to avoid circular deps.
  const { authHeaders } = await import('../gksClient');
  return authHeaders();
}

async function syncDelta(baseUrl: string, delta: DeltaEntry): Promise<'ok' | 'fail' | 'skip'> {
  if (delta.operation === 'DELETE') {
    const gks_record_id = delta.gks_record_id ?? delta.gks_id;
    if (!gks_record_id) {
      // Record was never synced to GKS — nothing to delete remotely
      acknowledgeDelta(delta.seq, '');
      return 'ok';
    }
    markInFlight(delta.seq);
    const res = await fetchWithReauth(baseUrl, `${baseUrl}/api/v1/records/${gks_record_id}`, {
      method: 'DELETE',
    });
    if (!res) {
      rejectDelta(delta.seq, 'Auth failed');
      return 'fail';
    }
    if (res.status === 404 || res.status === 204) {
      // 404 = already gone, 204 = deleted now — both are success
      acknowledgeDelta(delta.seq, gks_record_id);
      return 'ok';
    }
    rejectDelta(delta.seq, `HTTP ${res.status}`);
    return 'fail';
  }

  const record = getRecord(delta.edge_id);
  if (!record) {
    rejectDelta(delta.seq, 'Record not found locally');
    return 'fail';
  }

  markInFlight(delta.seq);

  const payload = {
    edge_id: delta.edge_id,
    record_type: record.type,
    capture_kind: gksCaptureType(record.capture_kind),
    title: record.title,
    content: record.content,
    tags: record.tags,
    importance: record.importance,
    classification: record.classification,
    life_areas: record.life_areas,
  };

  const res = await fetchWithReauth(baseUrl, `${baseUrl}/api/v1/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res) {
    rejectDelta(delta.seq, 'Auth failed');
    return 'fail';
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
    if (outcome === 'ok') result.synced++;
    else if (outcome === 'fail') result.failed++;
    else result.skipped++;
  }

  result.telemetryFlushed = await flushTelemetry(baseUrl);
  return result;
}
