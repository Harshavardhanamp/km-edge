/**
 * Fails if any fixture file has drifted from the pinned MANIFEST.sha256.
 * Run this whenever GKS contract fixtures are updated to catch breaks early.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// v1 stays pinned until contract v1 is retired; v2 is KK-2.2 E2 (manifest shipped by GKS).
const VERSIONS = ['v1', 'v2'];

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe.each(VERSIONS)('edge-sync %s fixtures', version => {
const FIXTURE_DIR = path.join(__dirname, `../test/fixtures/edge-sync/${version}`);
const MANIFEST = path.join(FIXTURE_DIR, 'MANIFEST.sha256');

test('fixture files match MANIFEST.sha256', () => {
  const manifest = fs.readFileSync(MANIFEST, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [hash, ...rest] = line.split('  ');
      return { hash, file: rest.join('  ') };
    });

  expect(manifest.length).toBeGreaterThan(0);

  for (const { hash, file } of manifest) {
    const fullPath = path.join(FIXTURE_DIR, file);
    expect(fs.existsSync(fullPath)).toBe(true);
    const actual = sha256File(fullPath);
    expect(actual).toBe(hash);
  }
});

test('no fixture files missing from MANIFEST.sha256', () => {
  const manifestFiles = new Set(
    fs.readFileSync(MANIFEST, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => line.split('  ').slice(1).join('  '))
  );

  function walk(dir: string, base: string): string[] {
    return fs.readdirSync(dir).flatMap(f => {
      const full = path.join(dir, f);
      const rel = path.join(base, f).replace(/\\/g, '/');
      return fs.statSync(full).isDirectory() ? walk(full, rel) : [rel];
    });
  }

  const allFiles = walk(FIXTURE_DIR, '').filter(f => f !== 'MANIFEST.sha256');
  for (const f of allFiles) {
    expect(manifestFiles.has(f)).toBe(true);
  }
});
});
