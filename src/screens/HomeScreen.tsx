import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, SafeAreaView, ScrollView,
} from 'react-native';
import { CAPTURE_TYPES, type EdgeRecord } from '../lib/types';

// Placeholder until real store is wired
const MOCK_RECENT: Pick<EdgeRecord, 'edge_id' | 'capture_kind' | 'title' | 'captured_at' | 'sync_status'>[] = [
  { edge_id: '1', capture_kind: 'JOURNAL',  title: 'Morning reflection',   captured_at: new Date(Date.now() - 2 * 3600_000).toISOString(), sync_status: 'ACKNOWLEDGED' },
  { edge_id: '2', capture_kind: 'DECISION', title: 'Chose new laptop',      captured_at: new Date(Date.now() - 26 * 3600_000).toISOString(), sync_status: 'PENDING' },
  { edge_id: '3', capture_kind: 'EVENT',    title: 'Team offsite',          captured_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), sync_status: 'ACKNOWLEDGED' },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

function iconFor(capture_kind: EdgeRecord['capture_kind']): string {
  return CAPTURE_TYPES.find(t => t.capture_kind === capture_kind)?.icon ?? '📄';
}

export default function HomeScreen() {
  const [pickerVisible, setPickerVisible] = useState(false);

  const openPicker = useCallback(() => setPickerVisible(true), []);
  const closePicker = useCallback(() => setPickerVisible(false), []);

  // TODO: wire to real GKS probe
  const gksOnline = true;
  const lastSynced = '10m ago';
  const pendingCount = MOCK_RECENT.filter(r => r.sync_status === 'PENDING').length;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.userName}>👤 Harsha</Text>
        <Text style={s.syncStatus}>
          {gksOnline
            ? `🟢 GKS · ${lastSynced}`
            : `🔴 Offline · ${pendingCount} pending`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {/* Capture button */}
        <TouchableOpacity style={s.captureBtn} onPress={openPicker} activeOpacity={0.85}>
          <Text style={s.captureBtnText}>+ New Record</Text>
        </TouchableOpacity>

        {/* Upcoming — placeholder until expo-calendar is wired */}
        <Text style={s.sectionHeader}>Upcoming</Text>
        <View style={s.card}>
          <Text style={s.placeholder}>Calendar permission not yet requested</Text>
        </View>

        {/* Recent records */}
        <Text style={s.sectionHeader}>Recent</Text>
        {MOCK_RECENT.map(r => (
          <View key={r.edge_id} style={s.recordRow}>
            <Text style={s.recordIcon}>{iconFor(r.capture_kind)}</Text>
            <View style={s.recordMeta}>
              <Text style={s.recordTitle} numberOfLines={1}>{r.title}</Text>
              <Text style={s.recordTime}>{relativeTime(r.captured_at)}</Text>
            </View>
            {r.sync_status === 'PENDING' && <Text style={s.pendingDot}>●</Text>}
          </View>
        ))}
        <TouchableOpacity>
          <Text style={s.seeAll}>See all records →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Type picker bottom sheet */}
      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={closePicker}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={closePicker} />
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>What are you capturing?</Text>
          <View style={s.typeGrid}>
            {CAPTURE_TYPES.map(t => (
              <TouchableOpacity
                key={t.capture_kind}
                style={s.typeBtn}
                onPress={() => {
                  closePicker();
                  // TODO: navigate to record creation screen with type pre-selected
                }}
              >
                <Text style={s.typeIcon}>{t.icon}</Text>
                <Text style={s.typeLabel}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={closePicker} style={s.cancelBtn}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#fff' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  userName:      { fontSize: 15, fontWeight: '600' },
  syncStatus:    { fontSize: 12, color: '#555' },
  body:          { padding: 16, gap: 8 },
  captureBtn:    { backgroundColor: '#1a73e8', borderRadius: 12, paddingVertical: 18, alignItems: 'center', marginBottom: 8 },
  captureBtnText:{ color: '#fff', fontSize: 17, fontWeight: '700' },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  card:          { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12 },
  placeholder:   { color: '#aaa', fontSize: 13 },
  recordRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  recordIcon:    { fontSize: 20, marginRight: 10 },
  recordMeta:    { flex: 1 },
  recordTitle:   { fontSize: 15 },
  recordTime:    { fontSize: 12, color: '#888', marginTop: 2 },
  pendingDot:    { color: '#f59e0b', fontSize: 10 },
  seeAll:        { color: '#1a73e8', fontSize: 13, marginTop: 12 },
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet:         { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24 },
  sheetTitle:    { fontSize: 16, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  typeGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  typeBtn:       { width: '40%', alignItems: 'center', backgroundColor: '#f5f7ff', borderRadius: 10, padding: 16, gap: 6 },
  typeIcon:      { fontSize: 28 },
  typeLabel:     { fontSize: 13, fontWeight: '600' },
  cancelBtn:     { marginTop: 20, alignItems: 'center' },
  cancelText:    { color: '#888', fontSize: 15 },
});
