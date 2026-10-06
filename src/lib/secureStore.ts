import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export const KEYS = {
  // Server / discovery
  GKS_SERVER_URL: 'gks_server_url',
  CAPABILITIES_JSON: 'capabilities_json',
  CAPABILITIES_FETCHED_AT: 'capabilities_fetched_at',
  CONTRACT_BLOCK: 'contract_block',

  // Device identity — set once on first launch, never cleared on logout
  DEVICE_ID: 'device_id',
  DEVICE_NAME: 'device_name',

  // Auth
  GKS_USERNAME: 'gks_username',
  GKS_USER_ID: 'gks_user_id',
  EDGE_TOKEN: 'edge_token',
  EDGE_TOKEN_EXPIRES_AT: 'edge_token_expires_at',

  // Offline fallback — kept across logout so user can still enter offline mode
  OFFLINE_VERIFIER: 'offline_verifier',
  OFFLINE_VERIFIER_SALT: 'offline_verifier_salt',
  OFFLINE_ATTEMPT_COUNT: 'offline_attempt_count',

  // Sync state
  LAST_SYNCED_AT: 'last_synced_at',
  GKS_SYNCED_COUNT: 'gks_synced_count',

  // Preferences — never cleared
  CALENDAR_SELECTED_IDS: 'calendar_selected_ids',
} as const;

// Keys read by background fetch tasks — need AFTER_FIRST_UNLOCK so background
// sync can run once the device has been unlocked at least once after a reboot.
const BG_ACCESSIBLE_KEYS = new Set<string>([
  KEYS.GKS_SERVER_URL,
  KEYS.DEVICE_ID,
  KEYS.DEVICE_NAME,
  KEYS.GKS_USERNAME,
  KEYS.GKS_USER_ID,
  KEYS.EDGE_TOKEN,
  KEYS.EDGE_TOKEN_EXPIRES_AT,
]);

function opts(key: string): SecureStore.SecureStoreOptions | undefined {
  return BG_ACCESSIBLE_KEYS.has(key)
    ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }
    : undefined;
}

export async function get(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, opts(key));
}

export async function set(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, opts(key));
}

export async function remove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

/**
 * Secrets earlier versions stored and V2 must not keep (REQ-0013 C7: no password on the device).
 * V1 kept the GKS password encrypted under this key; ADR-0012 replaced it with a bearer token.
 */
export const LEGACY_SECRET_KEYS = ['gks_password_enc'] as const;

/** Run on every launch; deleting a missing key is a no-op, so this is idempotent. */
export async function purgeLegacySecrets(): Promise<void> {
  await Promise.all(LEGACY_SECRET_KEYS.map((k) => SecureStore.deleteItemAsync(k).catch(() => {})));
}

/** Generate DEVICE_ID once on first launch; return the existing value thereafter. */
export async function ensureDeviceId(): Promise<string> {
  const existing = await get(KEYS.DEVICE_ID);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await set(KEYS.DEVICE_ID, id);
  return id;
}

/**
 * Clear session credentials only. Device identity, server URL, offline verifier,
 * capabilities cache, and user preferences are deliberately preserved.
 */
export async function clearSession(): Promise<void> {
  await Promise.all([
    remove(KEYS.GKS_USERNAME),
    remove(KEYS.GKS_USER_ID),
    remove(KEYS.EDGE_TOKEN),
    remove(KEYS.EDGE_TOKEN_EXPIRES_AT),
    remove(KEYS.CONTRACT_BLOCK),
  ]);
}
