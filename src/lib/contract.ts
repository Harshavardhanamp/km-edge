export const EDGE_CONTRACT_VERSION = 1;

export interface EdgeError {
  code: string;
  status: number;
  message: string;
  details?: Record<string, unknown>;
}

export type EdgeResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; error: EdgeError }
  | { ok: false; network: true };

export interface Capabilities {
  contract_version: number;
  supported_contract_versions: number[];
  server: { display_name: string; version: string; build_sha: string };
  attachments: {
    allowed_extensions: string[];
    max_file_bytes: number;
    max_record_total_bytes: number;
    max_files_per_record: number;
    scan_policy: string;
  };
  limits: {
    max_content_chars: number;
    max_tags: number;
    max_tag_chars: number;
    max_batch_telemetry_events: number;
  };
  record_types: string[];
  life_areas: string[];
  session: { absolute_seconds: number };
}

export interface LoginResponse {
  contract_version: number;
  token: string;
  expires_at: string;
  user: {
    user_id: string;
    username: string;
    display_name: string;
    role: string;
    password_change_required?: boolean;
  };
}

export interface MeResponse {
  contract_version: number;
  user: LoginResponse['user'];
  expires_at: string;
}

/** Build the mandatory edge request headers. token may be omitted for login/capabilities. */
export function edgeHeaders(deviceId: string, token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'X-Edge-Contract-Version': String(EDGE_CONTRACT_VERSION),
    'X-Edge-Device-Id': deviceId,
    'Content-Type': 'application/json',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/** GKS contract §8 — the closed set of error codes (mirrors GKS edge/errors.EDGE_ERROR_CATALOGUE). */
export const EDGE_ERROR_CATALOGUE: readonly string[] = [
  'EDGE_CONTRACT_UNSUPPORTED', 'EDGE_SESSION_EXPIRED', 'EDGE_SESSION_REVOKED', 'EDGE_PASSWORD_CHANGE_REQUIRED',
  'RATE_LIMITED', 'EDGE_VALIDATION', 'EDGE_CONTENT_TOO_LONG', 'EDGE_TYPE_INVALID', 'EDGE_TYPE_LOCKED',
  'EDGE_CHECKSUM_MISMATCH', 'EDGE_RECORD_DELETED', 'EDGE_NOT_FOUND', 'EDGE_FILE_TYPE_NOT_SUPPORTED',
  'EDGE_FILE_TOO_LARGE', 'EDGE_RECORD_ATTACHMENT_LIMIT', 'EDGE_TEST_MODE_ACTIVE', 'EDGE_SERVER_ERROR',
];
