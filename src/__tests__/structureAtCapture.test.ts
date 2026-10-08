/**
 * KK-2.2 Packet E2 — structure at capture on contract v2 (GKS docs/design/KK-EDGE-STRUCTURE-AT-CAPTURE-DESIGN.md).
 * In-memory SQLite + SecureStore mocks; fetch mocked with the pinned v2 fixtures.
 */
import { resetDb } from './helpers/setupDb';
import { db } from '../lib/db/index';
import { __reset as resetSecureStore, setItemAsync } from 'expo-secure-store';
import { v2Fixture } from '../test/mockGks';
import { clearIdentities, exactIdentities, identityCount, replaceIdentities, searchIdentities } from '../lib/db/identityCache';
import { clearCaptureDraft, loadCaptureDraft, saveCaptureDraft } from '../lib/db/captureDraft';
import { refreshIdentityCache } from '../lib/sync/identityRefresh';
import { pendingToResolution } from '../lib/sync/syncEngine';
import { buildEnvelope } from '../lib/sync/envelope';
import { createRecord, getRecord, setResolution } from '../lib/db/recordStore';
import { suggest } from '../lib/gksClient';
import { EDGE_CONTRACT_VERSION, EDGE_ERROR_CATALOGUE, type SuggestResponse } from '../lib/contract';
import {
  applySuggestion, buildStructure, confirmBlockers, deadlinePassed, edit, newCard, pendingChips, statusLine, SUMMARY_MIN_CHARS,
} from '../lib/capture/reviewCard';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

beforeEach(async () => {
  resetDb();
  resetSecureStore();
  await setItemAsync('edge_token', 'test-token-001');
  await setItemAsync('device_id', 'DEV-E2');
});
afterEach(() => jest.restoreAllMocks());

const suggestion = (over: Partial<SuggestResponse> = {}): SuggestResponse => ({
  contract_version: 2, title: 'Movie night', summary: null, type: 'EVENT', importance: 'HIGH',
  topics: [{ identity_id: 'TOPIC-000001' }, { proposed_name: 'Movies' }], people: [{ identity_id: 'PER-000001' }], place: null,
  dates: [{ phrase: '15th March', needs_year: true, group_id: 'yearless-1', date: null }], generated: true, ...over,
});

describe('contract v2 basics', () => {
  test('the phone speaks contract v2 and knows the v2 error code', () => {
    expect(EDGE_CONTRACT_VERSION).toBe(2);
    expect(EDGE_ERROR_CATALOGUE).toContain('EDGE_IDENTITY_NOT_FOUND');
  });

  test('migration 006 adds structure columns, the identity cache and the draft table', () => {
    const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(records)`).map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining(['structure_json', 'resolution_json']));
    const tables = db.getAllSync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`).map(t => t.name);
    expect(tables).toEqual(expect.arrayContaining(['identity_cache', 'capture_draft']));
  });
});

describe('identity cache (E3)', () => {
  beforeEach(() => replaceIdentities([
    { identity_id: 'TOPIC-1', kind: 'topic', name: 'Family', distinction: null },
    { identity_id: 'TOPIC-2', kind: 'topic', name: 'Family trips', distinction: null },
    { identity_id: 'TOPIC-3', kind: 'topic', name: 'Extended family', distinction: null },
    { identity_id: 'PER-1', kind: 'person', name: 'Priya', distinction: null },
    { identity_id: 'PER-1', kind: 'person', name: 'Pri', distinction: null },
  ]));

  test('search puts prefix matches first and shows one row per identity', () => {
    expect(searchIdentities('topic', 'fam').map(r => r.identity_id)).toEqual(['TOPIC-1', 'TOPIC-2', 'TOPIC-3']);
    expect(searchIdentities('person', 'pri').map(r => r.identity_id)).toEqual(['PER-1']);
    expect(exactIdentities('person', 'PRI')).toHaveLength(1);
    expect(identityCount()).toBe(4);
  });

  test('sign-out clears it', () => {
    clearIdentities();
    expect(identityCount()).toBe(0);
  });

  test('refresh pages until next is null, then replaces the cache (fixtures page.first → page.last)', async () => {
    const first = v2Fixture('identities/page.first').response.body as any;
    const last = v2Fixture('identities/page.last').response.body as any;
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any) => json(String(url).includes('after=') ? last : first));
    expect(await refreshIdentityCache('https://gks.test', 3)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`after=${encodeURIComponent(first.next)}`);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Edge-Contract-Version']).toBe('2');
    expect(identityCount()).toBeGreaterThan(0);
  });

  test('a failed refresh keeps the previous cache', async () => {
    jest.spyOn(global, 'fetch' as any).mockImplementation(async () => json({ error: { code: 'EDGE_SERVER_ERROR', message: 'x', details: {} } }, 500));
    expect(await refreshIdentityCache('https://gks.test')).toBe(false);
    expect(identityCount()).toBe(4);
  });
});

