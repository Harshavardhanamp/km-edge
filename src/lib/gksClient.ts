import * as FileSystem from 'expo-file-system/legacy';
import { EDGE_CONTRACT_VERSION, edgeHeaders, type Capabilities, type EdgeResult, type IdentityPage, type LoginResponse, type MeResponse, type SuggestResponse } from './contract';
import { KEYS, get, remove, set } from './secureStore';

// Session-invalid event bus — listeners registered by AuthContext.
type SessionInvalidListener = (code: string) => void;
const sessionListeners: SessionInvalidListener[] = [];
export function onSessionInvalid(fn: SessionInvalidListener): () => void {
  sessionListeners.push(fn);
  return () => { const i = sessionListeners.indexOf(fn); if (i >= 0) sessionListeners.splice(i, 1); };
}
function emitSessionInvalid(code: string) {
  for (const fn of sessionListeners) fn(code);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function deviceHeaders(token?: string): Promise<Record<string, string>> {
  const deviceId = await get(KEYS.DEVICE_ID) ?? '';
  return edgeHeaders(deviceId, token ?? undefined);
}

async function parseError(res: Response): Promise<{ code: string; message: string; details?: Record<string, unknown> }> {
  try {
    const body = await res.json();
    // Contract envelope: { "error": { "code", "message", "details" } }
    if (body?.error?.code) return body.error;
    // 426 shape: { "code", "supported_contract_versions", "requested_version" }
    if (body?.code) return body;
  } catch { /* fall through */ }
  return { code: 'EDGE_SERVER_ERROR', message: `HTTP ${res.status}` };
}

async function edgeFetchInternal<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<EdgeResult<T>> {
  try {
    const headers = await deviceHeaders(token);
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });

    if (res.status === 426) {
      const err = await parseError(res);
      await set(KEYS.CONTRACT_BLOCK, JSON.stringify(err));
      return { ok: false, error: { code: err.code, status: 426, message: err.message, details: err.details } };
    }

    if (res.status === 401) {
      const err = await parseError(res);
      emitSessionInvalid(err.code);
      return { ok: false, error: { code: err.code, status: 401, message: err.message } };
    }

    if (!res.ok) {
      const err = await parseError(res);
      return { ok: false, error: { code: err.code, status: res.status, message: err.message, details: err.details } };
    }

    const body = await res.json() as T;
    return { ok: true, status: res.status, body };
  } catch {
    return { ok: false, network: true };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function healthCheck(baseUrl: string): Promise<'online' | 'offline'> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/health`, { method: 'GET' });
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

const CAP_TTL_MS = 24 * 60 * 60 * 1000;

export async function capabilities(baseUrl: string): Promise<EdgeResult<Capabilities>> {
  const cachedAt = await get(KEYS.CAPABILITIES_FETCHED_AT);
  if (cachedAt && Date.now() - Number(cachedAt) < CAP_TTL_MS) {
    const json = await get(KEYS.CAPABILITIES_JSON);
    if (json) return { ok: true, status: 200, body: JSON.parse(json) as Capabilities };
  }

  const deviceId = await get(KEYS.DEVICE_ID) ?? '';
  const result = await edgeFetchInternal<Capabilities>(baseUrl, '/api/v1/edge/capabilities', {
    method: 'GET',
    headers: { 'X-Edge-Contract-Version': String(EDGE_CONTRACT_VERSION), 'X-Edge-Device-Id': deviceId },
  });

  if (result.ok) {
    await set(KEYS.CAPABILITIES_JSON, JSON.stringify(result.body));
    await set(KEYS.CAPABILITIES_FETCHED_AT, String(Date.now()));
    await remove(KEYS.CONTRACT_BLOCK); // server accepted our contract version again (e.g. after an update)
  }
  return result;
}

export interface LoginParams {
  baseUrl: string;
  identifier: string;
  password: string;
  deviceName: string;
  platform: 'ios' | 'android';
  appVersion: string;
}

export async function login(params: LoginParams): Promise<EdgeResult<LoginResponse>> {
  const { baseUrl, identifier, password, deviceName, platform, appVersion } = params;
  const deviceId = await get(KEYS.DEVICE_ID) ?? '';
  return edgeFetchInternal<LoginResponse>(baseUrl, '/api/v1/edge/auth/login', {
    method: 'POST',
    headers: {
      'X-Edge-Contract-Version': String(EDGE_CONTRACT_VERSION),
      'X-Edge-Device-Id': deviceId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier,
      password,
      device_id: deviceId,
      device_name: deviceName,
      platform,
      app_version: appVersion,
    }),
  });
}

export async function logout(baseUrl: string): Promise<void> {
  const token = await get(KEYS.EDGE_TOKEN);
  if (!token) return;
  try {
    const headers = await deviceHeaders(token);
    await fetch(`${baseUrl}/api/v1/edge/auth/logout`, { method: 'POST', headers });
  } catch { /* best-effort */ }
}

export async function me(baseUrl: string): Promise<EdgeResult<MeResponse>> {
  const token = await get(KEYS.EDGE_TOKEN);
  return edgeFetchInternal<MeResponse>(baseUrl, '/api/v1/edge/auth/me', { method: 'GET' }, token ?? undefined);
}

export async function syncStatus(baseUrl: string, since?: string): Promise<EdgeResult<unknown>> {
  const token = await get(KEYS.EDGE_TOKEN);
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return edgeFetchInternal(baseUrl, `/api/v1/edge/sync-status${qs}`, { method: 'GET' }, token ?? undefined);
}

export async function createRecord(baseUrl: string, envelope: unknown): Promise<EdgeResult<unknown>> {
  const token = await get(KEYS.EDGE_TOKEN);
  return edgeFetchInternal(baseUrl, '/api/v1/edge/records', {
    method: 'POST',
    body: JSON.stringify(envelope),
  }, token ?? undefined);
}

export async function updateRecord(baseUrl: string, edgeId: string, envelope: unknown, baseSha: string | null): Promise<EdgeResult<unknown>> {
  const token = await get(KEYS.EDGE_TOKEN);
  return edgeFetchInternal(baseUrl, `/api/v1/edge/records/${edgeId}`, {
    method: 'PUT',
    body: JSON.stringify({ ...envelope as object, base_content_sha256: baseSha }),
  }, token ?? undefined);
}

export async function deleteRecord(baseUrl: string, edgeId: string): Promise<EdgeResult<unknown>> {
  const token = await get(KEYS.EDGE_TOKEN);
  return edgeFetchInternal(baseUrl, `/api/v1/edge/records/${edgeId}`, { method: 'DELETE' }, token ?? undefined);
}

/** Contract v2 §4: one page of Topic / Place / Person names. */
export async function identities(baseUrl: string, after: string | null, limit = 1000): Promise<EdgeResult<IdentityPage>> {
  const token = await get(KEYS.EDGE_TOKEN);
  const qs = `?limit=${limit}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
  return edgeFetchInternal<IdentityPage>(baseUrl, `/api/v1/edge/identities${qs}`, { method: 'GET' }, token ?? undefined);
}

