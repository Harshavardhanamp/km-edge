import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import { db } from '../lib/db/index';
import {
  getAllCalendars,
  getSelectedCalendarIds,
  saveSelectedCalendarIds,
  requestCalendarPermission,
  type DeviceCalendar,
} from '../lib/calendar';
import { KEYS, get, set } from '../lib/secureStore';
import { logout as gksLogout } from '../lib/gksClient';
import { useAuth } from '../context/AuthContext';
import { purgeAttachment } from '../lib/db/attachmentStore';

export default function SettingsScreen({ navigation }: any) {
  const { userId, displayName, logout } = useAuth();
  const [gksUrl, setGksUrl] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [deviceNameDraft, setDeviceNameDraft] = useState('');
  const [signedInUntil, setSignedInUntil] = useState<string | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [usedBytes, setUsedBytes] = useState(0);
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [selectedCalIds, setSelectedCalIds] = useState<string[]>([]);
  const [calPermitted, setCalPermitted] = useState(false);

  useEffect(() => {
    async function load() {
      const url = await get(KEYS.GKS_SERVER_URL);
      setGksUrl(url ?? '');
      const name = await get(KEYS.DEVICE_NAME);
      setDeviceName(name ?? '');
      const expiresAt = await get(KEYS.EDGE_TOKEN_EXPIRES_AT);
      if (expiresAt) {
        const d = new Date(expiresAt);
        setSignedInUntil(
          d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        );
      }
    }
    load();

    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM records WHERE is_deleted = 0`
    );
    setRecordCount(row?.n ?? 0);

    const blobDir = `${FileSystem.documentDirectory}attachments`;
    FileSystem.getInfoAsync(blobDir)
      .then((info) => { setUsedBytes((info as any).size ?? 0); })
      .catch(() => {});

    (async () => {
      const { status } = await import('expo-calendar').then((cal) =>
        cal.getCalendarPermissionsAsync()
      );
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

  async function saveDeviceName() {
    const name = deviceNameDraft.trim();
    if (!name) return;
    await set(KEYS.DEVICE_NAME, name);
    setDeviceName(name);
    setEditingDeviceName(false);
  }

  async function handleLogout() {
    Alert.alert('Log out?', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          const baseUrl = await get(KEYS.GKS_SERVER_URL);
          if (baseUrl) await gksLogout(baseUrl);
          await logout();
        },
      },
    ]);
  }

  async function clearAttachmentCache() {
    Alert.alert(
      'Clear deleted attachments?',
      'Only confirmed-deleted attachments will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const baseUrl = await get(KEYS.GKS_SERVER_URL);
            if (!baseUrl) { Alert.alert('No server configured'); return; }
            const candidates = db.getAllSync<{
              edge_attachment_id: string;
              gks_record_id: string | null;
              delete_seq: number;
            }>(
              `SELECT a.edge_attachment_id, d.gks_id AS gks_record_id, d.seq AS delete_seq
               FROM attachments a
               JOIN delta_log d ON d.seq = a.delete_delta_seq
               WHERE a.pending_delete = 1 AND d.status = 'ACKNOWLEDGED'`
            );
            if (candidates.length === 0) { Alert.alert('Nothing to clear'); return; }
            let purged = 0;
            for (const c of candidates) {
              if (c.gks_record_id) {
                try {
                  const token = await get(KEYS.EDGE_TOKEN);
                  const res = await fetch(`${baseUrl}/api/v1/records/${c.gks_record_id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                  if (res && res.status !== 200 && res.status !== 404) continue;
                } catch { continue; }
              }
              await purgeAttachment(c.edge_attachment_id);
              purged++;
            }
            Alert.alert('Done', `Removed ${purged} attachment blob${purged !== 1 ? 's' : ''}.`);
          },
        },
      ]
    );
  }

  const usedMB = (usedBytes / 1024 / 1024).toFixed(1);

  return (
    <View style={styles.outer}>
      <AppHeader title="Settings" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.card}>
          <Row label="Name" value={displayName || userId} />
          {signedInUntil && <Row label="Signed in until" value={signedInUntil} />}
          {editingDeviceName ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.deviceNameInput}
                value={deviceNameDraft}
                onChangeText={setDeviceNameDraft}
                placeholder="Device name"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveDeviceName}
              />
              <TouchableOpacity onPress={saveDeviceName}>
                <Text style={styles.saveLink}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setDeviceNameDraft(deviceName);
                setEditingDeviceName(true);
              }}
            >
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Device name</Text>
                <Text style={[styles.rowValue, { color: colors.accent }]}>
                  {deviceName || 'Tap to set'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.dangerBtn} onPress={handleLogout}>
            <Text style={styles.dangerBtnText}>Log out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>GKS Server</Text>
        <View style={styles.card}>
          <Row label="URL" value={gksUrl || '—'} />
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Auth', { screen: 'ServerDiscovery' })}
          >
            <Text style={styles.actionBtnText}>Change server</Text>
          </TouchableOpacity>
        </View>

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
            <Text style={[styles.actionBtnText, { marginTop: 8 }]}>
              Change permission in Settings
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>Storage</Text>
        <View style={styles.card}>
          <Row label="Records" value={`${recordCount} records`} />
          <Row label="Used space" value={`${usedMB} MB`} />
          <TouchableOpacity style={styles.actionBtn} onPress={clearAttachmentCache}>
            <Text style={styles.actionBtnText}>Clear deleted attachments</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('HowSyncing')}
          >
            <Text style={styles.actionBtnText}>How syncing works</Text>
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
  rowValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  deviceNameInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF',
  },
  saveLink: { color: colors.accent, fontWeight: '600', fontSize: 14 },
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
