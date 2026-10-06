import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGksProbe } from '../lib/gksProbe';
import { db } from '../lib/db/index';
import { KEYS, get } from '../lib/secureStore';
import { runSync, type SyncResult } from '../lib/sync/syncEngine';

export default function StatusDetailScreen({ navigation }: any) {
  const { reachable, lastProbeAt } = useGksProbe();
  const [gksUrl, setGksUrl] = useState<string>('');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [gksSyncedCount, setGksSyncedCount] = useState<number | null>(null);

  interface RejectedDelta {
    seq: number;
    title: string;
    gks_error: string | null;
    edge_id: string;
  }
  const [rejectedDeltas, setRejectedDeltas] = useState<RejectedDelta[]>([]);

  useEffect(() => {
    get(KEYS.GKS_SERVER_URL).then((u) => setGksUrl(u ?? '—'));
    loadData();
  }, []);

  function loadData() {
    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM delta_log WHERE status = 'PENDING'`
    );
    setPendingCount(row?.n ?? 0);

    const rows = db.getAllSync<RejectedDelta>(
      `SELECT d.seq, r.title, d.gks_error, d.edge_id
       FROM delta_log d
       JOIN records r ON r.edge_id = d.edge_id
       WHERE d.status = 'REJECTED'
       ORDER BY d.seq ASC`
    );
    setRejectedDeltas(rows);

    get(KEYS.LAST_SYNCED_AT).then(v => setLastSyncedAt(v));
    get(KEYS.GKS_SYNCED_COUNT).then(v => setGksSyncedCount(v ? parseInt(v, 10) : null));
  }

  async function handleRetry(seq: number) {
    db.runSync(
      `UPDATE delta_log SET status = 'PENDING', retry_count = 0, gks_error = NULL WHERE seq = ?`,
      seq
    );
    await runSync();
    loadData();
  }

  async function handleSync() {
    setSyncing(true);
    const result = await runSync();
    setLastResult(result);
    setSyncing(false);
    loadData();
  }

  const probeLabel = lastProbeAt ? `Last checked ${relTime(lastProbeAt)}` : 'Checking…';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GKS Status</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.close}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Server</Text>
        <Text style={styles.value} numberOfLines={1}>{gksUrl}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{reachable ? '🟢 Reachable' : '🔴 Unreachable'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Probe</Text>
        <Text style={styles.value}>{probeLabel}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Pending deltas</Text>
        <Text style={styles.value}>{pendingCount}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Last synced</Text>
        <Text style={styles.value}>{lastSyncedAt ? relTime(lastSyncedAt) : 'Never'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Synced to GKS</Text>
        <Text style={styles.value}>{gksSyncedCount ?? '—'}</Text>
      </View>

      {lastResult && (
        <View style={styles.row}>
          <Text style={styles.label}>Last sync</Text>
          <Text style={styles.value}>
            {lastResult.synced} synced · {lastResult.failed} failed · {lastResult.telemetryFlushed} events sent
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.syncBtn, (!reachable || syncing) && styles.syncBtnDisabled]}
        onPress={handleSync}
        disabled={!reachable || syncing}
      >
        {syncing
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.syncBtnText}>Sync now</Text>
        }
      </TouchableOpacity>

      {rejectedDeltas.length > 0 && (
        <View style={styles.rejectedSection}>
          <Text style={styles.sectionHeader}>Failed Records</Text>
          {rejectedDeltas.map(d => (
            <View key={d.seq} style={styles.rejectedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rejectedTitle} numberOfLines={1}>{d.title}</Text>
                <Text style={styles.rejectedError}>{d.gks_error ?? 'Unknown error'}</Text>
              </View>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => handleRetry(d.seq)}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
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
