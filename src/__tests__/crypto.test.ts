/** Contract §6: attachment hashes are SHA-256 of the raw file bytes, as GKS recomputes them. */
import { createHash } from 'crypto';
import { base64ToBytes, sha256File, sha256String } from '../lib/crypto';
import { __reset, __setFileBase64 } from 'expo-file-system/legacy';

beforeEach(() => __reset());

const rawSha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('base64ToBytes decodes padded, unpadded and binary input', () => {
  expect(Buffer.from(base64ToBytes('aGVsbG8=')).toString()).toBe('hello');
  expect(Buffer.from(base64ToBytes('aGVsbG8')).toString()).toBe('hello');
  const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  expect(Buffer.from(base64ToBytes(binary.toString('base64')))).toEqual(binary);
  expect(base64ToBytes('')).toHaveLength(0);
});

test('sha256File hashes the raw bytes, not the base64 text', async () => {
  const jpeg = Buffer.from('ffd8ffe04b4d2d456467652050362066697874757265206a70656720626f6479', 'hex'); // fixture upload.ok bytes
  __setFileBase64('/mock-docs/a.jpg', jpeg.toString('base64'));
  const sha = await sha256File('/mock-docs/a.jpg');
  expect(sha).toBe(rawSha(jpeg));
  expect(sha).toBe('8c5603edb20b3f5123d241cec8032a643a6097a74dd44c8510fa9e77c026cb59'); // contracts/edge-sync/v1/attachments/upload.ok.json
  expect(sha).not.toBe(await sha256String(jpeg.toString('base64'))); // the V1 scheme
});
