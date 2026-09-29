import * as FileSystem from 'expo-file-system';
import { Linking } from 'react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import { db } from '../lib/db/index';
import { getAllCalendars, getSelectedCalendarIds, saveSelectedCalendarIds, requestCalendarPermission, type DeviceCalendar } from '../lib/calendar';
import { KEYS, clearSession, get } from '../lib/secureStore';
import { telemetry } from '../lib/telemetry';
import { useScreenTracking } from '../lib/useScreenTracking';
import { useAuth } from '../context/AuthContext';

export default function SettingsScreen({ navigation }: any) {
  useScreenTracking('SettingsScreen');

  const { userId, logout } = useAuth();
  const [gksUrl, setGksUrl] = useState('');
  const [recordCount, setRecordCount] = useState(0);
  const [usedBytes, setUsedBytes] = useState(0);
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [selectedCalIds, setSelectedCalIds] = useState<string[]>([]);
  const [calPermitted, setCalPermitted] = useState(false);

  useEffect(() => {
    get(KEYS.GKS_SERVER_URL).then((u) => setGksUrl(u ?? ''));
    const row = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM records WHERE is_deleted = 0`);
    setRecordCount(row?.n ?? 0);

    // Compute file-system size of attachment blobs
    const blobDir = `${FileSystem.documentDirectory}attachments`;
    FileSystem.getInfoAsync(blobDir, { size: true }).then((info) => {
      setUsedBytes((info as any).size ?? 0);
    }).catch(() => {});

    // Calendar
    (async () => {
      const { status } = await import('expo-calendar').then(async (cal) => cal.getCalendarPermissionsAsync());
      const permitted = status === 'granted';
      setCalPermitted(permitted);
      if (permitted) {
        const cals = await getAllCalendars();
        setCalendars(cals);
        const sel = await getSelectedCalendarIds();
        setSelectedCalIds(sel);
      }
    })();
  }, []);

  function toggleCalendar(id: string) {
    const next = selectedCalIds.includes(id)
      ? selectedCalIds.filter((s) => s !== id)
      : [...selectedCalIds, id];
    setSelectedCalIds(next);
    saveSelectedCalendarIds(next);
  }

  async function handleLogout() {
    Alert.alert('Log out?', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          telemetry.action('logout');
          await logout();
        },
      },
    ]);
  }

  async function clearAttachmentCache() {
    // Remove blobs for soft-deleted records with no pending delta
    Alert.alert('Clear deleted attachments?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          telemetry.action('attachment_cache_clear');
          // ponytail: full orphan-blob purge is V2 work. In V1 unlinkAttachment already
          // ref-counts and purges on remove — this button is a no-op placeholder.
          Alert.alert('Done', 'Deleted attachment blobs already removed on delete.');
        },
      },
    ]);
  }

  const usedMB = (usedBytes / 1024 / 1024).toFixed(1);

  return (
    <View style={styles.outer}>
    <AppHeader title="Settings" />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* ACCOUNT */}
      <Text style={styles.sectionHeader}>Account</Text>
      <View style={styles.card}>
        <Row label="User" value={userId} />
        <TouchableOpacity style={styles.dangerBtn} onPress={handleLogout}>
          <Text style={styles.dangerBtnText}>Log out</Text>
        </TouchableOpacity>
      </View>

      {/* GKS SERVER */}
      <Text style={styles.sectionHeader}>GKS Server</Text>
      <View style={styles.card}>
        <Row label="URL" value={gksUrl || '—'} />
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('Auth', { screen: 'ServerDiscovery' })}
        >
          <Text style={styles.actionBtnText}>Re-discover server</Text>
        </TouchableOpacity>
      </View>

      {/* CALENDAR */}
      <Text style={styles.sectionHeader}>Calendar</Text>
      <View style={styles.card}>
        {calPermitted ? (
          calendars.map((c) => (
            <View key={c.id} style={styles.calRow}>
              <View style={[styles.calColor, { backgroundColor: c.color }]} />
              <Text style={styles.calTitle}>{c.title}</Text>
              <Switch
                value={selectedCalIds.includes(c.id)}
                onValueChange={() => toggleCalendar(c.id)}
                trackColor={{ true: colors.accent }}
              />
            </View>
          ))
        ) : (
          <TouchableOpacity
            onPress={async () => {
              const granted = await requestCalendarPermission();
              setCalPermitted(granted);
            }}
          >
            <Text style={styles.actionBtnText}>Allow calendar access</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => Linking.openSettings()}>
          <Text style={[styles.actionBtnText, { marginTop: 8 }]}>Change permission in Settings</Text>
        </TouchableOpacity>
      </View>

      {/* STORAGE */}
      <Text style={styles.sectionHeader}>Storage</Text>
      <View style={styles.card}>
        <Row label="Records" value={`${recordCount} records`} />
        <Row label="Used space" value={`${usedMB} MB`} />
        <TouchableOpacity style={styles.actionBtn} onPress={clearAttachmentCache}>
          <Text style={styles.actionBtnText}>Clear deleted attachments</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 4, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6A5A',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  rowLabel: { fontSize: 14, color: '#7A6A5A' },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  dangerBtn: {
    margin: 12,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#FDE8D8',
    alignItems: 'center',
  },
  dangerBtnText: { color: '#8B3A00', fontWeight: '600', fontSize: 14 },
  actionBtn: { padding: 12 },
  actionBtnText: { fontSize: 14, color: colors.accent },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  calColor: { width: 12, height: 12, borderRadius: 6 },
  calTitle: { flex: 1, fontSize: 14, color: colors.text },
});
