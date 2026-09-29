import { argon2id } from 'hash-wasm';
import * as Crypto from 'expo-crypto';

const ARGON2_PARAMS = {
  timeCost: 3,
  memorySizeMB: 64,
  parallelism: 1,
  hashLength: 32,
  outputType: 'encoded',
} as const;

export async function generateSalt(): Promise<string> {
  const bytes = Crypto.getRandomBytes(16);
  return Buffer.from(bytes).toString('hex');
}

export async function deriveVerifier(password: string, salt: string): Promise<string> {
  return argon2id({
    password,
    salt,
    ...ARGON2_PARAMS,
  });
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const derived = await deriveVerifier(password, salt);
  return derived === storedHash;
}
