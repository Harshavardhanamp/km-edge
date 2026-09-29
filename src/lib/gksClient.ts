import * as SecureStore from './secureStore';

let sessionCookie: string | null = null;
let csrfToken: string | null = null;

export async function healthCheck(baseUrl: string): Promise<'online' | 'offline'> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/health`, { method: 'GET' });
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

export async function login(
  baseUrl: string,
  username: string,
  password: string
): Promise<{ ok: true; cookie: string; userId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.message ?? 'Login failed' };
    }

    const body = await res.json();
    const cookie = res.headers.get('set-cookie') ?? '';
    const csrf = res.headers.get('x-csrf-token') ?? body.csrf_token ?? '';
    sessionCookie = cookie;
    csrfToken = csrf;
    return { ok: true, cookie, userId: body.user?.user_id ?? username };
  } catch {
    return { ok: false, error: 'Network error — check your connection' };
  }
}

export async function logout(baseUrl: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
  } finally {
    sessionCookie = null;
    csrfToken = null;
  }
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (sessionCookie) headers['Cookie'] = sessionCookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  return headers;
}

// Wraps a fetch call; on 401 silently re-auths once and retries.
// On second 401: returns null so caller can show "session expired" UI.
export async function fetchWithReauth(
  baseUrl: string,
  input: RequestInfo,
  init?: RequestInit
): Promise<Response | null> {
  const doFetch = () =>
    fetch(input, { ...init, headers: { ...init?.headers, ...authHeaders() } });

  const res = await doFetch();
  if (res.status !== 401) return res;

  const username = await SecureStore.get(SecureStore.KEYS.GKS_USERNAME);
  const password = await SecureStore.get(SecureStore.KEYS.GKS_PASSWORD_ENC);
  if (!username || !password) return null;

  const reauth = await login(baseUrl, username, password);
  if (!reauth.ok) return null;

  const retry = await doFetch();
  return retry.status === 401 ? null : retry;
}
