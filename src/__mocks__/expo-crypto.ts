import { createHash, randomUUID } from 'crypto';

export async function digestStringAsync(
  _algorithm: string,
  data: string,
): Promise<string> {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export { randomUUID };
