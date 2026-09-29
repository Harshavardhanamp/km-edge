import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGksProbe } from '../lib/gksProbe';
import { db } from '../lib/db/index';
import { KEYS, get } from '../lib/secureStore';
import { runSync, type SyncResult } from '../lib/sync/syncEngine';
import { useScreenTracking } from '../lib/useScreenTracking';

export default function StatusDetailScreen({ navigation }: any) {
  useScreenTracking('StatusDetailScreen');

  const { reachable, lastProbeAt } = useGksProbe();
  const [gksUrl, setGksUrl] = useState<string>('');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    get(KEYS.GKS_SERVER_URL).then((u) => setGksUrl(u ?? '—'));
    refreshPending();
  }, []);

  function refreshPending() {
    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM delta_log WHERE status = 'PENDING'`
    );
    setPendingCount(row?.n ?? 0);
  }

  async function handleSync() {
    setSyncing(true);
    const result = await runSync();
    setLastResult(result);
    setSyncing(false);
    refreshPending();
  }

  const probeLabel = lastProbeAt ? `Last checked ${relTime(lastProbeAt)}` : 'Checking…';

  return (
    <View style={styles.container}>
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
    </View>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

const colors = { bg: '#FDF8F4', accent: '#C17A3A', text: '#2D2016', border: '#E0D0C0' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24 },
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
});
