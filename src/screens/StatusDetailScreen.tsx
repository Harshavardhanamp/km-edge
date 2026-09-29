import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGksProbe } from '../lib/gksProbe';
import { KEYS, get } from '../lib/secureStore';
import { useScreenTracking } from '../lib/useScreenTracking';

export default function StatusDetailScreen({ navigation }: any) {
  useScreenTracking('StatusDetailScreen');

  const { reachable, lastProbeAt } = useGksProbe();
  const [gksUrl, setGksUrl] = useState<string>('');

  useEffect(() => {
    get(KEYS.GKS_SERVER_URL).then((u) => setGksUrl(u ?? '—'));
  }, []);

  const probeLabel = lastProbeAt
    ? `Last checked ${relTime(lastProbeAt)}`
    : 'Checking…';

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
        <Text style={styles.value}>
          {reachable ? '🟢 Reachable' : '🔴 Unreachable'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Probe</Text>
        <Text style={styles.value}>{probeLabel}</Text>
      </View>

      <Text style={styles.note}>Sync status and pending count added in V2.</Text>
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
  note: { fontSize: 12, color: '#A09080', marginTop: 20 },
});
