import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import StatusDot from '../components/StatusDot';
import TypePickerSheet from '../components/TypePickerSheet';
import { getRecentRecords } from '../lib/db/recordStore';
import { getUpcomingEvents, requestCalendarPermission, type CalendarEvent } from '../lib/calendar';
import { KEYS, get } from '../lib/secureStore';
import { useScreenTracking } from '../lib/useScreenTracking';
import { CAPTURE_TYPES, type CaptureKind, type EdgeRecord, type RecordType } from '../lib/types';

export default function HomeScreen({ navigation }: any) {
  useScreenTracking('HomeScreen');

  const [displayName, setDisplayName] = useState('');
  const [recentRecords, setRecentRecords] = useState<EdgeRecord[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [gksSyncedCount, setGksSyncedCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      get(KEYS.GKS_USERNAME).then((u) => setDisplayName(u ?? ''));
      setRecentRecords(getRecentRecords(5));
      requestCalendarPermission().then((granted) => {
        if (granted) getUpcomingEvents(7).then(setUpcomingEvents);
      });
      get(KEYS.LAST_SYNCED_AT).then(v => setLastSyncedAt(v));
      get(KEYS.GKS_SYNCED_COUNT).then(v => setGksSyncedCount(v ? parseInt(v, 10) : null));
    }, [])
  );

  function handleTypeSelect(type: RecordType, captureKind: CaptureKind) {
    setShowTypePicker(false);
    navigation.navigate('Capture', { recordType: type, captureKind });
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.displayName}>👤 {displayName}</Text>
        <View style={styles.headerRight}>
          <StatusDot />
          <Text style={styles.syncLabel}>
            {lastSyncedAt ? `Last synced ${relTime(lastSyncedAt)}` : 'Never synced'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Capture button */}
        <TouchableOpacity
          style={styles.captureBtn}
          onPress={() => setShowTypePicker(true)}
        >
          <Text style={styles.captureBtnText}>+ New Record</Text>
        </TouchableOpacity>

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingEvents.map((ev) => (
              <View key={ev.nativeId} style={styles.eventRow}>
                <Text style={styles.eventDate}>{formatEventDate(ev)}</Text>
                <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => navigation.navigate('Calendar')}>
              <Text style={styles.seeAll}>See calendar →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recent records */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {recentRecords.length === 0 ? (
            <Text style={styles.empty}>No records yet. Tap "+ New Record" to start.</Text>
          ) : (
            recentRecords.map((r) => {
              const ct = CAPTURE_TYPES.find((c) => c.capture_kind === r.capture_kind);
              return (
                <TouchableOpacity
                  key={r.edge_id}
                  style={styles.recordRow}
                  onPress={() => navigation.navigate('RecordDetail', { edge_id: r.edge_id })}
                >
                  <Text style={styles.recordIcon}>{ct?.icon ?? '📝'}</Text>
                  <Text style={styles.recordTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.recordTime}>{relTime(r.captured_at)}</Text>
                </TouchableOpacity>
              );
            })
          )}
          {recentRecords.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Records')}>
              <Text style={styles.seeAll}>See all records →</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <TypePickerSheet
        visible={showTypePicker}
        onSelect={handleTypeSelect}
        onDismiss={() => setShowTypePicker(false)}
      />
    </View>
  );
}

function formatEventDate(ev: CalendarEvent): string {
  const now = new Date();
  const d = ev.startDate;
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const day = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
    : d.toLocaleDateString('en', { weekday: 'short' });
  if (ev.isAllDay) return day;
  const time = d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  displayName: { fontSize: 15, fontWeight: '600', color: colors.text },
  headerRight: { alignItems: 'flex-end' },
  syncLabel: { fontSize: 12, color: '#7A6A5A', marginTop: 2, marginBottom: 4 },
  scroll: { flex: 1 },
  captureBtn: {
    margin: 20,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
  },
  captureBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  eventDate: { fontSize: 12, color: '#7A6A5A', width: 90 },
  eventTitle: { fontSize: 14, color: colors.text, flex: 1 },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  recordIcon: { fontSize: 20 },
  recordTitle: { flex: 1, fontSize: 14, color: colors.text },
  recordTime: { fontSize: 12, color: '#A09080' },
  seeAll: { fontSize: 13, color: colors.accent, marginTop: 12 },
  empty: { fontSize: 14, color: '#A09080', paddingVertical: 8 },
});
