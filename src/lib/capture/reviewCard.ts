import type { SuggestResponse, SuggestedIdentity } from '../contract';
import type { CaptureKind, CaptureStructure, DateRef, FieldOrigin, IdentityRef, Importance } from '../types';

// KK-2.2 E1/E2: the phone's review card, as plain data so it can be tested without a device.
// Save → card → Confirm; nothing reaches the server until Confirm, and suggestions are never applied
// on their own (E4.5): they pre-fill untouched fields or appear as chips the human taps.

export const SUGGEST_DEADLINE_MS = 3000;      // E4.2
export const SUMMARY_MIN_CHARS = 300;          // E2 table, same rule as the web (C3.5)

export type CardIdentity = IdentityRef & { fromSuggestion?: boolean };
export type CardField = 'title' | 'summary' | 'type' | 'importance';
export type SuggestionState = 'offline' | 'loading' | 'slow' | 'ready' | 'unavailable';

export interface CardState {
  content: string;
  title: string;
  summary: string;
  type: CaptureKind;
  importance: Importance;
  topics: CardIdentity[];
  people: CardIdentity[];
  place: CardIdentity | null;
  yearGroups: { group_id: string; phrases: string[] }[];   // detected dates that need a year (online)
  years: Record<string, string>;
  manualDates: string[];                                      // YYYY-MM-DD
  touched: CardField[];
  suggestion: SuggestResponse | null;
  suggestionState: SuggestionState;
}

export function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim()) ?? '';
  return line.replace(/[*_~`#>[\]]/g, '').trim().slice(0, 100);
}

export function newCard(content: string, online: boolean, type: CaptureKind = 'JOURNAL'): CardState {
  return {
    content, title: firstLine(content), summary: '', type, importance: 'NORMAL',
    topics: [], people: [], place: null, yearGroups: [], years: {}, manualDates: [], touched: [],
    suggestion: null, suggestionState: online ? 'loading' : 'offline',
  };
}

export function statusLine(state: SuggestionState): string | null {
  if (state === 'offline') return 'Offline: suggestions unavailable. Your choices will sync later.';
  if (state === 'slow') return 'Suggestions are taking a while — you can continue, or wait.';
  if (state === 'unavailable') return 'Suggestions unavailable right now.';
  return null;
}

export function edit(card: CardState, field: CardField, value: string): CardState {
  return { ...card, [field]: value, touched: card.touched.includes(field) ? card.touched : [...card.touched, field] };
}

/** The deadline passed with no answer: the card stays usable and says so. */
export function deadlinePassed(card: CardState): CardState {
  return card.suggestionState === 'loading' ? { ...card, suggestionState: 'slow' } : card;
}

/** A suggestion arrived (on time or late): fill only fields the human has not touched. */
export function applySuggestion(card: CardState, suggestion: SuggestResponse | null): CardState {
  if (!suggestion || !suggestion.generated) {
    return { ...card, suggestion, suggestionState: 'unavailable', yearGroups: yearGroupsFrom(suggestion) };
  }
  const untouched = (field: CardField) => !card.touched.includes(field);
  const type = String(suggestion.type || '').toUpperCase() as CaptureKind;
  return {
    ...card,
    suggestion, suggestionState: 'ready', yearGroups: yearGroupsFrom(suggestion),
    title: untouched('title') && suggestion.title ? suggestion.title : card.title,
    summary: untouched('summary') && card.content.length >= SUMMARY_MIN_CHARS && suggestion.summary ? suggestion.summary : card.summary,
    type: untouched('type') && type ? type : card.type,
    importance: untouched('importance') && suggestion.importance ? suggestion.importance as Importance : card.importance,
  };
}

function yearGroupsFrom(suggestion: SuggestResponse | null): CardState['yearGroups'] {
  const groups = new Map<string, string[]>();
  for (const date of suggestion?.dates ?? []) {
    if (date.needs_year && date.group_id) groups.set(date.group_id, [...(groups.get(date.group_id) ?? []), date.phrase]);
  }
  return [...groups].map(([group_id, phrases]) => ({ group_id, phrases }));
}

/** Suggested chips not yet chosen: an existing identity ("Use existing ✓") or a new name ("Create"). */
export function pendingChips(suggested: SuggestedIdentity[], chosen: CardIdentity[], nameOf: (id: string) => string | null) {
  return suggested
    .map(item => 'identity_id' in item ? { identity_id: item.identity_id, label: nameOf(item.identity_id) ?? item.identity_id, existing: true }
                                       : { label: item.proposed_name, existing: false })
    .filter(chip => !chosen.some(c => (chip.identity_id && c.identity_id === chip.identity_id) || c.label.toLowerCase() === chip.label.toLowerCase()));
}

/** E1.3: Confirm needs a Topic, Person or Place, and a year for every detected date. */
export function confirmBlockers(card: CardState): string[] {
  const out: string[] = [];
  if (!card.topics.length && !card.people.length && !card.place) out.push('Add at least one topic, person or place so this can be found later.');
  if (card.yearGroups.some(g => !/^\d{4}$/.test(card.years[g.group_id] ?? ''))) out.push('Add the year for each date.');
  return out;
}

function listOrigin(items: CardIdentity[], suggested: number): FieldOrigin {
  const kept = items.filter(i => i.fromSuggestion).length;
  if (kept && kept === items.length && kept === suggested) return 'accepted_ai_suggestion';
  return kept ? 'edited_ai_suggestion' : 'human';
}

function scalarOrigin(card: CardState, field: CardField, value: string, suggested: string | null | undefined): FieldOrigin {
  if (!card.suggestion?.generated || !suggested) return 'human';
  if (value.trim() === suggested.trim()) return 'accepted_ai_suggestion';
  return card.touched.includes(field) ? 'edited_ai_suggestion' : 'human';
}

/** What Confirm stores on the record and sends as the contract v2 structure (E5.1). */
export function buildStructure(card: CardState): CaptureStructure {
  const s = card.suggestion;
  const strip = (items: CardIdentity[]): IdentityRef[] => items.map(({ identity_id, label }) => identity_id ? { identity_id, label } : { label });
  const dates: DateRef[] = [
    ...card.yearGroups.map(g => ({ group_id: g.group_id, year: Number(card.years[g.group_id]), phrase: g.phrases[0] })),
    ...card.manualDates.map(date => ({ date })),
  ];
  const origins: CaptureStructure['origins'] = {
    title: scalarOrigin(card, 'title', card.title, s?.title),
    type: scalarOrigin(card, 'type', card.type, s?.type?.toUpperCase()),
    importance: scalarOrigin(card, 'importance', card.importance, s?.importance),
  };
  if (card.summary.trim()) origins.summary = scalarOrigin(card, 'summary', card.summary, s?.summary);
  if (card.topics.length) origins.topics = listOrigin(card.topics, s?.generated ? s.topics.length : 0);
  if (card.people.length) origins.people = listOrigin(card.people, s?.generated ? s.people.length : 0);
  if (card.place) origins.place = listOrigin([card.place], s?.generated && s.place ? 1 : 0);
  if (dates.length) origins.dates = 'human';
  return {
    summary: card.summary.trim() || null,
    topics: strip(card.topics), people: strip(card.people),
    place: card.place ? strip([card.place])[0] : null,
    dates, origins,
  };
}