describe('review card (E1, E2, E4)', () => {
  test('offline: the card says so and Confirm needs a topic, person or place (E-AC1, E-AC5)', () => {
    let card = newCard('Walk by the lake', false);
    expect(statusLine(card.suggestionState)).toBe('Offline: suggestions unavailable. Your choices will sync later.');
    expect(card.title).toBe('Walk by the lake');
    expect(confirmBlockers(card)).toEqual(['Add at least one topic, person or place so this can be found later.']);
    card = { ...card, people: [{ identity_id: 'PER-1', label: 'Priya' }] };
    expect(confirmBlockers(card)).toEqual([]);
  });

  test('a typed name that is not cached is a label, never an identity (E-AC2, E8.4)', () => {
    const card = { ...newCard('Trip', false), topics: [{ label: 'Mysuru trip' }] };
    expect(buildStructure(card).topics).toEqual([{ label: 'Mysuru trip' }]);
    expect(buildStructure(card).origins.topics).toBe('human');
  });

  test('no answer in 3 s: "taking a while"; the model is down: "unavailable" (E-AC4)', () => {
    let card = deadlinePassed(newCard('x', true));
    expect(statusLine(card.suggestionState)).toBe('Suggestions are taking a while — you can continue, or wait.');
    card = applySuggestion(card, null);
    expect(statusLine(card.suggestionState)).toBe('Suggestions unavailable right now.');
    expect(confirmBlockers({ ...card, place: { label: 'Home' } })).toEqual([]);
  });

  test('late suggestions fill only untouched fields; detected dates need a year', () => {
    let card = edit(newCard('Movie with Priya on 15th March', true), 'title', 'My own title');
    card = applySuggestion(card, suggestion());
    expect(card.title).toBe('My own title');
    expect(card.type).toBe('EVENT');
    expect(card.importance).toBe('HIGH');
    expect(card.summary).toBe('');                                  // short body: no summary
    expect(card.yearGroups).toEqual([{ group_id: 'yearless-1', phrases: ['15th March'] }]);
    card = { ...card, topics: [{ identity_id: 'TOPIC-1', label: 'Family' }] };
    expect(confirmBlockers(card)).toEqual(['Add the year for each date.']);
    expect(confirmBlockers({ ...card, years: { 'yearless-1': '2027' } })).toEqual([]);
  });

  test('a long body takes the suggested summary', () => {
    const card = applySuggestion(newCard('x'.repeat(SUMMARY_MIN_CHARS), true), suggestion({ summary: 'A short summary.' }));
    expect(card.summary).toBe('A short summary.');
  });

  test('accepting every suggestion records accepted origins (E-AC3)', () => {
    let card = applySuggestion(newCard('Movie with Priya on 15th March', true), suggestion());
    card = { ...card, topics: [{ identity_id: 'TOPIC-000001', label: 'Family', fromSuggestion: true }, { label: 'Movies', fromSuggestion: true }],
             people: [{ identity_id: 'PER-000001', label: 'Priya', fromSuggestion: true }], years: { 'yearless-1': '2027' } };
    const structure = buildStructure(card);
    expect(structure.origins).toEqual({ title: 'accepted_ai_suggestion', type: 'accepted_ai_suggestion', importance: 'accepted_ai_suggestion',
                                         topics: 'accepted_ai_suggestion', people: 'accepted_ai_suggestion', dates: 'human' });
    expect(structure.dates).toEqual([{ group_id: 'yearless-1', year: 2027, phrase: '15th March' }]);
    expect(structure.topics).toEqual([{ identity_id: 'TOPIC-000001', label: 'Family' }, { label: 'Movies' }]);
  });

  test('suggested chips say Use existing or Create and drop out once chosen', () => {
    const names: Record<string, string> = { 'TOPIC-000001': 'Family' };
    const chips = pendingChips(suggestion().topics, [], id => names[id] ?? null);
    expect(chips).toEqual([{ identity_id: 'TOPIC-000001', label: 'Family', existing: true }, { label: 'Movies', existing: false }]);
    expect(pendingChips(suggestion().topics, [{ identity_id: 'TOPIC-000001', label: 'Family' }], id => names[id] ?? null)).toHaveLength(1);
  });
});

