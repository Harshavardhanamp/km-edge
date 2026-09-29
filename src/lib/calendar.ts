import * as Calendar from 'expo-calendar';

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  isAllDay: boolean;
}

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function getUpcomingEvents(days = 7): Promise<CalendarEvent[]> {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status !== 'granted') return [];

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const ids = calendars.map((c) => c.id);
    if (ids.length === 0) return [];

    const start = new Date();
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const events = await Calendar.getEventsAsync(ids, start, end);
    return events
      .filter((e) => !e.allDay || e.title)
      .map((e) => ({
        id: e.id,
        title: e.title ?? '(no title)',
        startDate: new Date(e.startDate),
        isAllDay: e.allDay ?? false,
      }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, 3);
  } catch {
    return [];
  }
}
