import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

export async function sha256String(content: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export async function sha256File(uri: string): Promise<string> {
  // ponytail: hashes the base64 encoding of the file, not raw bytes — close enough for
  // dedup/integrity checks in V1. Upgrade path: native module reading raw bytes.
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return sha256String(base64);
}
