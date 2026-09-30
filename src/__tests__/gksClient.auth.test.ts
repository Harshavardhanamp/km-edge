/**
 * K2 auth contract tests — drives gksClient against fixture responses.
 */
import { respond, fixtureByName } from '../test/mockGks';
import { EDGE_CONTRACT_VERSION } from '../lib/contract';

// ---- mock secureStore so we control DEVICE_ID ----
jest.mock('../lib/secureStore', () => {
  const store: Record<string, string> = {
    device_id: '01927c4a-0000-7000-8000-000000000001',
  };
  return {
    KEYS: {
      GKS_SERVER_URL: 'gks_server_url',
      CAPABILITIES_JSON: 'capabilities_json',
      CAPABILITIES_FETCHED_AT: 'capabilities_fetched_at',
      CONTRACT_BLOCK: 'contract_block',
      DEVICE_ID: 'device_id',
      DEVICE_NAME: 'device_name',
      GKS_USERNAME: 'gks_username',
      GKS_USER_ID: 'gks_user_id',
      EDGE_TOKEN: 'edge_token',
      EDGE_TOKEN_EXPIRES_AT: 'edge_token_expires_at',
      OFFLINE_VERIFIER: 'offline_verifier',
      OFFLINE_VERIFIER_SALT: 'offline_verifier_salt',
      OFFLINE_ATTEMPT_COUNT: 'offline_attempt_count',
      LAST_SYNCED_AT: 'last_synced_at',
      GKS_SYNCED_COUNT: 'gks_synced_count',
      CALENDAR_SELECTED_IDS: 'calendar_selected_ids',
    },
    get: jest.fn(async (key: string) => store[key] ?? null),
    set: jest.fn(async (key: string, val: string) => { store[key] = val; }),
    remove: jest.fn(async (key: string) => { delete store[key]; }),
    ensureDeviceId: jest.fn(async () => store['device_id']),
    clearSession: jest.fn(async () => {
      delete store['gks_username'];
      delete store['gks_user_id'];
      delete store['edge_token'];
      delete store['edge_token_expires_at'];
      delete store['contract_block'];
    }),
  };
});

// ---- mock fetch using fixture responses ----
function mockFetch(fixtureName: string) {
  const { status, body } = respond(fixtureName);
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  });
}

beforeEach(() => {
  (global.fetch as jest.Mock) = jest.fn();
});

import { login, capabilities } from '../lib/gksClient';

const BASE = 'http://localhost:8000';