describe('draft (E-D1)', () => {
  test('saved, reopened and cleared', () => {
    expect(loadCaptureDraft()).toBeNull();
    saveCaptureDraft({ step: 'review', content: 'Half done' });
    saveCaptureDraft({ step: 'review', content: 'Half done, edited' });
    expect(loadCaptureDraft()).toEqual({ step: 'review', content: 'Half done, edited' });
    clearCaptureDraft();
    expect(loadCaptureDraft()).toBeNull();
  });
});

describe('records and sync (E5)', () => {
  const base = {
    edge_id: 'e2-1', gks_id: null, schema_version: 1 as const, type: 'KNOWLEDGE' as const, capture_kind: 'JOURNAL' as const,
    title: 'Movie night', content: 'Movie night', created: '2026-10-08', author: 'human' as const, classification: 'NORMAL' as const,
    importance: 'NORMAL' as const, tags: ['Family'], life_areas: [], place: null, about: [], relationships: [], captured_at: '2026-10-08T09:00:00Z',
    sync_status: 'PENDING' as const, sync_error: null, content_sha256: 'abc',
  };

  test('the v2 envelope carries structure and origins; a pre-v2 record does not', () => {
    const structure = { summary: null, topics: [{ identity_id: 'TOPIC-1', label: 'Family' }], people: [{ label: 'Ravi' }], place: { label: 'Mysuru' },
                        dates: [{ date: '2027-03-20' }], origins: { title: 'human' as const, topics: 'accepted_ai_suggestion' as const } };
    const env = buildEnvelope({ ...base, attachments: [], structure });
    expect(env).toMatchObject({ topics: structure.topics, people: structure.people, place: structure.place, dates: structure.dates,
                                title_origin: 'human', topics_origin: 'accepted_ai_suggestion' });
    expect(Object.keys(buildEnvelope({ ...base, attachments: [] }))).not.toContain('topics');
  });

  test('structure and the server resolution list are stored on the record', () => {
    createRecord({ ...base, structure: { summary: 'S', topics: [{ label: 'School' }], people: [], place: null, dates: [], origins: {} } });
    const fixture = v2Fixture('records/create.structured.pending').response.body as { resolution: any[] };
    setResolution('e2-1', fixture.resolution);
    const stored = getRecord('e2-1')!;
    expect(stored.structure?.topics).toEqual([{ label: 'School' }]);
    expect(stored.resolution?.map(r => r.label)).toEqual(expect.arrayContaining(['School', 'Ravi', 'Mysuru']));
  });

  test('sync-status pending names become the record\'s waiting list', () => {
    expect(pendingToResolution({ topics: ['School'], people: ['Ravi'], place: 'Mysuru', dates: ['15th March'] }).map(r => `${r.field}:${r.label}`))
      .toEqual(['topics:School', 'people:Ravi', 'place:Mysuru', 'dates:15th March']);
    expect(pendingToResolution({ topics: [], people: [], place: null, dates: [] })).toEqual([]);
  });

  test('suggest parses the fixture and reports a missing model as generated false (E4)', async () => {
    const ok = v2Fixture('suggest/ok').response.body;
    jest.spyOn(global, 'fetch' as any).mockImplementation(async () => json(ok));
    const result = await suggest('https://gks.test', 'Movie night with Priya and Ravi on 15th March');
    expect(result.ok && result.body.topics.length).toBeGreaterThan(0);
    jest.spyOn(global, 'fetch' as any).mockImplementation(async () => json(v2Fixture('suggest/unavailable').response.body));
    const down = await suggest('https://gks.test', 'A quiet day');
    expect(down.ok && down.body.generated).toBe(false);
  });

  test('v2 errors arrive in the envelope and are read by code', async () => {
    jest.spyOn(global, 'fetch' as any).mockImplementation(async () => json(v2Fixture('records/create.structure-required').response.body, 422));
    const { createRecord: post } = await import('../lib/gksClient');
    const result = await post('https://gks.test', {});
    expect(!result.ok && 'error' in result && result.error.code).toBe('EDGE_VALIDATION');
  });
});
