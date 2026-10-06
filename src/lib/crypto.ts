import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

export async function sha256String(content: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/** Decode standard base64 to bytes (no atob dependency, so it behaves the same in Hermes and Jest). */
export function base64ToBytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0, bits = 0, out = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, out);
}

/**
 * SHA-256 of the file's raw bytes, as GKS recomputes it (contract §6).
 * V1 hashed the base64 text instead; uploads recompute with this so legacy rows still verify.
 * ponytail: reads the whole file into memory (base64 + bytes, ~2.3x the file size, max 50 MB files);
 * stream through a native digest if larger attachments are ever allowed.
 */
export async function sha256File(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, base64ToBytes(base64));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
