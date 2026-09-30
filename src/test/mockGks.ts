/**
 * In-process mock GKS server for K1+ unit tests.
 * Loads fixtures from src/test/fixtures/edge-sync/v1/ and serves
 * matching responses by (method, path) lookup.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface Fixture {
  name: string;
  request: { method: string; path: string; headers?: Record<string, string>; body?: unknown };
  response: { status: number; body: unknown };
  preconditions: string[];
}

const FIXTURE_DIR = path.join(__dirname, 'fixtures/edge-sync/v1');

function loadFixtures(subdir: string): Fixture[] {
  const dir = path.join(FIXTURE_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Fixture);
}

export const fixtures = {
  capabilities: JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'capabilities.json'), 'utf8')) as Fixture,
  auth: loadFixtures('auth'),
  records: loadFixtures('records'),
  attachments: loadFixtures('attachments'),
  telemetry: loadFixtures('telemetry'),
  errors: loadFixtures('errors'),
};

export function fixtureByName(name: string): Fixture {
  const all = [
    fixtures.capabilities,
    ...fixtures.auth,
    ...fixtures.records,
    ...fixtures.attachments,
    ...fixtures.telemetry,
    ...fixtures.errors,
  ];
  const f = all.find(x => x.name === name);
  if (!f) throw new Error(`No fixture named "${name}"`);
  return f;
}

/** Minimal stateful mock: call respond() with a fixture name to get the canned response. */
export function respond(fixtureName: string): { status: number; body: unknown } {
  const f = fixtureByName(fixtureName);
  return f.response;
}
