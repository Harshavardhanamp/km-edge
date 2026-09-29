import * as SecureStore from 'expo-secure-store';

export const KEYS = {
  GKS_SERVER_URL: 'gks_server_url',
  GKS_USERNAME: 'gks_username',
  GKS_PASSWORD_ENC: 'gks_password_enc',
  OFFLINE_VERIFIER: 'offline_verifier',
  OFFLINE_VERIFIER_SALT: 'offline_verifier_salt',
  OFFLINE_ATTEMPT_COUNT: 'offline_attempt_count',
} as const;

export async function get(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function set(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function remove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    remove(KEYS.GKS_USERNAME),
    remove(KEYS.GKS_PASSWORD_ENC),
    remove(KEYS.OFFLINE_VERIFIER),
    remove(KEYS.OFFLINE_VERIFIER_SALT),
    remove(KEYS.OFFLINE_ATTEMPT_COUNT),
  ]);
}
