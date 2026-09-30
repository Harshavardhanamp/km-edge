/**
 * Every error code that appears in the pinned fixtures must be in the map.
 * Every mapped code must have a non-empty sentence (except silent codes).
 */
import * as fs from 'fs';
import * as path from 'path';
import { edgeErrorMap, mapError } from '../lib/errors/edgeErrorMap';

const FIXTURE_DIR = path.join(__dirname, '../test/fixtures/edge-sync/v1');
const SILENT_CODES = new Set(['EDGE_TEST_MODE_ACTIVE', 'EDGE_SERVER_ERROR']);

function collectErrorCodes(dir: string): Set<string> {
  const codes = new Set<string>();
  function walk(d: string) {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!f.endsWith('.json')) continue;
      try {
        const obj = JSON.parse(fs.readFileSync(full, 'utf8'));
        const body = obj.response?.body;
        if (body?.code) codes.add(body.code);
        if (body?.error?.code) codes.add(body.error.code);
      } catch { /* skip malformed */ }
    }
  }
  walk(dir);
  return codes;
}

test('every error code in pinned fixtures is in edgeErrorMap', () => {
  const fixtureCodes = collectErrorCodes(FIXTURE_DIR);
  for (const code of fixtureCodes) {
    // contract_version fields and state fields aren't error codes — skip non-EDGE_ non-known
    if (!code.startsWith('EDGE_') && !['INVALID_LOGIN', 'RATE_LIMITED'].includes(code)) continue;
    expect(edgeErrorMap).toHaveProperty(code);
  }
});

test('non-silent codes have a non-empty sentence', () => {
  for (const [code, entry] of Object.entries(edgeErrorMap)) {
    if (SILENT_CODES.has(code)) continue;
    expect(entry.sentence.length).toBeGreaterThan(0);
  }
});

test('mapError returns a fallback for unknown codes', () => {
  const entry = mapError('UNKNOWN_FUTURE_CODE');
  expect(entry.sentence.length).toBeGreaterThan(0);
  expect(entry.retryable).toBe(false);
});
