import * as Calendar from 'expo-calendar';
import * as SecureStore from './secureStore';
import { KEYS } from './secureStore';

export interface CalendarEvent {
  nativeId: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  isAllDay: boolean;
  calendarId: string;
  calendarColor: string;
  kmEdgeRecordId: string | null;
}

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string;
}

// ── Permissions ──────────────────────────────────────────────────────────────

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function hasPermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === 'granted';
}

// ── Calendar selection (persisted in secure store) ────────────────────────────

export async function getAllCalendars(): Promise<DeviceCalendar[]> {
  if (!(await hasPermission())) return [];
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return cals.map((c) => ({ id: c.id, title: c.title, color: c.color ?? '#888' }));
}

export async function getSelectedCalendarIds(): Promise<string[]> {
  const stored = await SecureStore.get(KEYS.CALENDAR_SELECTED_IDS);
  if (stored) return JSON.parse(stored) as string[];
  // Default: all calendars
  const cals = await getAllCalendars();
  return cals.map((c) => c.id);
}

export async function saveSelectedCalendarIds(ids: string[]): Promise<void> {
  await SecureStore.set(KEYS.CALENDAR_SELECTED_IDS, JSON.stringify(ids));
}

// ── Event fetching ────────────────────────────────────────────────────────────

function mapEvent(e: Calendar.Event, kmEdgeRecordId: string | null = null): CalendarEvent {
  return {
    nativeId: e.id,
    title: e.title ?? '(no title)',
    startDate: new Date(e.startDate),
    endDate: e.endDate ? new Date(e.endDate) : null,
    isAllDay: e.allDay ?? false,
    calendarId: e.calendarId ?? '',
    calendarColor: '#888',
    kmEdgeRecordId,
  };
}

async function fetchEvents(calIds: string[], start: Date, end: Date): Promise<CalendarEvent[]> {
  if (!(await hasPermission()) || calIds.length === 0) return [];
  try {
    const events = await Calendar.getEventsAsync(calIds, start, end);
    return events.map((e) => mapEvent(e));
  } catch {
    return [];
  }
}

export async function getUpcomingEvents(days = 7): Promise<CalendarEvent[]> {
  const ids = await getSelectedCalendarIds();
  const start = new Date();
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const events = await fetchEvents(ids, start, end);
  return events
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .slice(0, 3);
}

export async function getEventsForMonth(year: number, month: number): Promise<CalendarEvent[]> {
  const ids = await getSelectedCalendarIds();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return fetchEvents(ids, start, end);
}

export async function getEventsForDay(date: Date): Promise<CalendarEvent[]> {
  const ids = await getSelectedCalendarIds();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const events = await fetchEvents(ids, start, end);
  return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

// ── Event write operations (for EVENT records with calendar toggle) ───────────

export interface EventRecord {
  title: string;
  startDate: Date;
  endDate?: Date | null;
}

export async function createEvent(
  record: EventRecord,
  reminderMinutes: number | null
): Promise<string> {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  // Prefer default calendar; fallback to first writable
  const writable = cals.find((c) => c.allowsModifications);
  if (!writable) throw new Error('No writable calendar found');

  const details: Calendar.Event = {
    title: record.title,
    startDate: record.startDate,
    endDate: record.endDate ?? new Date(record.startDate.getTime() + 60 * 60 * 1000),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    alarms: reminderMinutes != null
      ? [{ relativeOffset: -reminderMinutes }]
      : [],
  };

  return Calendar.createEventAsync(writable.id, details);
}

export async function updateEvent(
  nativeEventId: string,
  record: EventRecord
): Promise<void> {
  await Calendar.updateEventAsync(nativeEventId, {
    title: record.title,
    startDate: record.startDate,
    endDate: record.endDate ?? new Date(record.startDate.getTime() + 60 * 60 * 1000),
  });
}

export async function deleteEvent(nativeEventId: string): Promise<void> {
  await Calendar.deleteEventAsync(nativeEventId);
}
