import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export type GksState = 'online' | 'syncing' | 'offline';

interface Props {
  gksState: GksState;
}

const STATE_MAP: Record<GksState, { dot: string; label: string }> = {
  online: { dot: '🟢', label: 'GKS' },
  syncing: { dot: '🟡', label: 'Syncing…' },
  offline: { dot: '🔴', label: 'Offline' },
};

export default function StatusDot({ gksState }: Props) {
  const navigation = useNavigation<any>();
  const { dot, label } = STATE_MAP[gksState];

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate('StatusDetail')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.text}>{dot} {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8 },
  text: { fontSize: 12, color: '#2D2016' },
});
