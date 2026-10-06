/** K7 DoD: the V1 GKS password is removed from the device on first launch after upgrade (REQ-0013 C7). */
import { getItemAsync, setItemAsync, __reset } from 'expo-secure-store';
import { purgeLegacySecrets, KEYS, set, get } from '../lib/secureStore';

beforeEach(() => __reset());

test('removes the V1 encrypted password and keeps everything else', async () => {
  await setItemAsync('gks_password_enc', 'v1-ciphertext');
  await set(KEYS.DEVICE_ID, 'dev-1');
  await set(KEYS.EDGE_TOKEN, 'tok');
  await set(KEYS.OFFLINE_VERIFIER, 'verifier');
  await purgeLegacySecrets();
  expect(await getItemAsync('gks_password_enc')).toBeNull();
  expect(await get(KEYS.DEVICE_ID)).toBe('dev-1');
  expect(await get(KEYS.EDGE_TOKEN)).toBe('tok');
  expect(await get(KEYS.OFFLINE_VERIFIER)).toBe('verifier');
});

test('is a no-op on a fresh install and safe to repeat', async () => {
  await purgeLegacySecrets();
  await purgeLegacySecrets();
  expect(await getItemAsync('gks_password_enc')).toBeNull();
});

test('no V2 key reuses a legacy secret key name', () => {
  expect(Object.values(KEYS)).not.toContain('gks_password_enc');
});
