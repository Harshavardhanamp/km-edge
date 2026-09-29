import { Linking } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getEventsForDay,
  getEventsForMonth,
  requestCalendarPermission,
  type CalendarEvent,
} from '../lib/calendar';
import { useScreenTracking } from '../lib/useScreenTracking';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function CalendarScreen({ navigation }: any) {
  useScreenTracking('CalendarScreen');

  const today = new Date();
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [monthEvents, setMonthEvents] = useState<CalendarEvent[]>([]);
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    (async () => {
      const granted = await requestCalendarPermission();
      setPermitted(granted);
    })();
  }, []);

  useEffect(() => {
    if (!permitted) return;
    getEventsForMonth(year, month).then(setMonthEvents);
  }, [year, month, permitted]);

  useEffect(() => {
    if (!permitted) return;
    getEventsForDay(selectedDate).then(setDayEvents);
  }, [selectedDate, permitted]);

  const daysWithEvents = useMemo(() => {
    const set = new Set<string>();
    monthEvents.forEach((e) => set.add(isoDate(e.startDate)));
    return set;
  }, [monthEvents]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  // Build grid: days in month, padded so week starts Monday
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const padStart = (firstDay + 6) % 7; // shift so Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  if (permitted === null) return null; // loading

  if (!permitted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>Calendar access needed</Text>
        <Text style={styles.permBody}>KM-Edge needs calendar access to show your events.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => Linking.openSettings()}>
          <Text style={styles.btnText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Month navigation */}
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.arrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.weekRow}>
        {DAYS.map((d) => (
          <Text key={d} style={styles.weekDay}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {Array.from({ length: padStart }).map((_, i) => (
          <View key={`pad-${i}`} style={styles.cell} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(year, month, day);
          const iso = isoDate(date);
          const isToday = iso === isoDate(today);
          const isSelected = iso === isoDate(selectedDate);
          const hasEvent = daysWithEvents.has(iso);
          return (
            <TouchableOpacity
              key={day}
              style={[styles.cell, isSelected && styles.cellSelected]}
              onPress={() => setSelectedDate(date)}
            >
              <Text style={[styles.cellText, isToday && styles.cellToday, isSelected && styles.cellTextSelected]}>
                {day}
              </Text>
              {hasEvent && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected day */}
      <Text style={styles.dayHeader}>
        {selectedDate.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>

      <ScrollView style={styles.eventList}>
        {dayEvents.length === 0 ? (
          <Text style={styles.noEvents}>No events</Text>
        ) : (
          dayEvents.map((ev) => (
            <TouchableOpacity
              key={ev.nativeId}
              style={styles.eventRow}
              onPress={() => {
                if (ev.kmEdgeRecordId) {
                  navigation.navigate('RecordDetail', { edge_id: ev.kmEdgeRecordId });
                } else {
                  Linking.openURL('calshow://'); // opens native calendar
                }
              }}
            >
              <View style={[styles.colorDot, { backgroundColor: ev.calendarColor }]} />
              <View style={styles.eventInfo}>
                <Text style={styles.eventTime}>
                  {ev.isAllDay ? 'All day' : ev.startDate.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
              </View>
              {ev.kmEdgeRecordId && (
                <View style={styles.kmBadge}>
                  <Text style={styles.kmBadgeText}>KM</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  permTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  permBody: { fontSize: 14, color: '#7A6A5A', textAlign: 'center' },
  btn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 28 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  arrow: { fontSize: 20, color: colors.accent, paddingHorizontal: 8 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: colors.text },
  weekRow: { flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, color: '#7A6A5A', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSelected: { backgroundColor: colors.accent, borderRadius: 100 },
  cellText: { fontSize: 14, color: colors.text },
  cellToday: { fontWeight: '700', color: colors.accent },
  cellTextSelected: { color: '#FFF', fontWeight: '700' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginTop: 2 },
  dotSelected: { backgroundColor: '#FFF' },
  dayHeader: { fontSize: 14, fontWeight: '600', color: colors.text, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border },
  eventList: { flex: 1, paddingHorizontal: 16 },
  noEvents: { fontSize: 13, color: '#A09080', paddingVertical: 16 },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, gap: 10 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  eventInfo: { flex: 1 },
  eventTime: { fontSize: 11, color: '#7A6A5A' },
  eventTitle: { fontSize: 14, color: colors.text },
  kmBadge: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  kmBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
});
