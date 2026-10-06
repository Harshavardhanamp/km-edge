import { createHash, randomUUID } from 'crypto';

export async function digestStringAsync(
  _algorithm: string,
  data: string,
): Promise<string> {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export async function digest(_algorithm: string, data: Uint8Array): Promise<ArrayBuffer> {
  const out = createHash('sha256').update(Buffer.from(data)).digest();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export const CryptoEncoding = { HEX: 'hex', BASE64: 'base64' };

export { randomUUID };