describe('login', () => {
  test('ok — returns token, user, and never includes Cookie or Origin', async () => {
    mockFetch('auth.login.ok');
    const result = await login({
      baseUrl: BASE,
      identifier: 'priya',
      password: 'correct-password-123',
      deviceName: "Priya's iPhone",
      platform: 'ios',
      appVersion: '2.0.0',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.token).toBe('test-token-001');
    expect(result.body.user.username).toBe('priya');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Edge-Contract-Version']).toBe(String(EDGE_CONTRACT_VERSION));
    expect(headers['X-Edge-Device-Id']).toBe('01927c4a-0000-7000-8000-000000000001');
    expect(headers['Cookie']).toBeUndefined();
    expect(headers['Origin']).toBeUndefined();
    expect(headers['X-CSRF-Token']).toBeUndefined();
    // password is in body, never a header
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.identifier).toBe('priya');
    expect(sentBody.device_id).toBe('01927c4a-0000-7000-8000-000000000001');
  });

  test('invalid credentials — returns error with INVALID_LOGIN code', async () => {
    mockFetch('auth.login.invalid');
    const result = await login({
      baseUrl: BASE,
      identifier: 'priya',
      password: 'wrong-password-000',
      deviceName: "Priya's iPhone",
      platform: 'ios',
      appVersion: '2.0.0',
    });
    expect(result.ok).toBe(false);
    if (result.ok || 'network' in result) return;
    expect(result.error.code).toBe('INVALID_LOGIN');
    expect(result.error.status).toBe(401);
  });

  test('session expired — emits sessionInvalid, returns EDGE_SESSION_EXPIRED error', async () => {
    const { onSessionInvalid } = await import('../lib/gksClient');
    const codes: string[] = [];
    const unsub = onSessionInvalid((code) => codes.push(code));

    mockFetch('auth.session.expired');
    // Use me() to trigger a 401 with expired token
    const { me } = await import('../lib/gksClient');
    (require('../lib/secureStore').get as jest.Mock).mockImplementation(async (k: string) => {
      if (k === 'edge_token') return 'expired-token-001';
      if (k === 'device_id') return '01927c4a-0000-7000-8000-000000000001';
      return null;
    });
    const result = await me(BASE);
    expect(result.ok).toBe(false);
    if (result.ok || 'network' in result) return;
    expect(result.error.code).toBe('EDGE_SESSION_EXPIRED');
    expect(codes).toContain('EDGE_SESSION_EXPIRED');
    unsub();
  });

  test('session revoked — emits sessionInvalid with EDGE_SESSION_REVOKED', async () => {
    const { onSessionInvalid } = await import('../lib/gksClient');
    const codes: string[] = [];
    const unsub = onSessionInvalid((code) => codes.push(code));

    mockFetch('auth.session.revoked');
    (require('../lib/secureStore').get as jest.Mock).mockImplementation(async (k: string) => {
      if (k === 'edge_token') return 'revoked-token-001';
      if (k === 'device_id') return '01927c4a-0000-7000-8000-000000000001';
      return null;
    });
    const { me } = await import('../lib/gksClient');
    const result = await me(BASE);
    expect(result.ok).toBe(false);
    if (result.ok || 'network' in result) return;
    expect(result.error.code).toBe('EDGE_SESSION_REVOKED');
    expect(codes).toContain('EDGE_SESSION_REVOKED');
    unsub();
  });

  test('rate limited — 429 returns RATE_LIMITED error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Too many attempts' } }),
      headers: { get: () => null },
    });
    const result = await login({
      baseUrl: BASE,
      identifier: 'priya',
      password: 'any',
      deviceName: 'Test',
      platform: 'ios',
      appVersion: '2.0.0',
    });
    expect(result.ok).toBe(false);
    if (result.ok || 'network' in result) return;
    expect(result.error.code).toBe('RATE_LIMITED');
  });

  test('network error — returns {network: true}', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    const result = await login({
      baseUrl: BASE,
      identifier: 'priya',
      password: 'pw',
      deviceName: 'Test',
      platform: 'ios',
      appVersion: '2.0.0',
    });
    expect(result.ok).toBe(false);
    expect('network' in result && result.network).toBe(true);
  });

  test('426 — stores CONTRACT_BLOCK and returns EDGE_CONTRACT_UNSUPPORTED', async () => {
    mockFetch('errors.contract-unsupported');
    (require('../lib/secureStore').get as jest.Mock).mockImplementation(async (k: string) => {
      if (k === 'device_id') return '01927c4a-0000-7000-8000-000000000001';
      if (k === 'capabilities_fetched_at') return null;
      return null;
    });
    const result = await capabilities(BASE);
    expect(result.ok).toBe(false);
    if (result.ok || 'network' in result) return;
    expect(result.error.code).toBe('EDGE_CONTRACT_UNSUPPORTED');
    expect(result.error.status).toBe(426);
    const setMock = require('../lib/secureStore').set as jest.Mock;
    const contractBlockCall = setMock.mock.calls.find((c: string[]) => c[0] === 'contract_block');
    expect(contractBlockCall).toBeTruthy();
  });
});

describe('capabilities', () => {
  test('shape includes required fields', async () => {
    (require('../lib/secureStore').get as jest.Mock).mockImplementation(async (k: string) => {
      if (k === 'device_id') return '01927c4a-0000-7000-8000-000000000001';
      if (k === 'capabilities_fetched_at') return null;
      return null;
    });
    const capFix = fixtureByName('capabilities');
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => capFix.response.body,
      headers: { get: () => null },
    });
    const result = await capabilities(BASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.contract_version).toBe(1);
    expect(Array.isArray(result.body.record_types)).toBe(true);
    expect(result.body.session.absolute_seconds).toBeGreaterThan(0);
  });
});
