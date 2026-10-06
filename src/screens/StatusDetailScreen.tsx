import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGksProbe } from '../lib/gksProbe';
import { KEYS, get } from '../lib/secureStore';
import { runSync } from '../lib/sync/syncEngine';
import { loadStatusSummary, retryDelta, type StatusSummary } from '../lib/sync/statusSummary';

export default function StatusDetailScreen({ navigation }: any) {
  const { reachable, lastProbeAt } = useGksProbe();
  const [gksUrl, setGksUrl] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<StatusSummary>({ waiting: 0, synced: 0, attention: [] });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [gksSyncedCount, setGksSyncedCount] = useState<number | null>(null);

  useEffect(() => {
    get(KEYS.GKS_SERVER_URL).then((u) => setGksUrl(u ?? '—'));
    loadData();
  }, []);

  function loadData() {
    setSummary(loadStatusSummary());
    get(KEYS.LAST_SYNCED_AT).then(v => setLastSyncedAt(v));
    get(KEYS.GKS_SYNCED_COUNT).then(v => setGksSyncedCount(v ? parseInt(v, 10) : null));
  }

  async function sync() {
    setSyncing(true);
    try {
      await runSync();
    } finally {
      setSyncing(false);
      loadData();
    }
  }

  async function handleRetry(seq: number) {
    retryDelta(seq);
    await sync();
  }

  const syncedCount = gksSyncedCount ?? summary.synced;
  const connection = reachable ? 'Connected' : 'Can’t reach Kashyap’s Knowledge';
  const checked = lastProbeAt ? ` · checked ${relTime(lastProbeAt)}` : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sync status</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.close}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Kashyap’s Knowledge</Text>
        <Text style={styles.value} numberOfLines={1}>{gksUrl}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Connection</Text>
        <Text style={styles.value}>{connection}{checked}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Last synced</Text>
        <Text style={styles.value}>{lastSyncedAt ? relTime(lastSyncedAt) : 'Never synced'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Waiting to sync ({summary.waiting})</Text>
        <Text style={styles.value}>{summary.waiting === 0 ? 'Nothing waiting' : `${summary.waiting} record${summary.waiting === 1 ? '' : 's'}`}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Synced</Text>
        <Text style={styles.value}>{`Synced ${syncedCount} record${syncedCount === 1 ? '' : 's'}`}</Text>
      </View>

      <TouchableOpacity
        style={[styles.syncBtn, (!reachable || syncing) && styles.syncBtnDisabled]}
        onPress={sync}
        disabled={!reachable || syncing}
        accessibilityRole="button"
      >
        {syncing
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.syncBtnText}>Sync now</Text>
        }
      </TouchableOpacity>

      {summary.attention.length > 0 && (
        <View style={styles.rejectedSection}>
          <Text style={styles.sectionHeader}>Needs attention ({summary.attention.length})</Text>
          {summary.attention.map(item => (
            <View key={item.key} style={styles.rejectedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rejectedTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rejectedError}>{item.sentence}</Text>
              </View>
              {item.retrySeq !== null && (
                <TouchableOpacity
                  style={[styles.retryBtn, syncing && styles.syncBtnDisabled]}
                  onPress={() => handleRetry(item.retrySeq!)}
                  disabled={syncing}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  contentContainer: { padding: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, color: colors.accent },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 14, color: '#7A6A5A' },
  value: { fontSize: 14, color: colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  syncBtn: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.4 },
  syncBtnText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  rejectedSection: { marginTop: 16 },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#5C4A38', marginBottom: 8 },
  rejectedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E8DDD0' },
  rejectedTitle: { fontSize: 14, color: '#3D2B1F', fontWeight: '500' },
  rejectedError: { fontSize: 12, color: '#D97706', marginTop: 2 },
  retryBtn: { backgroundColor: '#7C5C3E', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  retryBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});