/** Contract v2 §5: review-card suggestions (read-only). The caller applies the 3 s deadline (E4.2). */
export async function suggest(baseUrl: string, content: string, signal?: AbortSignal): Promise<EdgeResult<SuggestResponse>> {
  const token = await get(KEYS.EDGE_TOKEN);
  return edgeFetchInternal<SuggestResponse>(baseUrl, '/api/v1/edge/suggest', { method: 'POST', body: JSON.stringify({ content }), signal }, token ?? undefined);
}

export async function postTelemetry(baseUrl: string, events: unknown[]): Promise<EdgeResult<unknown>> {
  const token = await get(KEYS.EDGE_TOKEN);
  return edgeFetchInternal(baseUrl, '/api/v1/edge/telemetry', {
    method: 'POST',
    body: JSON.stringify({ events }),
  }, token ?? undefined);
}

export interface AttachmentUpload {
  edge_attachment_id: string;
  sha256: string;
  original_filename: string;
  mime_type: string;
  fileUri: string;
}

export interface AttachmentUploadResponse {
  state: 'ACCEPTED' | 'ALREADY_SYNCED';
  gks_attachment_id: string;
  sha256: string;
  size_bytes: number;
  scan_status: string;
}

/** Contract §6: one multipart call stores and binds the file to the record. */
export async function uploadAttachment(baseUrl: string, edgeId: string, att: AttachmentUpload): Promise<EdgeResult<AttachmentUploadResponse>> {
  const token = await get(KEYS.EDGE_TOKEN);
  // uploadAsync sets the multipart Content-Type (with boundary); the JSON default must not override it.
  const headers = await deviceHeaders(token ?? undefined);
  delete headers['Content-Type'];
  let res: { status: number; body: string };
  try {
    res = await FileSystem.uploadAsync(`${baseUrl}/api/v1/edge/records/${encodeURIComponent(edgeId)}/attachments`, att.fileUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      headers,
      parameters: {
        edge_attachment_id: att.edge_attachment_id,
        sha256: att.sha256,
        original_filename: att.original_filename,
        mime_type: att.mime_type,
      },
    });
  } catch {
    return { ok: false, network: true };
  }
  let body: any = null;
  try { body = JSON.parse(res.body); } catch { /* non-JSON body */ }
  if (res.status >= 200 && res.status < 300 && body) return { ok: true, status: res.status, body };
  const code: string = body?.error?.code ?? body?.code ?? 'EDGE_SERVER_ERROR';
  if (res.status === 401) emitSessionInvalid(code);
  // Same shape edgeFetchInternal stores: { code, message, details }.
  if (res.status === 426) await set(KEYS.CONTRACT_BLOCK, JSON.stringify(body?.error ?? body ?? { code }));
  return { ok: false, error: { code, status: res.status, message: body?.error?.message ?? `HTTP ${res.status}`, details: body?.details } };
}
