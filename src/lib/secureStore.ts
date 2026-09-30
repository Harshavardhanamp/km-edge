import * as SecureStore from 'expo-secure-store';

export const KEYS = {
  GKS_SERVER_URL: 'gks_server_url',
  GKS_USERNAME: 'gks_username',
  GKS_PASSWORD_ENC: 'gks_password_enc',
  OFFLINE_VERIFIER: 'offline_verifier',
  OFFLINE_VERIFIER_SALT: 'offline_verifier_salt',
  OFFLINE_ATTEMPT_COUNT: 'offline_attempt_count',
  CALENDAR_SELECTED_IDS: 'calendar_selected_ids', // preference, not cleared on logout
  GKS_USER_ID: 'gks_user_id',
  LAST_SYNCED_AT: 'last_synced_at',
  GKS_SYNCED_COUNT: 'gks_synced_count',
} as const;

// Keys read by background fetch tasks (expo-background-fetch fires before first
// unlock after reboot on iOS). AFTER_FIRST_UNLOCK allows access once the device
// has been unlocked at least once — the right trade-off for background sync
// credentials. All other keys keep the default WHEN_UNLOCKED.
const BG_ACCESSIBLE_KEYS = new Set<string>([
  KEYS.GKS_SERVER_URL,
  KEYS.GKS_USERNAME,
  KEYS.GKS_PASSWORD_ENC,
  KEYS.GKS_USER_ID,
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

export async function clearSession(): Promise<void> {
  await Promise.all([
    remove(KEYS.GKS_USERNAME),
    remove(KEYS.GKS_USER_ID),
    remove(KEYS.GKS_PASSWORD_ENC),
    remove(KEYS.OFFLINE_VERIFIER),
    remove(KEYS.OFFLINE_VERIFIER_SALT),
    remove(KEYS.OFFLINE_ATTEMPT_COUNT),
  ]);
}
