import * as FileSystem from 'expo-file-system/legacy';
import { sha256File } from '../crypto';
import {
  saveAttachment,
  linkAttachment,
  getAttachmentsForRecord,
  unlinkAttachment,
  type AttachmentMeta,
} from '../db/attachmentStore';
import { updateRecord } from '../db/recordStore';
import { validateFile, validateRecordLimits, type AttachmentLimits } from './validate';
import { KEYS, get } from '../secureStore';

/** Cached GKS capabilities (written by gksClient.capabilities); undefined before first discovery. */
async function serverLimits(): Promise<AttachmentLimits | undefined> {
  try {
    const json = await get(KEYS.CAPABILITIES_JSON);
    return json ? JSON.parse(json)?.attachments : undefined;
  } catch {
    return undefined;
  }
}
import { compressImage } from './compress';

export type AttachmentSource = 'camera' | 'gallery' | 'files' | 'scan';

export interface IncomingFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  source: AttachmentSource;
}

function uuidv7(): string {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 18)}`;
}

export async function addAttachment(
  recordEdgeId: string,
  file: IncomingFile
): Promise<{ ok: true; edge_attachment_id: string } | { ok: false; reason: string }> {
  const limits = await serverLimits();
  const fileCheck = validateFile({ name: file.name, size: file.size }, limits);
  if (!fileCheck.ok) return fileCheck;

  const existing = getAttachmentsForRecord(recordEdgeId);
  const totalBytes = existing.reduce((s, a) => s + a.size_bytes, 0);
  const limitsCheck = validateRecordLimits(existing.length, totalBytes, file.size, limits);
  if (!limitsCheck.ok) return limitsCheck;

  let workUri = file.uri;
  if (file.source === 'camera' || file.source === 'gallery') {
    const compressed = await compressImage(file.uri, file.mimeType);
    workUri = compressed.uri;
  }

  const info = await FileSystem.getInfoAsync(workUri);
  const actualSize = (info as any).size ?? file.size;

  const sha = await sha256File(workUri);
  const now = new Date().toISOString();

  const edge_attachment_id = await saveAttachment({
    edge_attachment_id: uuidv7(),
    original_filename: file.name,
    mime_type: file.mimeType,
    size_bytes: actualSize,
    sha256: sha,
    source_uri: workUri,
    captured_at: now,
  });

  linkAttachment(recordEdgeId, edge_attachment_id);
  updateRecord(recordEdgeId, {});

  return { ok: true, edge_attachment_id };
}

export async function removeAttachment(
  recordEdgeId: string,
  edgeAttachmentId: string
): Promise<void> {
  await unlinkAttachment(recordEdgeId, edgeAttachmentId);
  updateRecord(recordEdgeId, {});
}

export function getAttachments(recordEdgeId: string): AttachmentMeta[] {
  return getAttachmentsForRecord(recordEdgeId);
}
